import { getSheetsContext } from "./googleAuth.js";

// Meta Ads Instant Forms → Google Sheet adapter (READ + status write-back only).
// The Meta Ads sync owns this sheet; its column layout is FIXED by Meta — never
// rename/reorder. Used only INSIDE the brandon composite adapter, alongside the
// Supabase (landing-page) source — never selected on its own.
//
// Reuses the shared service-account auth (googleAuth.js) and the same env as
// sheets.js: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEETS_ID
// (for the brandon project, GOOGLE_SHEETS_ID points at the Meta leads sheet).

// Fixed Meta columns on the first tab (row 1 = header):
//   id | created_time | ad_id | ad_name | adset_id | adset_name | campaign_id |
//   campaign_name | form_id | form_name | is_organic | platform |
//   what_would_you_like_to_do_next? | email | full_name | phone | lead_status
const READ_RANGE = "A1:Z"; // header + data; Z is comfortably past the 17 columns
const STATUS_COL = "lead_status";

// Dashboard statuses (brandon). Meta writes CREATED/OK/empty for fresh leads.
const DASHBOARD_STATUSES = ["New", "Contacted", "Viewing booked", "Closed", "Lost"];

// Domain error the endpoints surface directly (duck-typed via `.expose`).
export class DataError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export function getContext() {
  return getSheetsContext();
}

// This adapter owns the Meta lead ids, which keep Meta's "l:" prefix.
export const ownsId = (id) => String(id).startsWith("l:");

const s = (v) => (v == null ? "" : String(v));

// 0-based column index → A1 letter (0→A, 16→Q).
function colLetter(n) {
  let out = "";
  let i = n + 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    i = Math.floor((i - 1) / 26);
  }
  return out;
}

// Resolve the first tab's title (Meta names it e.g. "Folha1"/"Sheet1").
async function firstSheetTitle(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title,index)",
  });
  const list = (meta.data.sheets || [])
    .slice()
    .sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0));
  return list.length ? list[0].properties.title : "Sheet1";
}

// Read the first tab: returns { title, header, idx, rows } where idx maps a
// column name → its 0-based index and rows are the data rows (header excluded).
async function readSheet(ctx) {
  const { sheets, spreadsheetId } = ctx;
  const title = await firstSheetTitle(sheets, spreadsheetId);
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!${READ_RANGE}`,
  });
  const values = resp.data.values || [];
  const header = (values[0] || []).map((h) => s(h).trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  return { title, header, idx, rows: values.slice(1) };
}

function cell(row, idx, name) {
  const i = idx[name];
  return i == null ? "" : s(row[i]);
}

// Meta test leads: dummy rows with test@meta.com or "<test lead:" placeholders.
function isTestRow(row, idx) {
  if (cell(row, idx, "email").trim().toLowerCase() === "test@meta.com") return true;
  return (row || []).some((c) => s(c).includes("<test lead:"));
}

// Meta lead_status → dashboard status. Known Meta values (CREATED/OK/empty) and
// anything unrecognized map to "New"; a value already in the dashboard set is
// kept as-is (so a status set from the dashboard round-trips).
function mapStatus(raw) {
  const v = s(raw).trim();
  return DASHBOARD_STATUSES.includes(v) ? v : "New";
}

function composeNotes(row, idx) {
  const campaign = cell(row, idx, "campaign_name").trim();
  const want = cell(row, idx, "what_would_you_like_to_do_next?")
    .replace(/_/g, " ")
    .trim();
  return [campaign, want].filter(Boolean).join("\n\n");
}

function rowToLead(row, idx) {
  const adName = cell(row, idx, "ad_name").trim();
  const formName = cell(row, idx, "form_name").trim();
  const label = adName || formName;
  const createdTime = cell(row, idx, "created_time");
  return {
    id: cell(row, idx, "id"),
    name: cell(row, idx, "full_name"),
    email: cell(row, idx, "email"),
    phone: cell(row, idx, "phone").replace(/^p:/, ""),
    budget: "", // no column
    intention: "", // no column
    source: label ? `Meta Ads · ${label}` : "Meta Ads",
    date: createdTime.slice(0, 10), // YYYY-MM-DD
    status: mapStatus(cell(row, idx, STATUS_COL)),
    notes: composeNotes(row, idx),
    created_at: createdTime,
    username: "", // no column
    source_content: "", // no column
    manual_notes: "", // Meta-owned sheet; manual notes not supported here
  };
}

// ────────────────────────────── Leads ──────────────────────────────
export async function getLeads(ctx) {
  const { idx, rows } = await readSheet(ctx);
  if (idx.id == null) return []; // no header / empty sheet
  const leads = [];
  for (const row of rows) {
    if (!row || !s(row[idx.id])) continue;
    if (isTestRow(row, idx)) continue;
    leads.push(rowToLead(row, idx));
  }
  return leads;
}

// Only `status` is writable — it maps to the lead_status column of the matching
// row (located by id). Every other field is ignored silently. The Meta sync owns
// all other columns.
export async function updateLead(ctx, id, b) {
  const { sheets, spreadsheetId } = ctx;
  const { title, idx, rows } = await readSheet(ctx);
  const dataIdx = rows.findIndex((r) => r && s(r[idx.id]) === s(id));
  if (dataIdx === -1) throw new DataError(404, "Lead não encontrado.");

  const current = rowToLead(rows[dataIdx], idx);
  if (b.status === undefined) return current; // nothing writable changed

  const statusColIdx = idx[STATUS_COL];
  if (statusColIdx == null) throw new DataError(500, `Coluna "${STATUS_COL}" não encontrada no Sheet.`);
  const sheetRow = dataIdx + 2; // +1 header, +1 for 1-based rows
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!${colLetter(statusColIdx)}${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [[b.status]] },
  });
  return { ...current, status: mapStatus(b.status) };
}

// Not supported: the Meta sync owns these rows.
export async function addLead() {
  throw new DataError(400, "Leads do Meta Ads não podem ser criados no dashboard.");
}

export async function deleteLead() {
  throw new DataError(400, "Leads do Meta Ads não podem ser apagados no dashboard.");
}
