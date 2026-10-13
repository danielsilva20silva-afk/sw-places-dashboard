// Unit tests for the follow-up cadence engine. Run: node src/followups.test.mjs
import assert from "node:assert/strict";
import { computeFollowup, attemptStats, downgradeTarget, downgradeThreshold, ATTEMPT_TITLE, DOWNGRADE_TITLE, PREFILLED_NO_ANSWER_NOTE, NO_ANSWER_STATUS } from "./followups.js";
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

// ── Status-aware cadence (no-answer retry chain) ──
{
  // B, contacted 29 days ago. Normal B=28 → overdue; no-answer retry B=30 → not yet.
  const lead = { classification: "B", status: NO_ANSWER_STATUS, manual_notes: "", created_at: daysAgo(200) };
  const fu = computeFollowup(lead, [{ done: true, done_at: daysAgo(29) }], opts);
  assert.equal(fu.cadenceDays, 30, "no-answer B uses the 30-day retry cadence");
  assert.equal(fu.isOverdue, false, "29 days < 30-day retry → not yet due");
  // Same lead WITHOUT the no-answer status → normal B=28 → overdue.
  const fuNormal = computeFollowup({ ...lead, status: "Contacted — answered" }, [{ done: true, done_at: daysAgo(29) }], opts);
  assert.equal(fuNormal.cadenceDays, 28);
  assert.equal(fuNormal.isOverdue, true);
  ok("status-aware cadence: no-answer B=30 vs normal B=28");
}
{
  // A no-answer retry = 7 (same as normal A=7); C no-answer = 180 vs normal 75.
  const a = computeFollowup({ classification: "A", status: NO_ANSWER_STATUS, manual_notes: "", created_at: daysAgo(30) }, [{ done: true, done_at: daysAgo(6) }], opts);
  assert.equal(a.cadenceDays, 7);
  const c = computeFollowup({ classification: "C", status: NO_ANSWER_STATUS, manual_notes: "", created_at: daysAgo(400) }, [{ done: true, done_at: daysAgo(100) }], opts);
  assert.equal(c.cadenceDays, 180);
  assert.equal(c.isOverdue, false, "100 days < 180-day no-answer retry");
  ok("status-aware cadence: A=7, C=180 on no-answer");
}

// ── Attempt counting ──
const attempt = (ms) => ({ done: true, title: ATTEMPT_TITLE, done_at: new Date(ms).toISOString() });
{
  // Two attempts after a real note → attempts = 2 (prefilled note doesn't reset).
  const notes = `[01/10/2026 09:00] Spoke to agent\n[02/10/2026 10:00] ${PREFILLED_NO_ANSWER_NOTE}`;
  const lead = { classification: "A", status: NO_ANSWER_STATUS, manual_notes: notes };
  const acts = [attempt(Date.UTC(2026, 9, 2, 10)), attempt(Date.UTC(2026, 9, 9, 10))];
  const st = attemptStats(lead, acts);
  assert.equal(st.attempts, 2, `expected 2, got ${st.attempts}`);
  assert.equal(st.threshold, 4);
  ok("attempts: 2 attempts since real note; prefilled note doesn't reset");
}
{
  // A completed NON-attempt action (e.g. downgrade log / real contact) after the
  // attempts resets the counter to 0.
  const lead = { classification: "B", status: NO_ANSWER_STATUS, manual_notes: "[01/10/2026 09:00] call back" };
  const acts = [attempt(Date.UTC(2026, 9, 2, 10)), attempt(Date.UTC(2026, 9, 3, 10)), { done: true, title: "Reached by email", done_at: "2026-10-05T10:00:00Z" }];
  const st = attemptStats(lead, acts);
  assert.equal(st.attempts, 0, "a later non-attempt completed action resets the chain");
  assert.equal(st.threshold, 3);
  ok("attempts: non-attempt completed action resets the counter");
}
{
  assert.equal(downgradeTarget("A"), "B");
  assert.equal(downgradeTarget("B"), "C");
  assert.equal(downgradeTarget("C"), null);
  assert.equal(downgradeThreshold("A"), 4);
  assert.equal(downgradeThreshold("B"), 3);
  assert.equal(downgradeThreshold("C"), null);
  // computeFollowup surfaces attempts + attemptThreshold.
  const fu = computeFollowup({ classification: "A", status: NO_ANSWER_STATUS, manual_notes: "[01/10/2026 09:00] x" }, [attempt(Date.UTC(2026, 9, 2)), attempt(Date.UTC(2026, 9, 3)), attempt(Date.UTC(2026, 9, 4))], opts);
  assert.equal(fu.attempts, 3);
  assert.equal(fu.attemptThreshold, 4);
  ok("downgrade target/threshold + computeFollowup surfaces attempts");
}

// ── Deletable attempts + structured downgrade anchor ──
const att = (ms, id) => ({ done: true, title: ATTEMPT_TITLE, done_at: new Date(ms).toISOString(), id });
const dgAct = (ms, id) => ({ done: true, title: `${DOWNGRADE_TITLE} → B`, done_at: new Date(ms).toISOString(), id });
{
  // Counter decreases when an attempt is deleted (deletion = removing it from the list).
  const lead = { classification: "A", status: NO_ANSWER_STATUS, manual_notes: "[01/10/2026 09:00] call back" };
  const three = [att(Date.UTC(2026, 9, 2), "a1"), att(Date.UTC(2026, 9, 3), "a2"), att(Date.UTC(2026, 9, 4), "a3")];
  assert.equal(attemptStats(lead, three).attempts, 3);
  assert.equal(attemptStats(lead, three.filter(a => a.id !== "a3")).attempts, 2, "deleting an attempt decreases the counter");
  ok("deletable attempts: counter decreases when an attempt is removed");
}
{
  // Colliding timestamps: tie-break by id. Same ms for the triggering attempt, the
  // downgrade action and the next attempt. 'a1' < 'm' (not counted, old chain);
  // 'z1' > 'm' (counted, new chain) → attempts = 1.
  const ms = Date.UTC(2026, 9, 6, 14, 30, 0);
  const lead = { classification: "B", status: NO_ANSWER_STATUS, manual_notes: "" };
  const acts = [att(ms, "a1"), dgAct(ms, "m"), att(ms, "z1")];
  const st = attemptStats(lead, acts);
  assert.equal(st.attempts, 1, `colliding-ms tie-break by id → 1, got ${st.attempts}`);
  assert.equal(st.threshold, 3);
  ok("downgrade anchor: colliding timestamps tie-break by id");
}
{
  // Attempts after a downgrade count toward the NEW chain: 0 right after, 1 next.
  const lead = { classification: "B", status: NO_ANSWER_STATUS, manual_notes: "[01/10/2026 09:00] spoke" };
  const base = [att(Date.UTC(2026, 9, 2), "a1"), att(Date.UTC(2026, 9, 3), "a2"), att(Date.UTC(2026, 9, 4), "a3"), att(Date.UTC(2026, 9, 5), "a4"), dgAct(Date.UTC(2026, 9, 5, 0, 0, 30), "d1")];
  assert.equal(attemptStats(lead, base).attempts, 0, "right after downgrade → 0 of 3");
  const next = [...base, att(Date.UTC(2026, 9, 12), "a5")];
  assert.equal(attemptStats(lead, next).attempts, 1, "next attempt → 1 of 3");
  ok("downgrade anchor: attempts after downgrade count toward the new chain");
}
{
  // Deleting the downgrade NOTE does not change the counter (the ACTION anchors).
  const dgNote = "[05/10/2026 14:30] Auto-moved to B after 4 attempts";
  const acts = [dgAct(Date.UTC(2026, 9, 5, 14, 30, 45), "d1"), att(Date.UTC(2026, 9, 6, 10), "a5")];
  const withNote = attemptStats({ classification: "B", status: NO_ANSWER_STATUS, manual_notes: dgNote }, acts).attempts;
  const withoutNote = attemptStats({ classification: "B", status: NO_ANSWER_STATUS, manual_notes: "" }, acts).attempts;
  assert.equal(withNote, 1);
  assert.equal(withoutNote, 1, "removing the downgrade note leaves the counter unchanged (action anchors)");
  ok("downgrade anchor: deleting the downgrade note doesn't change the counter");
}

console.log(`\nALL ${n} TESTS PASSED ✓`);
