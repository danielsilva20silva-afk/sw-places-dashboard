// Tolerant budget parsing for the Leads Budget filter (pure, node-testable).
// Meta "budget" columns are free text ("€6M", "500-600k", "max €1.6M",
// "€1.5-2M (prefers 1.5)", "up to €10M", "£2M"); the curated landing buckets are
// matched by exact string. This turns free text into a numeric ceiling (the MAX
// amount mentioned) so it can be bucketed.
//
// SAFETY: budgetInBucket recognizes ONLY brandon's four euro-bucket labels. Any
// other client's bucket labels (e.g. swplaces "Até 300k", "+1M") return false, so
// parsed matching is a no-op there and exact matching is unchanged.

// Strip accents + lowercase (so "milhões" → "milhoes").
function ascii(s) {
  return String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function toNum(raw) {
  const n = parseFloat(String(raw).replace(",", ".")); // European decimal comma
  return Number.isFinite(n) ? n : null;
}

// Suffix → multiplier. m/mm/million/milhao(es) = ×1e6; k/mil = ×1e3; none = ×1.
function suffixMult(sfx) {
  if (!sfx) return 1;
  if (/^(million|millions|milhoes|milhao|mm|m)$/.test(sfx)) return 1e6;
  if (/^(mil|k)$/.test(sfx)) return 1e3;
  return 1;
}

// Longest/most-specific suffixes first (JS alternation is ordered, not longest-match).
const NUM_RE = /(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?))?\s*(million|millions|milhoes|milhao|mm|mil|k|m)?/g;

// Parse free-text budget → the MAX amount (a range "1.5-2M" gives both ends the
// trailing suffix). Returns a number (euros) or null when nothing numeric is found.
export function parseBudget(text) {
  const s = ascii(text);
  if (!s) return null;
  const amounts = [];
  let m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(s)) !== null) {
    if (!m[1]) { NUM_RE.lastIndex++; continue; } // safety (shouldn't happen: \d+ required)
    const mult = suffixMult(m[3] || "");
    const a = toNum(m[1]);
    if (a != null) amounts.push(a * mult);
    if (m[2] != null) { const b = toNum(m[2]); if (b != null) amounts.push(b * mult); }
  }
  return amounts.length ? Math.max(...amounts) : null;
}

// Normalize a bucket label: lowercase, unify dash variants, collapse spaces.
function normBucket(label) {
  return String(label ?? "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

// brandon's four euro buckets → boundary test on the parsed ceiling.
const M = 1e6;
const BUCKETS = {
  "under €1m": (c) => c < 1 * M,
  "€1m - €2m": (c) => c >= 1 * M && c <= 2 * M,
  "€2m - €5m": (c) => c > 2 * M && c <= 5 * M,
  "over €5m": (c) => c > 5 * M,
};

// Does a lead's free-text budget fall in the selected bucket? Unparseable text or
// an unrecognized (non-brandon) bucket label → false.
export function budgetInBucket(ceiling, bucketLabel) {
  if (ceiling == null) return false;
  const test = BUCKETS[normBucket(bucketLabel)];
  return test ? test(ceiling) : false;
}
