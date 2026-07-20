import { getSheetsContext } from "./googleAuth.js";
import { getContext as getSupabaseContext } from "./supabase.js";

// Meta Ads Instant Forms → Google Sheet(s) adapter (READ + status write-back).
// The Meta Ads sync owns these sheets; their column layout is FIXED by Meta —
// never rename/reorder. Used only INSIDE the brandon composite adapter, alongside
// the Supabase (landing-page) source — never selected on its own.
//
// MULTIPLE SHEETS + MULTIPLE TABS: Meta writes each Instant Form's leads to its
// own TAB inside a master spreadsheet (e.g. "Folha1", "Quadradinhos Nº8", …), and
// adds new tabs over time — so we enumerate and read EVERY tab, never a hardcoded
// name. GOOGLE_SHEETS_ID still accepts a comma-separated list of spreadsheets
// (id1,id2,…); a single id keeps working. getLeads reads every tab of every
// spreadsheet in parallel and merges (a failing spreadsheet doesn't sink the
// others), de-dupes by id; writes locate the lead's origin tab by id.
//
// Reuses the shared service-account auth (googleAuth.js) and the same env as
// sheets.js: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEETS_ID.

// Read a generous window: base Meta columns + however many form-question columns.
const READ_RANGE = "A1:AZ";
const STATUS_COL = "lead_status";

// Manual (human) notes for Meta leads live in a side table in the SAME Supabase
// project as the brandon subscribers — the Meta Ads sync owns the Sheet and has
// no column of ours. One row per Meta lead id:
//   meta_lead_notes(lead_id text PK, manual_notes text, updated_at timestamptz)
const NOTES_TABLE = "meta_lead_notes";

// The FIXED Meta columns. Any header NOT in this set is treated as a form
// question (they differ per Instant Form, e.g. "what_would_you_like_to_do_next?"
// vs "which_areas_are_you_interested_in?").
const STANDARD_COLS = new Set([
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
  "platform", "email", "full_name", "phone", "lead_status",
]);

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

// Context carries the shared Sheets client + the list of spreadsheet ids, plus a
// Supabase client (same project as the brandon subscribers) for the manual-notes
// side table. The comma-list is parsed here so googleAuth.js / sheets.js stay
// single-id. A missing/broken Supabase env leaves supabase=null → notes degrade
// gracefully (leads still load, just without manual notes).
export function getContext() {
  const base = getSheetsContext();
  if (!base) return null;
  const spreadsheetIds = String(base.spreadsheetId)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!spreadsheetIds.length) return null;
  let supabase = null;
  try {
    supabase = getSupabaseContext()?.supabase || null;
  } catch (err) {
    console.error("metaLeadsSheet: Supabase context unavailable for notes:", err?.message || err);
  }
  return { sheets: base.sheets, spreadsheetIds, supabase };
}

// ── Manual notes side table (meta_lead_notes) ──
// Read: one batched select for a set of lead ids → { id: notes }. Best-effort;
// any failure logs and yields {} so the leads list never breaks.
async function fetchNotes(ctx, ids) {
  if (!ctx.supabase || !ids.length) return {};
  try {
    const { data, error } = await ctx.supabase
      .from(NOTES_TABLE)
      .select("lead_id, manual_notes")
      .in("lead_id", ids);
    if (error) {
      console.error("metaLeadsSheet fetchNotes:", error.message);
      return {};
    }
    const map = {};
    for (const r of data || []) map[s(r.lead_id)] = s(r.manual_notes);
    return map;
  } catch (err) {
    console.error("metaLeadsSheet fetchNotes threw:", err?.message || err);
    return {};
  }
}

// Write: upsert one lead's notes (bumping updated_at). Unlike reads, a write
// failure is surfaced so the drawer can show an error / retry.
async function upsertNote(ctx, id, notes) {
  if (!ctx.supabase) throw new DataError(500, "Armazenamento de notas indisponível.");
  const value = s(notes);
  const { error } = await ctx.supabase
    .from(NOTES_TABLE)
    .upsert(
      { lead_id: s(id), manual_notes: value, updated_at: new Date().toISOString() },
      { onConflict: "lead_id" }
    );
  if (error) {
    console.error("metaLeadsSheet upsertNote:", error.message);
    throw new DataError(500, "Não foi possível guardar a nota.");
  }
  return value;
}

// This adapter owns the Meta lead ids, which keep Meta's "l:" prefix.
export const ownsId = (id) => String(id).startsWith("l:");

const s = (v) => (v == null ? "" : String(v));

// Quote a tab title for A1 notation. Meta tab names contain spaces/accents
// (e.g. "Quadradinhos Nº8"), which MUST be single-quoted; embedded quotes double.
function a1Tab(title) {
  return `'${s(title).replace(/'/g, "''")}'`;
}

// 0-based column index → A1 letter (0→A, 16→Q, 26→AA).
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

// Enumerate ALL tab titles in a spreadsheet, in tab order. Meta creates one tab
// per Instant Form and adds more over time, so nothing is hardcoded.
async function allTabTitles(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(title,index)",
  });
  return (meta.data.sheets || [])
    .slice()
    .sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0))
    .map((sh) => sh.properties?.title)
    .filter(Boolean);
}

// Read EVERY tab of a spreadsheet in one batched call. Returns one entry per tab:
// { spreadsheetId, title, header, idx, rows } where idx maps a column name → its
// 0-based index. Each tab carries its OWN header/idx, so tabs whose forms have
// slightly different question columns are handled per-tab (missing → blank).
async function readAllTabs(sheets, spreadsheetId) {
  const titles = await allTabTitles(sheets, spreadsheetId);
  if (!titles.length) return [];
  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: titles.map((t) => `${a1Tab(t)}!${READ_RANGE}`),
  });
  const valueRanges = resp.data.valueRanges || [];
  return titles.map((title, i) => {
    const values = valueRanges[i]?.values || [];
    const header = (values[0] || []).map((h) => s(h).trim());
    const idx = {};
    header.forEach((h, k) => { idx[h] = k; });
    return { spreadsheetId, title, header, idx, rows: values.slice(1) };
  });
}

function cell(row, idx, name) {
  const i = idx[name];
  return i == null ? "" : s(row[i]);
}

// Meta test leads: dummy rows with test@meta.com or "<test lead:" placeholders
// (the placeholder can land in any question column, so scan the whole row).
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

// "which_areas_are_you_interested_in?" → "Which areas are you interested in".
function humanizeQuestion(q) {
  const t = s(q).replace(/\?/g, "").replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Notes = campaign name, then every answered form question ("Question: answer"),
// with the question label humanized and the answer's underscores spaced out.
function composeNotes(row, idx, header) {
  const parts = [];
  const campaign = cell(row, idx, "campaign_name").trim();
  if (campaign) parts.push(campaign);
  for (const col of header) {
    if (!col || STANDARD_COLS.has(col)) continue; // skip the fixed Meta columns
    const answer = cell(row, idx, col).replace(/_/g, " ").trim();
    if (!answer) continue;
    parts.push(`${humanizeQuestion(col)}: ${answer}`);
  }
  return parts.join("\n\n");
}

function rowToLead(row, idx, header) {
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
    notes: composeNotes(row, idx, header),
    created_at: createdTime,
    username: "", // no column
    source_content: "", // no column
    manual_notes: "", // filled from the meta_lead_notes side table in getLeads
    manual_notes_editable: true, // notes live in our Supabase side table now
    source_url: "", // no reel-link column for brandon (uniform shape only)
  };
}

// De-dupe leads by the Meta id column (ids are globally unique; a lead should
// live in exactly one tab, but this guards against accidental duplicates).
function dedupeById(leads) {
  const seen = new Set();
  const out = [];
  for (const l of leads) {
    const key = s(l.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

// All non-test leads across EVERY tab of one spreadsheet. Throws on read failure
// (the caller decides how to degrade).
async function leadsFromSpreadsheet(sheets, spreadsheetId) {
  const tabs = await readAllTabs(sheets, spreadsheetId);
  const out = [];
  for (const tab of tabs) {
    if (tab.idx.id == null) continue; // non-lead tab (no id header) — skip
    for (const row of tab.rows) {
      if (!row || !s(row[tab.idx.id])) continue;
      if (isTestRow(row, tab.idx)) continue;
      out.push(rowToLead(row, tab.idx, tab.header));
    }
  }
  return out;
}

// ────────────────────────────── Leads ──────────────────────────────
// Read every tab of every configured spreadsheet in parallel and merge. A
// spreadsheet that fails logs and yields [] so the others still render (same
// resilience as the composite). Results are de-duped by lead id.
export async function getLeads(ctx) {
  const { sheets, spreadsheetIds } = ctx;
  const perSpreadsheet = await Promise.all(
    spreadsheetIds.map(async (spreadsheetId) => {
      try {
        return await leadsFromSpreadsheet(sheets, spreadsheetId);
      } catch (err) {
        console.error(`metaLeadsSheet getLeads: spreadsheet ${spreadsheetId} failed:`, err?.message || err);
        return [];
      }
    })
  );
  const leads = dedupeById(perSpreadsheet.flat());
  // Join the human notes from the side table (best-effort — no notes on failure).
  const notes = await fetchNotes(ctx, leads.map((l) => l.id));
  for (const l of leads) l.manual_notes = notes[l.id] || "";
  return leads;
}

// Two writable fields, to two different stores:
//   • status       → the lead_status column of the matching Sheet row
//   • manual_notes  → the meta_lead_notes side table (our Supabase)
// They're independent and can arrive in the same request; a status write never
// touches the note and vice-versa. The lead may live in any configured sheet, so
// locate its origin sheet by id first. Other fields are ignored silently.
export async function updateLead(ctx, id, b) {
  const { sheets, spreadsheetIds } = ctx;
  // Read every tab of every configured spreadsheet; a failed spreadsheet
  // contributes nothing (the lead may still be found in another).
  const tabGroups = await Promise.all(
    spreadsheetIds.map(async (spreadsheetId) => {
      try {
        return await readAllTabs(sheets, spreadsheetId);
      } catch (err) {
        console.error(`metaLeadsSheet updateLead: read ${spreadsheetId} failed:`, err?.message || err);
        return [];
      }
    })
  );

  for (const tab of tabGroups.flat()) {
    if (tab.idx.id == null) continue;
    const dataIdx = tab.rows.findIndex((row) => row && s(row[tab.idx.id]) === s(id));
    if (dataIdx === -1) continue;

    const current = rowToLead(tab.rows[dataIdx], tab.idx, tab.header);

    // manual_notes → side table (independent of the Sheet, surfaced on failure).
    let manualNotes = current.manual_notes;
    if (b.manual_notes !== undefined) {
      manualNotes = await upsertNote(ctx, id, b.manual_notes);
    }

    // status → the lead_status cell of the exact TAB where the lead lives.
    let status = current.status;
    if (b.status !== undefined) {
      const statusColIdx = tab.idx[STATUS_COL];
      if (statusColIdx == null) throw new DataError(500, `Coluna "${STATUS_COL}" não encontrada no Sheet.`);
      const sheetRow = dataIdx + 2; // +1 header, +1 for 1-based rows
      await sheets.spreadsheets.values.update({
        spreadsheetId: tab.spreadsheetId,
        range: `${a1Tab(tab.title)}!${colLetter(statusColIdx)}${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [[b.status]] },
      });
      status = mapStatus(b.status);
    }

    return { ...current, status, manual_notes: manualNotes };
  }

  throw new DataError(404, "Lead não encontrado.");
}

// Not supported: the Meta sync owns these rows.
export async function addLead() {
  throw new DataError(400, "Leads do Meta Ads não podem ser criados no dashboard.");
}

export async function deleteLead() {
  throw new DataError(400, "Leads do Meta Ads não podem ser apagados no dashboard.");
}
