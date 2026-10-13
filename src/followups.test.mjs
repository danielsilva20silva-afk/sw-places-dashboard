// Unit tests for the follow-up cadence engine. Run: node src/followups.test.mjs
import assert from "node:assert/strict";
import { computeFollowup } from "./followups.js";
import { compareActions } from "./actions.js";

const DAY = 86400000;
// Fixed "now": 2026-10-12 12:00 Lisbon-ish. Use a midday instant to avoid TZ edge.
const NOW = Date.UTC(2026, 9, 12, 11, 0); // 11:00 UTC = 12:00 Lisbon (WEST)
// Pin a far-past reset for the cadence tests so the launch floor is inert here;
// the reset-floor behavior is covered by its own block below.
const opts = { now: NOW, resetDate: "2000-01-01" };
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();
let n = 0; const ok = (name) => { n++; console.log("✓", name); };

// A: 7-day cadence. Last contacted 8 days ago → overdue.
{
  const fu = computeFollowup({ classification: "A", created_at: daysAgo(40), manual_notes: `[01/10/2026 10:00] called` }, [], opts);
  // note 01/10 is 11 days before 12/10 → overdue for A(7)
  assert.equal(fu.reason, "cadence");
  assert.equal(fu.isOverdue, true);
  assert.equal(fu.isDueToday, false);
  ok("A cadence overdue from note timestamp");
}
// A: contacted exactly 7 days ago → due today.
{
  const fu = computeFollowup({ classification: "A", created_at: daysAgo(30), manual_notes: "", }, [{ done: true, done_at: daysAgo(7) }], opts);
  assert.equal(fu.isDueToday, true, `expected due today, got ${JSON.stringify(fu)}`);
  assert.equal(fu.isOverdue, false);
  ok("A cadence due today from completed action (7d)");
}
// B: 28 days. Contacted 10 days ago → not due yet.
{
  const fu = computeFollowup({ classification: "B", manual_notes: "", created_at: daysAgo(100) }, [{ done: true, done_at: daysAgo(10) }], opts);
  assert.equal(fu.isOverdue, false);
  assert.equal(fu.isDueToday, false);
  assert.equal(fu.cadenceDays, 28);
  ok("B cadence not yet due");
}
// C: 75 days. Contacted 80 days ago → overdue by 5.
{
  const fu = computeFollowup({ classification: "C", manual_notes: "", created_at: daysAgo(200) }, [{ done: true, done_at: daysAgo(80) }], opts);
  assert.equal(fu.isOverdue, true);
  assert.equal(fu.daysOverdue, 5);
  ok("C cadence overdue by 5 days");
}
// Unclassified: 48h from creation. Created 3 days ago, no contact → overdue "classify".
{
  const fu = computeFollowup({ classification: "", created_at: daysAgo(3), manual_notes: "" }, [], opts);
  assert.equal(fu.reason, "classify");
  assert.equal(fu.isOverdue, true);
  ok("unclassified 48h overdue → classify");
}
// Unclassified created ~today → not yet due (within 48h).
{
  const fu = computeFollowup({ classification: "", created_at: new Date(NOW - 3600000).toISOString(), manual_notes: "" }, [], opts);
  assert.equal(fu.reason, "classify");
  assert.equal(fu.isOverdue, false);
  ok("unclassified within 48h not overdue");
}
// Pending action override: A would be overdue, but a pending action due in 3 days wins.
{
  const fu = computeFollowup(
    { classification: "A", created_at: daysAgo(40), manual_notes: "[01/10/2026 10:00] called" },
    [{ done: false, due_at: new Date(NOW + 3 * DAY).toISOString() }],
    opts
  );
  assert.equal(fu.reason, "scheduled");
  assert.equal(fu.overridden, true);
  assert.equal(fu.isOverdue, false);
  assert.equal(fu.isDueToday, false);
  ok("pending action due date overrides cadence");
}
// Pending action due today wins.
{
  const fu = computeFollowup(
    { classification: "C", created_at: daysAgo(10), manual_notes: "" },
    [{ done: false, due_at: new Date(NOW).toISOString() }],
    opts
  );
  assert.equal(fu.isDueToday, true);
  assert.equal(fu.overridden, true);
  ok("pending action due today");
}
// Closed / Lost never due.
for (const status of ["Closed", "Lost"]) {
  const fu = computeFollowup({ classification: "A", status, created_at: daysAgo(400), manual_notes: "" }, [{ done: true, done_at: daysAgo(400) }], opts);
  assert.equal(fu.reason, "terminal");
  assert.equal(fu.isOverdue, false);
  assert.equal(fu.isDueToday, false);
  assert.equal(fu.nextFollowUp, null);
  ok(`${status} never due`);
}
// No-contact fallback to creation date: A, never contacted, created 10 days ago → overdue (7).
{
  const fu = computeFollowup({ classification: "A", created_at: daysAgo(10), manual_notes: "" }, [], opts);
  assert.equal(fu.lastContacted, null);
  assert.equal(fu.isOverdue, true);
  ok("no-contact fallback to creation date");
}
// Overdue vs due-today boundary for A (7): contacted 6d ago → future (not due); 7d → today; 8d → overdue.
{
  const f6 = computeFollowup({ classification: "A", manual_notes: "", created_at: daysAgo(30) }, [{ done: true, done_at: daysAgo(6) }], opts);
  const f7 = computeFollowup({ classification: "A", manual_notes: "", created_at: daysAgo(30) }, [{ done: true, done_at: daysAgo(7) }], opts);
  const f8 = computeFollowup({ classification: "A", manual_notes: "", created_at: daysAgo(30) }, [{ done: true, done_at: daysAgo(8) }], opts);
  assert.equal(f6.isDueToday || f6.isOverdue, false);
  assert.equal(f7.isDueToday, true);
  assert.equal(f8.isOverdue, true);
  ok("overdue vs due-today boundary (6/7/8 days)");
}
// lastContacted picks the max of notes vs completed action.
{
  const fu = computeFollowup({ classification: "B", created_at: daysAgo(60), manual_notes: "[01/09/2026 09:00] old note" }, [{ done: true, done_at: daysAgo(2) }], opts);
  assert.equal(fu.lastContacted, NOW - 2 * DAY, "latest should be the 2-day-ago action");
  ok("lastContacted = max(note, completed action)");
}

// ── Cadence reset floor ──
// Reset = 2026-10-13; "now" = 2026-10-25 12:00 Lisbon unless stated.
const RESET = "2026-10-13";
const utc = (y, mo, d, h = 11, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);
const ropts = (nowMs) => ({ now: nowMs, resetDate: RESET });
const OCT25 = utc(2026, 10, 25);
{
  // A, contacted + created BEFORE reset → baseline lifted to reset (Oct13) → +7 = Oct20 → overdue by 5 on Oct25.
  const fu = computeFollowup({ classification: "A", created_at: "2026-05-01T09:00:00Z", manual_notes: "[01/09/2026 10:00] called" }, [], ropts(OCT25));
  assert.equal(fu.isOverdue, true);
  assert.equal(fu.daysOverdue, 5, `expected 5, got ${fu.daysOverdue}`);
  ok("reset floor: A baseline lifted to reset (overdue by 5)");
}
{
  // B (28) from reset → Oct13 + 28 = Nov10 → not due on Oct25.
  const fu = computeFollowup({ classification: "B", created_at: "2026-01-01T00:00:00Z", manual_notes: "" }, [], ropts(OCT25));
  assert.equal(fu.isOverdue, false);
  assert.equal(fu.isDueToday, false);
  ok("reset floor: B from reset not yet due");
}
{
  // Unclassified older than reset → 48h from reset (Oct15), overdue on Oct25.
  const fu = computeFollowup({ classification: "", created_at: "2026-05-01T09:00:00Z", manual_notes: "" }, [], ropts(OCT25));
  assert.equal(fu.reason, "classify");
  assert.equal(fu.isOverdue, true);
  ok("reset floor: unclassified 48h from reset (overdue)");
}
{
  // Unclassified, now = Oct14 (reset+1, within the 48h) → not yet due.
  const fu = computeFollowup({ classification: "", created_at: "2026-05-01T09:00:00Z", manual_notes: "" }, [], ropts(utc(2026, 10, 14)));
  assert.equal(fu.isOverdue, false);
  assert.equal(fu.isDueToday, false);
  ok("reset floor: unclassified within 48h of reset not overdue");
}
{
  // Created AFTER reset → uses its OWN creation (Oct20), not the reset. A+7 = Oct27 → not due on Oct25.
  // (If it had floored to reset, Oct13+7=Oct20 would be overdue on Oct25.)
  const fu = computeFollowup({ classification: "A", created_at: "2026-10-20T09:00:00Z", manual_notes: "" }, [], ropts(OCT25));
  assert.equal(fu.isOverdue, false, "lead created after reset must use its own creation date");
  ok("reset floor: lead created after reset uses own creation date");
}
{
  // Last contact AFTER reset (Oct24) → floor does NOT push it back. A+7 = Oct31 → not due on Oct25.
  const fu = computeFollowup({ classification: "A", created_at: "2026-01-01T00:00:00Z", manual_notes: "" }, [{ done: true, done_at: "2026-10-24T09:00:00Z" }], ropts(OCT25));
  assert.equal(fu.isOverdue, false, "a contact newer than the reset must win over the floor");
  ok("reset floor: newer last-contact kept (floor only lifts older)");
}
{
  // Pending scheduled action still overrides everything, floor irrelevant.
  const fu = computeFollowup(
    { classification: "A", created_at: "2026-05-01T09:00:00Z", manual_notes: "[01/09/2026 10:00] called" },
    [{ done: false, due_at: "2026-10-30T10:00:00Z" }],
    ropts(OCT25)
  );
  assert.equal(fu.reason, "scheduled");
  assert.equal(fu.overridden, true);
  assert.equal(fu.isOverdue, false);
  ok("reset floor: pending action override unaffected");
}
{
  // Default reset constant is wired when opts.resetDate is omitted.
  const fu = computeFollowup({ classification: "A", created_at: "2026-05-01T09:00:00Z", manual_notes: "" }, [], { now: OCT25 });
  assert.equal(fu.isOverdue, true); // default reset 2026-10-13 → Oct20 → overdue on Oct25
  ok("reset floor: default CADENCE_RESET_DATE applies when opts.resetDate omitted");
}

// ── Shared comparator / nextAction (Due today ↔ Actions card parity) ──
{
  // compareActions: due_at asc, then created_at asc, then id.
  const a = { due_at: "2026-10-13T11:00:00Z", created_at: "2026-10-01T00:00:00Z", id: "x" };
  const b = { due_at: "2026-10-13T11:00:00Z", created_at: "2026-10-02T00:00:00Z", id: "a" };
  assert.ok(compareActions(a, b) < 0, "earlier created_at wins on equal due_at");
  // a.id 'x' vs c.id 'b' with equal due_at + equal created_at → id tie-break: 'b' < 'x'.
  const c = { due_at: "2026-10-13T11:00:00Z", created_at: "2026-10-01T00:00:00Z", id: "b" };
  assert.ok(compareActions(a, c) > 0, "id tie-break: 'b' before 'x'");
  const earlier = { due_at: "2026-10-13T10:00:00Z", created_at: "2099-01-01", id: "z" };
  assert.ok(compareActions(earlier, a) < 0, "earlier due_at always wins");
  ok("compareActions: due_at → created_at → id");
}
{
  // computeFollowup picks the lead's winning pending action by the shared
  // comparator and exposes it as nextAction (nextFollowUp = its due_at).
  const pendingLater = { done: false, due_at: "2026-10-13T11:00:00Z", created_at: "2026-10-05", id: "later" };
  const pendingEarlierCreated = { done: false, due_at: "2026-10-13T11:00:00Z", created_at: "2026-10-01", id: "early" };
  const fu = computeFollowup(
    { classification: "A", created_at: "2026-05-01", manual_notes: "" },
    [pendingLater, pendingEarlierCreated],
    { now: utc(2026, 10, 13, 9), resetDate: RESET }
  );
  assert.equal(fu.overridden, true);
  assert.equal(fu.nextAction.id, "early", "same due_at → earlier created_at action chosen");
  assert.equal(fu.nextFollowUp, new Date("2026-10-13T11:00:00Z").getTime());
  ok("nextAction = winning pending action via shared comparator");
}

console.log(`\nALL ${n} TESTS PASSED ✓`);
