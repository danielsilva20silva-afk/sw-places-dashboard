import { google } from "googleapis";

// Lists every distinct contact_id in "Conversations", each tagged with isLead
// (whether its id exists in the Leads tab) and its full message thread. Muted
// state comes from the AnaMuted mirror tab (see /api/toggle-ana).
const CONV_TAB = process.env.GOOGLE_CONVERSATIONS_TAB || "Conversations";
const CONV_RANGE = `${CONV_TAB}!A2:D`;
const LEADS_TAB = process.env.GOOGLE_SHEETS_TAB || "Leads";
const LEADS_ID_RANGE = `${LEADS_TAB}!A2:A`;
const MUTED_TAB = process.env.GOOGLE_ANA_MUTED_TAB || "AnaMuted";
const MUTED_RANGE = `${MUTED_TAB}!A2:A`;
// Display identity per subscriber (written by /api/ai-reply). Columns A–D:
// contact_id | name | username | last_seen
const SUBS_TAB = process.env.GOOGLE_SUBSCRIBERS_TAB || "Subscribers";
const SUBS_RANGE = `${SUBS_TAB}!A2:C`;

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!email || !key || !spreadsheetId) return null;
  const auth = new google.auth.JWT({
    email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
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

// Resolve the numeric sheetId (gid) for a tab title — required by deleteDimension.
async function getSheetId(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const s = (meta.data.sheets || []).find((x) => x.properties.title === title);
  return s ? s.properties.sheetId : null;
}

// Read a single Conversations row A{n}:D{n} (or null).
async function readConvRow(sheets, spreadsheetId, row) {
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${CONV_TAB}!A${row}:D${row}` });
    return (r.data.values || [])[0] || null;
  } catch {
    return null;
  }
}

// Confirm the target row still holds the expected message before mutating it,
// so a shifted/stale row number never edits the wrong message.
function verifyRow(existing, contactId, timestamp) {
  if (!existing) return { ok: false, status: 409, error: "Linha não encontrada (a conversa mudou)." };
  if (String(existing[0]) !== String(contactId)) return { ok: false, status: 409, error: "A linha já não corresponde a esta conversa." };
  if (timestamp && String(existing[3] || "") !== String(timestamp)) return { ok: false, status: 409, error: "A conversa mudou entretanto. Recarrega e tenta de novo." };
  return { ok: true };
}

export default async function handler(req, res) {
  const ctx = getSheetsClient();
  if (!ctx) {
    return res.status(500).json({ error: "Google Sheets não configurado." });
  }
  const { sheets, spreadsheetId } = ctx;

  try {
    // ── POST: insert (append) a message to a thread ──
    if (req.method === "POST") {
      const b = req.body ?? {};
      const contactId = String(b.contact_id || "").trim();
      const role = String(b.role || "").trim();
      const message = typeof b.message === "string" ? b.message : "";
      if (!contactId || (role !== "user" && role !== "assistant") || !message.trim()) {
        return res.status(400).json({ error: "Campos obrigatórios: contact_id, role (user|assistant), message." });
      }
      const ts = (b.timestamp && String(b.timestamp).trim()) || new Date().toISOString();
      await sheets.spreadsheets.values.append({
        spreadsheetId, range: `${CONV_TAB}!A:D`, valueInputOption: "RAW",
        requestBody: { values: [[contactId, role, message, ts]] },
      });
      return res.status(201).json({ ok: true });
    }

    // ── PATCH: edit a message's text (row identified + verified) ──
    if (req.method === "PATCH") {
      const b = req.body ?? {};
      const contactId = String(b.contact_id || "").trim();
      const row = parseInt(b.row, 10);
      const message = typeof b.message === "string" ? b.message : "";
      if (!contactId || !(row >= 2) || !message.trim()) {
        return res.status(400).json({ error: "Campos obrigatórios: contact_id, row, message." });
      }
      const existing = await readConvRow(sheets, spreadsheetId, row);
      const v = verifyRow(existing, contactId, b.timestamp);
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${CONV_TAB}!C${row}`, valueInputOption: "RAW",
        requestBody: { values: [[message]] },
      });
      return res.status(200).json({ ok: true });
    }

    // ── DELETE: remove a single message row (verified) ──
    if (req.method === "DELETE") {
      const contactId = String(req.query?.contact_id ?? req.body?.contact_id ?? "").trim();
      const row = parseInt(req.query?.row ?? req.body?.row, 10);
      const timestamp = req.query?.timestamp ?? req.body?.timestamp;
      if (!contactId || !(row >= 2)) {
        return res.status(400).json({ error: "Campos obrigatórios: contact_id, row." });
      }
      const existing = await readConvRow(sheets, spreadsheetId, row);
      const v = verifyRow(existing, contactId, timestamp);
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      const sheetId = await getSheetId(sheets, spreadsheetId, CONV_TAB);
      if (sheetId == null) return res.status(500).json({ error: `Tab "${CONV_TAB}" não encontrada.` });
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] },
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST, PATCH, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Single thread: ?contact_id=X → just that conversation's messages, each
    // with its sheet `row` (used by the drawer to edit/delete). Chronological.
    const contactId = req.query?.contact_id;
    if (contactId) {
      const conv = await getValues(sheets, spreadsheetId, CONV_RANGE);
      const messages = [];
      conv.forEach((r, i) => {
        if (!r || String(r[0]) !== String(contactId)) return;
        const role = r[1] || "";
        if (role !== "user" && role !== "assistant") return;
        messages.push({ role, message: r[2] || "", timestamp: r[3] || "", row: i + 2 });
      });
      return res.status(200).json({ contact_id: String(contactId), messages });
    }

    const [conv, leadRows, mutedRows, subRows] = await Promise.all([
      getValues(sheets, spreadsheetId, CONV_RANGE),
      getValues(sheets, spreadsheetId, LEADS_ID_RANGE),
      getValues(sheets, spreadsheetId, MUTED_RANGE),
      getValues(sheets, spreadsheetId, SUBS_RANGE),
    ]);

    const leadIds = new Set(leadRows.map((r) => String(r[0])).filter(Boolean));
    const muted = new Set(mutedRows.map((r) => String(r[0])).filter(Boolean));
    // contact_id → { name, username } for display
    const profiles = new Map();
    for (const r of subRows) {
      const id = r && r[0];
      if (!id) continue;
      profiles.set(String(id), { name: String(r[1] || "").trim(), username: String(r[2] || "").trim() });
    }

    // Group conversations by contact_id (rows are in chronological order),
    // keeping the full message thread so the drawer can render it.
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

    // All conversations (leads and not-yet-leads), tagged with isLead.
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

    return res.status(200).json(list);
  } catch (err) {
    console.error("conversations error:", err);
    const detail = err?.errors?.[0]?.message || err?.message || "unknown";
    return res.status(502).json({ error: "Erro a ler as conversas.", detail });
  }
}
