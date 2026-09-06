import { describe, it, expect, beforeEach } from 'vitest';
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

  // ─── KNOWN LIVE BUG — see final QA report for T-0013 ──────────────────────
  //
  // The coordinator only serializes catalog-before-accounting for whichever
  // task was already *pending* at the moment `runQueued()` transitions
  // `_isRunning` from false to true. Because `scheduleCatalogSync` and
  // `scheduleAccountingSync` each independently call `runQueued()`, if
  // `scheduleAccountingSync` happens to run first in a given synchronous turn
  // (e.g. two listeners reacting to the same "online" event, with the
  // accounting listener registered/invoked first) `runQueued` captures
  // accounting as the only pending task, starts it immediately, and a
  // same-turn `scheduleCatalogSync` call right after is left pending until
  // the *next* cycle — i.e. catalog runs AFTER accounting has already fully
  // completed, not before it. This violates the documented FK-race-avoidance
  // invariant. Reported to tech-lead / the owning dev agent rather than fixed
  // here (out of QA scope). `it.fails` keeps the suite green while still
  // asserting the desired behavior: if this ever starts passing (i.e. someone
  // fixes the ordering bug), this test will itself start failing as a signal
  // to convert it to a normal, permanent regression test.
  it.fails(
    'BUG (T-0013): ordering guarantee is violated when accounting is scheduled a tick before catalog',
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
});
