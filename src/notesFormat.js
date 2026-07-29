// Timestamped notes-history format helpers.
//
// The lead's editable notes stay a SINGLE plain-text value (`manual_notes`, one
// text column in both backends). We only compose/parse a format on the frontend
// — no schema, adapter, or API change.
//
// Storage format (chronological, oldest first, newest APPENDED at the end):
//   [DD/MM/YYYY HH:mm] Called, no answer.
//   [DD/MM/YYYY HH:mm · editada] Called back, spoke to owner.
// A note body may span multiple lines; entries are delimited by a timestamp
// marker at the START of a line, not by every newline. Free text with no marker
// (notes written before this feature) parses as a single undated ("sem data")
// entry and is preserved verbatim until edited.
//
// Timestamps are Europe/Lisbon wall-clock, generated client-side at save time.

const LISBON_TZ = "Europe/Lisbon";

// Portuguese 3-letter month labels (the UI is pt-PT; capitalised for display).
const MONTHS_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// Start-of-line marker: [DD/MM/YYYY HH:mm] with an optional " · editada" flag.
const MARKER_RE = /^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})( · editada)?\]\s?/;

// "DD/MM/YYYY HH:mm" in Lisbon local time for a given instant (default: now).
export function lisbonStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LISBON_TZ,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  // Some engines emit "24" for midnight under hour12:false — normalise to "00".
  let hh = get("hour");
  if (hh === "24") hh = "00";
  return `${get("day")}/${get("month")}/${get("year")} ${hh}:${get("minute")}`;
}

// Reformat a stored "DD/MM/YYYY HH:mm" stamp for display: "11 Jul 2026, 21:50".
// The stamp is already Lisbon wall-clock, so we only relabel — no TZ conversion.
export function formatStampDisplay(stamp) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(stamp || "");
  if (!m) return stamp || "";
  const [, dd, mm, yyyy, hh, min] = m;
  const mon = MONTHS_PT[parseInt(mm, 10) - 1] || mm;
  return `${parseInt(dd, 10)} ${mon} ${yyyy}, ${hh}:${min}`;
}

// Parse stored text into ordered entries (as stored: chronological, oldest first).
// Entry shape: { dated: bool, stamp: string|null, edited: bool, text: string }.
export function parseNotes(raw) {
  const text = (raw || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return [];
  const entries = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const m = line.match(MARKER_RE);
    if (m) {
      if (cur) entries.push(cur);
      cur = { dated: true, stamp: m[1], edited: !!m[2], text: line.slice(m[0].length) };
    } else if (cur) {
      cur.text += "\n" + line;
    } else {
      // Leading free text before any marker → the legacy "sem data" block.
      cur = { dated: false, stamp: null, edited: false, text: line };
    }
  }
  if (cur) entries.push(cur);
  for (const e of entries) e.text = e.text.replace(/^\n+/, "").replace(/\s+$/, "");
  // Drop an empty undated block (e.g. from stray whitespace); keep dated entries.
  return entries.filter((e) => e.dated || e.text.length > 0);
}

// Serialize entries back to the single stored text value (chronological order).
export function serializeNotes(entries) {
  return entries
    .map((e) => {
      const body = (e.text || "").trim();
      if (!e.dated) return body; // legacy undated: raw text, no marker
      const marker = `[${e.stamp}${e.edited ? " · editada" : ""}]`;
      return body ? `${marker} ${body}` : marker;
    })
    .filter((s) => s.length > 0)
    .join("\n");
}

// Append a new timestamped entry to the end of the stored text (newest last).
export function appendNote(raw, noteText, date = new Date()) {
  const body = (noteText || "").trim();
  if (!body) return raw || "";
  const entry = `[${lisbonStamp(date)}] ${body}`;
  const base = (raw || "").replace(/\s+$/, "");
  return base ? `${base}\n${entry}` : entry;
}

// Edit one entry's text. Dated entries keep their original stamp and gain the
// "editada" flag; a legacy undated entry stays undated (no stamp to preserve).
export function editEntryAt(entries, index, newText) {
  return entries.map((e, i) => {
    if (i !== index) return e;
    const text = (newText || "").trim();
    return { ...e, text, edited: e.dated ? true : e.edited };
  });
}

// Remove one entry.
export function deleteEntryAt(entries, index) {
  return entries.filter((_, i) => i !== index);
}
