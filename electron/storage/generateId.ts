/**
 * Collision-safe, monotonically increasing numeric id generator shared by
 * every offline JSON-queue file in `electron/database/` (`orders.ts`,
 * `returns.ts`, `posShifts.ts`).
 *
 * These queues previously computed `id = Date.now()` independently, AFTER
 * their write-lock had already handed out a turn. The lock only serializes
 * the read-modify-write of the file — it does not make `Date.now()` unique.
 * Two saves landing in the same millisecond (two quick POS submissions, an
 * order and a return created back-to-back, etc.) produced the same id, and
 * `markOrderAsSynced`/`deleteOrder` (and the pos-shift equivalents), which
 * key off `Array.findIndex`/`filter` by id, then acted ambiguously on the
 * colliding pair (see T-0022).
 *
 * `generateId()` fixes this while deliberately keeping the return type a
 * plain `number`:
 * - it stays sortable by creation order, like the old `Date.now()` ids were
 *   (though every queue already also stores a separate `createdAt` ISO
 *   string, so nothing actually depends on this — it's preserved anyway as a
 *   free property of the monotonic-counter approach).
 * - it stays within `Number.MAX_SAFE_INTEGER` for millennia at real POS
 *   volumes, so no caller needs to change how it stores/compares/types ids.
 * - a single module-level counter shared by all three queue files also
 *   guarantees uniqueness *across* the three queues, not just within one,
 *   in case they ever need to interoperate (e.g. correlating an order id and
 *   a return id in the same log/report).
 *
 * Mechanism: track the last-issued id in module state. Each call issues
 * `max(Date.now(), lastIssuedId + 1)`, so ids are always strictly
 * increasing — even for calls that land in the same millisecond, or (in the
 * rare case of a backward system-clock adjustment) calls where `Date.now()`
 * goes backwards relative to the previous call.
 */
let lastIssuedId = 0;

export function generateId(): number {
  const now = Date.now();
  const next = now > lastIssuedId ? now : lastIssuedId + 1;
  lastIssuedId = next;
  return next;
}
