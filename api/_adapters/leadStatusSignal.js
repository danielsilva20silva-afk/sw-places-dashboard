// Combined lead_status signal for the Meta sheet write-back (brandon only).
//
// Brandon's dashboard writes the lead's status back to the Meta sheet's
// `lead_status` column (column Q). Meta's CRM integration watches that column and
// fires a Conversions API event on every value change, so the string we write is
// the training signal for ads. To enrich that signal we append the lead's A/B/C
// classification as the LAST segment, using the same em-dash separator the
// statuses already use ("Contacted — qualifying — A").
//
// Pure + import-free on purpose: trivially unit-testable, and shared by both the
// write path (combineStatusClass) and the read path (stripClassSuffix) so the
// format contract lives in exactly one place.

// Em dash with single spaces — identical to the separator inside the statuses
// themselves (e.g. "Contacted — no answer"), so the whole value reads uniformly.
export const CLASS_SEP = " — ";
const VALID_CLASS = new Set(["A", "B", "C"]);

const s = (v) => (v == null ? "" : String(v));

// Combine a dashboard status with the lead's classification into the single
// lead_status cell value. Contract (Events Manager mapping depends on it):
//   value = "<status>"  or  "<status> — <A|B|C>"
// classification is upper-cased and ALWAYS the last segment; a blank/invalid
// classification yields the status alone — exactly as before this feature.
export function combineStatusClass(status, classification) {
  const st = s(status).trim();
  const cls = s(classification).trim().toUpperCase();
  return VALID_CLASS.has(cls) ? `${st}${CLASS_SEP}${cls}` : st;
}

// Inverse, for the read/import path: drop a trailing " — A|B|C" so the status
// round-trips cleanly. The em dash also appears INSIDE statuses, so only a final
// lone A/B/C segment is stripped — "Contacted — no answer" is left intact.
export function stripClassSuffix(value) {
  const str = s(value).trim();
  const m = str.match(/\s—\s([ABC])$/);
  return m ? str.slice(0, m.index).trim() : str;
}
