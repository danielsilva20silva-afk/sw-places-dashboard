import { google } from "googleapis";

// Google Sheets data adapter. All Sheets access for the Leads and Conversations
// endpoints lives here (auth, tab names, column mappings, operations) — moved
// verbatim from api/leads.js and api/conversations.js.
// NOTE: api/ai-reply.js keeps its own internal Sheets logic on purpose (Ana's
// live path stays frozen), so some helpers are intentionally duplicated there.

// ── Tabs / ranges ──
// Leads columns A–M: id | name | email | phone | budget | intention | source |
//                    date | status | notes | created_at | username | source_content
const LEADS_TAB = process.env.GOOGLE_SHEETS_TAB || "Leads";
const LEADS_RANGE = `${LEADS_TAB}!A2:M`;
const LEADS_ID_RANGE = `${LEADS_TAB}!A2:A`;
// Conversations columns A–D: contact_id | role | message | timestamp
const CONV_TAB = process.env.GOOGLE_CONVERSATIONS_TAB || "Conversations";
const CONV_RANGE = `${CONV_TAB}!A2:D`;
const MUTED_TAB = process.env.GOOGLE_ANA_MUTED_TAB || "AnaMuted";
const MUTED_RANGE = `${MUTED_TAB}!A2:A`;
// Subscribers columns A–D: contact_id | name | username | last_seen
const SUBS_TAB = process.env.GOOGLE_SUBSCRIBERS_TAB || "Subscribers";
const SUBS_RANGE = `${SUBS_TAB}!A2:C`;

// Domain error the endpoints surface directly (status + message preserved).
// Duck-typed via `.expose` so endpoints need no import of this class.
export class DataError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Opaque connection handle (was getSheetsClient). Returned to the endpoint and
// passed back into each operation; null when env is missing (endpoint maps 500).
export function getContext() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!email || !key || !spreadsheetId) return null;
  const auth = new google.auth.JWT({
    email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

// Full ISO timestamp with the Europe/Lisbon offset, e.g. "2026-07-09T14:32:05+01:00".
function lisbonISO(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value || "";
  let hh = g("hour"); if (hh === "24") hh = "00";
  const raw = g("timeZoneName").replace("GMT", "").trim();
  let off = "+00:00";
  const m = raw.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (m) off = `${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}`;
  return `${g("year")}-${g("month")}-${g("day")}T${hh}:${g("minute")}:${g("second")}${off}`;
}

// Resolve the numeric sheetId (gid) for a tab title — required by deleteDimension.
async function getSheetId(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const sheet = (meta.data.sheets || []).find((s) => s.properties.title === title);
  return sheet ? sheet.properties.sheetId : null;
}

// Read a range, tolerating a missing tab (returns []).
async function getValues(sheets, spreadsheetId, range) {
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return r.data.values || [];
  } catch {
    return [];
  }
}

function rowToLead(r) {
  return {
    id: r[0] ?? "",
    name: r[1] ?? "",
    email: r[2] ?? "",
    phone: r[3] ?? "",
    budget: r[4] ?? "",
    intention: r[5] ?? "",
    source: r[6] ?? "",
    date: r[7] ?? "",
    status: r[8] || "Novo",
    notes: r[9] ?? "",
    created_at: r[10] ?? "",
    username: r[11] ?? "",
    source_content: r[12] ?? "",
  };
}

// ────────────────────────────── Leads ──────────────────────────────
export async function getLeads(ctx) {
  const { sheets, spreadsheetId } = ctx;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEADS_RANGE });
  const rows = resp.data.values || [];
  return rows.filter((r) => r && r[0]).map(rowToLead);
}

export async function addLead(ctx, b) {
  const { sheets, spreadsheetId } = ctx;
  const id = b.id ? String(b.id) : String(Date.now());
  const date = b.date || new Date().toISOString().slice(0, 10);
  const createdAt = b.created_at || lisbonISO();
  const row = [
    id, b.name || "", b.email || "", b.phone || "", b.budget || "",
    b.intention || "", b.source || "", date, b.status || "Novo", b.notes || "", createdAt, b.username || "", b.source_content || "",
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: `${LEADS_TAB}!A:M`, valueInputOption: "RAW", requestBody: { values: [row] },
  });
  return rowToLead(row);
}

export async function updateLead(ctx, id, b) {
  const { sheets, spreadsheetId } = ctx;
  // Find the row by id. Only the fields present are changed;
  // id / source / date / created_at are always preserved.
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEADS_RANGE });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => r && String(r[0]) === String(id));
  if (idx === -1) throw new DataError(404, "Lead não encontrado.");

  const ex = rowToLead(rows[idx]);
  const merged = {
    ...ex,
    name: b.name ?? ex.name,
    email: b.email ?? ex.email,
    phone: b.phone ?? ex.phone,
    budget: b.budget ?? ex.budget,
    intention: b.intention ?? ex.intention,
    status: b.status ?? ex.status,
    notes: b.notes ?? ex.notes,
  };
  const rowNumber = idx + 2; // +1 header, +1 for 1-based indexing
  // NOTE: writes A:K only — username (L) and source_content (M) are intentionally
  // left untouched by PATCH (preserved from the sheet).
  const rowVals = [
    merged.id, merged.name, merged.email, merged.phone, merged.budget,
    merged.intention, merged.source, merged.date, merged.status, merged.notes, merged.created_at,
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${LEADS_TAB}!A${rowNumber}:K${rowNumber}`, valueInputOption: "RAW", requestBody: { values: [rowVals] },
  });
  return merged;
}

export async function deleteLead(ctx, id) {
  const { sheets, spreadsheetId } = ctx;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEADS_RANGE });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => r && String(r[0]) === String(id));
  if (idx === -1) throw new DataError(404, "Lead não encontrado.");

  const sheetId = await getSheetId(sheets, spreadsheetId, LEADS_TAB);
  if (sheetId == null) throw new DataError(500, `Tab "${LEADS_TAB}" não encontrada.`);

  // Data rows start at sheet row 2 → 0-based dimension index of rows[idx] is idx + 1.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: idx + 1, endIndex: idx + 2 } } }] },
  });
  return { id: String(id) };
}

// ────────────────────────── Conversations ──────────────────────────
// Confirm the target row still holds the expected message before mutating it.
function verifyRow(existing, contactId, timestamp) {
  if (!existing) return { ok: false, status: 409, error: "Linha não encontrada (a conversa mudou)." };
  if (String(existing[0]) !== String(contactId)) return { ok: false, status: 409, error: "A linha já não corresponde a esta conversa." };
  if (timestamp && String(existing[3] || "") !== String(timestamp)) return { ok: false, status: 409, error: "A conversa mudou entretanto. Recarrega e tenta de novo." };
  return { ok: true };
}

async function readConvRow(sheets, spreadsheetId, row) {
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CONV_TAB}!A${row}:D${row}` });
    return (r.data.values || [])[0] || null;
  } catch {
    return null;
  }
}

// All conversations grouped by contact_id, tagged with isLead + full thread.
export async function listConversations(ctx) {
  const { sheets, spreadsheetId } = ctx;
  const [conv, leadRows, mutedRows, subRows] = await Promise.all([
    getValues(sheets, spreadsheetId, CONV_RANGE),
    getValues(sheets, spreadsheetId, LEADS_ID_RANGE),
    getValues(sheets, spreadsheetId, MUTED_RANGE),
    getValues(sheets, spreadsheetId, SUBS_RANGE),
  ]);

  const leadIds = new Set(leadRows.map((r) => String(r[0])).filter(Boolean));
  const muted = new Set(mutedRows.map((r) => String(r[0])).filter(Boolean));
  const profiles = new Map();
  for (const r of subRows) {
    const id = r && r[0];
    if (!id) continue;
    profiles.set(String(id), { name: String(r[1] || "").trim(), username: String(r[2] || "").trim() });
  }

  const byId = new Map();
  for (const r of conv) {
    const id = r && r[0];
    if (!id) continue;
    const role = r[1] || "";
    const msg = r[2] || "";
    const ts = r[3] || "";
    const e = byId.get(id) || { contact_id: id, lastMessage: "", lastTimestamp: "", messages: [] };
    if (role === "user" || role === "assistant") {
      e.messages.push({ role, message: msg, timestamp: ts });
    }
    if (msg) e.lastMessage = msg;
    if (ts) e.lastTimestamp = ts;
    byId.set(id, e);
  }

  const list = [];
  for (const [id, e] of byId) {
    const p = profiles.get(String(id)) || { name: "", username: "" };
    list.push({
      contact_id: id,
      name: p.name,
      username: p.username,
      lastMessage: e.lastMessage,
      lastTimestamp: e.lastTimestamp,
      active: !muted.has(String(id)),
      isLead: leadIds.has(String(id)),
      messages: e.messages,
    });
  }
  list.sort((a, b) => String(b.lastTimestamp).localeCompare(String(a.lastTimestamp)));
  return list;
}

// One conversation's messages (chronological), each with its sheet `row`.
export async function getThread(ctx, contactId) {
  const { sheets, spreadsheetId } = ctx;
  const conv = await getValues(sheets, spreadsheetId, CONV_RANGE);
  const messages = [];
  conv.forEach((r, i) => {
    if (!r || String(r[0]) !== String(contactId)) return;
    const role = r[1] || "";
    if (role !== "user" && role !== "assistant") return;
    messages.push({ role, message: r[2] || "", timestamp: r[3] || "", row: i + 2 });
  });
  return { contact_id: String(contactId), messages };
}

export async function addMessage(ctx, { contactId, role, message, timestamp }) {
  const { sheets, spreadsheetId } = ctx;
  const ts = (timestamp && String(timestamp).trim()) || new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: `${CONV_TAB}!A:D`, valueInputOption: "RAW", requestBody: { values: [[contactId, role, message, ts]] },
  });
  return { ok: true };
}

export async function updateMessage(ctx, { contactId, row, message, timestamp }) {
  const { sheets, spreadsheetId } = ctx;
  const existing = await readConvRow(sheets, spreadsheetId, row);
  const v = verifyRow(existing, contactId, timestamp);
  if (!v.ok) throw new DataError(v.status, v.error);
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${CONV_TAB}!C${row}`, valueInputOption: "RAW", requestBody: { values: [[message]] },
  });
  return { ok: true };
}

export async function deleteMessage(ctx, { contactId, row, timestamp }) {
  const { sheets, spreadsheetId } = ctx;
  const existing = await readConvRow(sheets, spreadsheetId, row);
  const v = verifyRow(existing, contactId, timestamp);
  if (!v.ok) throw new DataError(v.status, v.error);
  const sheetId = await getSheetId(sheets, spreadsheetId, CONV_TAB);
  if (sheetId == null) throw new DataError(500, `Tab "${CONV_TAB}" não encontrada.`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] },
  });
  return { ok: true };
}
