// Unit tests for the combined lead_status signal. Run:
//   node api/_adapters/leadStatusSignal.test.mjs
import assert from "node:assert/strict";
import { combineStatusClass, stripClassSuffix, CLASS_SEP } from "./leadStatusSignal.js";

let n = 0; const ok = (name) => { n++; console.log("✓", name); };

// Every dashboard status the write-back can produce.
const STATUSES = ["New", "Contacted — no answer", "Contacted — qualifying", "Contacted — answered", "Viewing booked", "Closed", "Lost"];

// ── combineStatusClass: status + classification ──
{
  // The two examples from the spec.
  assert.equal(combineStatusClass("Contacted — qualifying", "A"), "Contacted — qualifying — A");
  assert.equal(combineStatusClass("Contacted — answered", "B"), "Contacted — answered — B");
  ok("combine: spec examples");
}
{
  // Applies to EVERY status value, class always the last uppercase segment.
  for (const st of STATUSES) {
    assert.equal(combineStatusClass(st, "C"), `${st} — C`, `combo for ${st}`);
    assert.equal(combineStatusClass(st, "A").endsWith(" — A"), true);
  }
  ok("combine: applies to all 7 statuses, class is the last segment");
}
{
  // No classification → status alone, exactly as today (blank / null / undefined).
  for (const empty of ["", "   ", null, undefined]) {
    assert.equal(combineStatusClass("Viewing booked", empty), "Viewing booked");
  }
  ok("combine: no classification → status alone (unchanged)");
}
{
  // Classification is normalized to uppercase; invalid values are ignored (status
  // alone), never written as a bogus suffix.
  assert.equal(combineStatusClass("Closed", "a"), "Closed — A");
  assert.equal(combineStatusClass("Lost", " b "), "Lost — B");
  assert.equal(combineStatusClass("New", "D"), "New");   // not A/B/C → no suffix
  assert.equal(combineStatusClass("New", "A1"), "New");  // not a lone letter → no suffix
  assert.equal(CLASS_SEP, " — ");
  ok("combine: classification upper-cased; invalid class → status alone");
}

// ── stripClassSuffix: the read/import inverse ──
{
  // Strips only a trailing lone A/B/C; the em dash inside a status is preserved.
  assert.equal(stripClassSuffix("Contacted — qualifying — A"), "Contacted — qualifying");
  assert.equal(stripClassSuffix("Contacted — no answer — B"), "Contacted — no answer");
  assert.equal(stripClassSuffix("Viewing booked — C"), "Viewing booked");
  assert.equal(stripClassSuffix("Contacted — no answer"), "Contacted — no answer");
  assert.equal(stripClassSuffix("New"), "New");
  assert.equal(stripClassSuffix("CREATED"), "CREATED");
  assert.equal(stripClassSuffix(""), "");
  ok("strip: removes a trailing A/B/C only, keeps status em dashes");
}
{
  // Round-trip: combine then strip returns the original status, for every status
  // and every class (and the no-class case). This is what guarantees a lead's
  // status is never re-imported wrongly or duplicated.
  for (const st of STATUSES) {
    for (const cls of ["A", "B", "C", ""]) {
      assert.equal(stripClassSuffix(combineStatusClass(st, cls)), st, `round-trip ${st}/${cls || "∅"}`);
    }
  }
  ok("round-trip: strip(combine(status, class)) === status for all cases");
}

// ── Write-back scenarios (the effective-value logic in updateLead) ──
// Mirror how the adapter picks the effective status/class before combining:
//   effStatus = statusChanged ? b.status : current.status
//   effClass  = classChanged  ? b.classification : current.classification
const writeBack = (current, b) => {
  const statusChanged = b.status !== undefined;
  const classChanged = b.classification !== undefined;
  const effStatus = statusChanged ? b.status : current.status;
  const effClass = classChanged ? b.classification : current.classification;
  return combineStatusClass(effStatus, effClass);
};
{
  // Status change keeps the lead's existing classification.
  assert.equal(writeBack({ status: "New", classification: "B" }, { status: "Contacted — answered" }), "Contacted — answered — B");
  ok("write-back: status change carries the current classification");
}
{
  // Classification change keeps the current status (reclassify B → A).
  assert.equal(writeBack({ status: "Contacted — qualifying", classification: "B" }, { classification: "A" }), "Contacted — qualifying — A");
  ok("write-back: classification change refreshes the combo with current status");
}
{
  // No classification on the lead → status alone, both on status change and on
  // (a no-op) classification clear.
  assert.equal(writeBack({ status: "New", classification: "" }, { status: "Viewing booked" }), "Viewing booked");
  assert.equal(writeBack({ status: "Closed", classification: "A" }, { classification: "" }), "Closed");
  ok("write-back: no / cleared classification → status alone");
}
{
  // Both change together in one patch → both new values combine.
  assert.equal(writeBack({ status: "New", classification: "C" }, { status: "Lost", classification: "A" }), "Lost — A");
  ok("write-back: simultaneous status + classification change");
}

console.log(`\nALL ${n} TESTS PASSED ✓`);
