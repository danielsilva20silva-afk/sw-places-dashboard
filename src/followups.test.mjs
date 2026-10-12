// Unit tests for the follow-up cadence engine. Run: node src/followups.test.mjs
import assert from "node:assert/strict";
import { computeFollowup } from "./followups.js";

const DAY = 86400000;
// Fixed "now": 2026-10-12 12:00 Lisbon-ish. Use a midday instant to avoid TZ edge.
const NOW = Date.UTC(2026, 9, 12, 11, 0); // 11:00 UTC = 12:00 Lisbon (WEST)
const opts = { now: NOW };
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

console.log(`\nALL ${n} TESTS PASSED ✓`);
