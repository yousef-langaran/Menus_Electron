import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scheduleCatalogSync, scheduleAccountingSync } from '../syncCoordinator';

/**
 * syncCoordinator.ts deliberately serializes catalog-sync before accounting-sync
 * to avoid FK races (accounting rows can reference catalog rows created offline
 * with temporary negative IDs — see the `electron-offline-sync` skill). These
 * tests protect that invariant.
 *
 * syncCoordinator holds its scheduling state in module-level variables, so we
 * drive it purely through its two exported schedule functions and observe an
 * externally-recorded order of start/end events — there is nothing to reset
 * between tests beyond letting any scheduled task settle.
 */

/** A controllable async task: does not resolve until you call its returned `resolve()`. */
function deferredTask(name: string, order: string[]) {
  let resolveFn!: () => void;
  const promise = new Promise<void>((res) => {
    resolveFn = () => {
      order.push(`${name}-end`);
      res();
    };
  });
  const task = () => {
    order.push(`${name}-start`);
    return promise;
  };
  return { task, resolve: () => resolveFn() };
}

async function flush(times = 2) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

describe('syncCoordinator ordering guarantee', () => {
  let order: string[];

  beforeEach(() => {
    order = [];
  });

  it('runs a scheduled catalog sync to completion before starting a scheduled accounting sync', async () => {
    const cat = deferredTask('cat', order);
    const acc = deferredTask('acc', order);

    scheduleCatalogSync(cat.task);
    scheduleAccountingSync(acc.task);

    await flush();
    // Catalog must have started; accounting must NOT have started yet.
    expect(order).toEqual(['cat-start']);

    cat.resolve();
    await flush();
    // Catalog finished, and only now does accounting start.
    expect(order).toEqual(['cat-start', 'cat-end', 'acc-start']);

    acc.resolve();
    await flush();
    expect(order).toEqual(['cat-start', 'cat-end', 'acc-start', 'acc-end']);
  });

  it('queues a second accounting request that arrives while catalog is still running, and still runs it after catalog', async () => {
    const cat = deferredTask('cat', order);
    const acc = deferredTask('acc', order);

    scheduleCatalogSync(cat.task);
    await flush();
    expect(order).toEqual(['cat-start']);

    // Accounting is requested mid-flight, while catalog has not resolved yet.
    scheduleAccountingSync(acc.task);
    await flush();
    // Still must not have started — catalog has not finished.
    expect(order).toEqual(['cat-start']);

    cat.resolve();
    await flush();
    expect(order).toEqual(['cat-start', 'cat-end', 'acc-start']);

    acc.resolve();
    await flush();
    expect(order.at(-1)).toBe('acc-end');
  });

  it('coalesces a newly-scheduled catalog sync that arrives while a previous cycle is still finishing accounting', async () => {
    const cat1 = deferredTask('cat1', order);
    const acc1 = deferredTask('acc1', order);
    const cat2 = deferredTask('cat2', order);

    scheduleCatalogSync(cat1.task);
    scheduleAccountingSync(acc1.task);
    await flush();
    cat1.resolve();
    await flush();
    expect(order).toEqual(['cat1-start', 'cat1-end', 'acc1-start']);

    // A brand new catalog sync gets scheduled before the first cycle's
    // accounting step has resolved.
    scheduleCatalogSync(cat2.task);
    await flush();
    // cat2 must not preempt the in-flight accounting run.
    expect(order).toEqual(['cat1-start', 'cat1-end', 'acc1-start']);

    acc1.resolve();
    await flush();
    expect(order).toEqual(['cat1-start', 'cat1-end', 'acc1-start', 'acc1-end', 'cat2-start']);

    cat2.resolve();
    await flush();
    expect(order.at(-1)).toBe('cat2-end');
  });

  // ─── FIXED (T-0021) — regression test for the ordering race ───────────────
  //
  // Previously the coordinator only serialized catalog-before-accounting for
  // whichever task was already *pending* at the moment `runQueued()`
  // transitioned `_isRunning` from false to true. Because `scheduleCatalogSync`
  // and `scheduleAccountingSync` each independently triggered `runQueued()`
  // synchronously, if `scheduleAccountingSync` happened to run first in a
  // given synchronous turn (e.g. two listeners reacting to the same "online"
  // event, or two sibling mount-time useEffects, with the accounting one
  // registered/invoked first) `runQueued` captured accounting as the only
  // pending task, started it immediately, and a same-turn
  // `scheduleCatalogSync` call right after was left pending until the *next*
  // cycle — i.e. catalog ran AFTER accounting had already fully completed,
  // not before it. This violated the documented FK-race-avoidance invariant.
  //
  // Fixed by deferring the actual dequeue-and-start decision in `runQueued()`
  // to a microtask, so both scheduling calls in the same synchronous turn are
  // guaranteed to have registered their pending task before either is ever
  // inspected — this is a structural guarantee of the JS run-to-completion
  // model, not a timing-dependent delay.
  it(
    'FIXED (T-0021): ordering guarantee holds when accounting is scheduled a tick before catalog',
    async () => {
      const acc = deferredTask('acc', order);
      const cat = deferredTask('cat', order);

      // Accounting scheduled FIRST, catalog scheduled immediately after —
      // both in the same synchronous turn, no await between them.
      scheduleAccountingSync(acc.task);
      scheduleCatalogSync(cat.task);

      await flush();
      // Desired behavior: catalog should already be running (or at least
      // accounting should not have started) regardless of call order.
      expect(order).not.toContain('acc-start');
      expect(order).toContain('cat-start');

      // Drain whatever actually got scheduled so the module doesn't leak a
      // pending task into later tests.
      acc.resolve();
      cat.resolve();
      await flush(4);
    },
  );

  // ─── RESIDUAL LIMITATION (T-0025) — cross-macrotask interleaving ─────────
  //
  // T-0021's fix above only guarantees ordering when both schedule*Sync
  // calls happen in the *same synchronous turn* (see the comment block in
  // syncCoordinator.ts). It does NOT cover AccountingSyncManager's 30s
  // `setInterval` and CatalogSyncManager's 60s `setInterval` firing as two
  // independent macrotasks: if the accounting interval fires first with no
  // catalog task pending, `runQueued()` correctly starts accounting right
  // away (there is nothing to serialize against yet); if the catalog
  // interval then fires moments later, while accounting's task is still
  // awaiting a real promise, catalog is left pending and only runs *after*
  // accounting has already fully completed. This test reproduces that exact
  // interleaving with fake timers standing in for the two independent
  // `setInterval`s, and documents the actual (still-open) current behavior.
  // It is expected to keep PASSING — it is a characterization test of a
  // known, narrow, non-production-observed gap, not a claim that the
  // ordering guarantee is absolute. Do not "fix" this test by changing its
  // expectations without first closing the gap in syncCoordinator.ts itself
  // (see the T-0025 comment there) and updating this test to match.
  it('KNOWN LIMITATION (T-0025): a catalog sync whose independent timer interval fires while accounting is already in-flight still runs AFTER accounting, not before', async () => {
    vi.useFakeTimers();
    try {
      const acc = deferredTask('acc', order);
      const cat = deferredTask('cat', order);

      // Simulate AccountingSyncManager's interval firing in isolation: no
      // catalog task is pending yet, so accounting starts immediately, per
      // its own contract — this alone is correct, expected behavior.
      setTimeout(() => scheduleAccountingSync(acc.task), 0);
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      expect(order).toEqual(['acc-start']);

      // Simulate CatalogSyncManager's independent interval firing a few
      // milliseconds later, while accounting's task is still in-flight
      // (awaiting a real, unresolved promise) — the cross-macrotask race
      // described in T-0025.
      setTimeout(() => scheduleCatalogSync(cat.task), 5);
      await vi.advanceTimersByTimeAsync(5);
      await flush();

      // Catalog is now pending, but cannot preempt the accounting run that
      // has already started — runQueued() won't re-inspect _pendingCatalog
      // until accounting's own `finally` block re-invokes it.
      expect(order).toEqual(['acc-start']);

      acc.resolve();
      await flush();
      // Catalog only starts once accounting has already fully completed.
      // This is the residual ordering violation T-0025 tracks: it is
      // documented and scoped, not silently swallowed.
      expect(order).toEqual(['acc-start', 'acc-end', 'cat-start']);

      cat.resolve();
      await flush();
      expect(order.at(-1)).toBe('cat-end');
    } finally {
      vi.useRealTimers();
    }
  });
});
