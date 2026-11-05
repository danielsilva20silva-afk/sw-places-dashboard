// Integration tests for metaLeadsSheet.updateLead — the Meta sheet write-back that
// produces the combined lead_status signal. Drives the REAL updateLead with a
// mocked Sheets client, reproducing the production PATCH shapes. Run:
//   node api/_adapters/metaLeadsSheet.test.mjs
import assert from "node:assert/strict";
import { updateLead } from "./metaLeadsSheet.js";

let n = 0; const ok = (name) => { n++; console.log("✓", name); };

// Build a mock Sheets client over a single tab: `header` (row 1) + one lead row.
// Captures every values.update so we can assert exactly what lands in each cell.
function mockCtx({ header, row }) {
  const writes = [];
  const sheets = {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: "Folha1", index: 0 } }] } }),
      values: {
        batchGet: async () => ({ data: { valueRanges: [{ values: [header, row] }] } }),
        update: async (args) => { writes.push({ range: args.range, value: args.requestBody.values[0][0] }); return { data: {} }; },
      },
    },
  };
  return { ctx: { sheets, spreadsheetIds: ["sheet1"], supabase: null }, writes };
}
// The value written to a given column LETTER (last write wins), or undefined.
const wroteTo = (writes, letter) => {
  const hits = writes.filter((w) => w.range.includes(`!${letter}`));
  return hits.length ? hits[hits.length - 1].value : undefined;
};

// Fixed Meta columns + lead_status (col I here) + a classification column. We vary
// only the classification HEADER CASING between the two blocks below.
const baseHeader = (classHeader) => ["id", "created_time", "ad_name", "form_name", "campaign_name", "email", "full_name", "phone", "lead_status", classHeader];
const baseRow = (cls) => ["l:1", "2026-10-01T10:00:00Z", "Ad", "Form", "Camp", "a@b.com", "Jane", "+351900000000", "CREATED", cls];
// lead_status is the 9th column → letter I; classification the 10th → letter J.
const STATUS_LETTER = "I";
const CLASS_LETTER = "J";

// ── Canonical header "classification" (the already-working case) ──
{
  const { ctx, writes } = mockCtx({ header: baseHeader("classification"), row: baseRow("A") });
  const res = await updateLead(ctx, "l:1", { status: "Contacted — qualifying" }); // status-only
  assert.equal(wroteTo(writes, STATUS_LETTER), "Contacted — qualifying — A", "status-only on classified lead → combo");
  assert.equal(res.status, "Contacted — qualifying");
  ok("canonical header: status-only change writes the combo");
}
{
  const { ctx, writes } = mockCtx({ header: baseHeader("classification"), row: baseRow("") });
  await updateLead(ctx, "l:1", { status: "Viewing booked" }); // no classification yet
  assert.equal(wroteTo(writes, STATUS_LETTER), "Viewing booked", "no classification → status alone");
  ok("canonical header: no classification → status alone");
}

// ── THE BUG: a real-world header casing variant "Classification" ──
// Before the fix, the exact-match read (idx["classification"]) misses "Classification",
// so current.classification is "" and the combo is dropped — exactly the production
// symptom (plain statuses, zero " — A/B/C"). These are the failing-first assertions.
{
  const { ctx, writes } = mockCtx({ header: baseHeader("Classification"), row: baseRow("A") });
  const res = await updateLead(ctx, "l:1", { status: "Contacted — qualifying" }); // status-only
  assert.equal(wroteTo(writes, STATUS_LETTER), "Contacted — qualifying — A", "status-only must still write the combo when the header is 'Classification'");
  assert.equal(res.classification, "A", "classification must be read from a case-variant header");
  ok("variant header 'Classification': status-only change still writes the combo");
}
{
  // A reclassification (classification-only PATCH) must persist to the class column
  // AND refresh the combo, even with the variant header.
  const { ctx, writes } = mockCtx({ header: baseHeader("Classification"), row: baseRow("B") });
  await updateLead(ctx, "l:1", { classification: "A" });
  assert.equal(wroteTo(writes, CLASS_LETTER), "A", "classification persisted to the (variant-header) column");
  assert.equal(wroteTo(writes, STATUS_LETTER), "New — A", "reclassification refreshes the combo with current status");
  ok("variant header 'Classification': reclassification persists + refreshes the combo");
}
{
  // Tolerance covers spacing/trailing-space variants too (e.g. "Classification ").
  const { ctx, writes } = mockCtx({ header: baseHeader("Classification "), row: baseRow("C") });
  await updateLead(ctx, "l:1", { status: "Closed" });
  assert.equal(wroteTo(writes, STATUS_LETTER), "Closed — C");
  ok("variant header with trailing space: combo still written");
}

console.log(`\nALL ${n} TESTS PASSED ✓`);
