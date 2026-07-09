import { google } from "googleapis";

// Active conversation = a distinct contact_id in "Conversations" that is NOT
// yet a lead (its id is absent from the Leads tab). Muted state comes from the
// AnaMuted mirror tab (see /api/toggle-ana).
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ctx = getSheetsClient();
  if (!ctx) {
    return res.status(500).json({ error: "Google Sheets não configurado." });
  }
  const { sheets, spreadsheetId } = ctx;

  try {
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

    // Group conversations by contact_id (rows are in chronological order)
    const byId = new Map();
    for (const r of conv) {
      const id = r && r[0];
      if (!id) continue;
      const msg = r[2] || "";
      const ts = r[3] || "";
      const e = byId.get(id) || { contact_id: id, lastMessage: "", lastTimestamp: "" };
      if (msg) e.lastMessage = msg;
      if (ts) e.lastTimestamp = ts;
      byId.set(id, e);
    }

    const active = [];
    for (const [id, e] of byId) {
      if (leadIds.has(String(id))) continue; // already a lead → not an "active conversation"
      const p = profiles.get(String(id)) || { name: "", username: "" };
      active.push({
        contact_id: id,
        name: p.name,
        username: p.username,
        lastMessage: e.lastMessage,
        lastTimestamp: e.lastTimestamp,
        active: !muted.has(String(id)),
      });
    }
    active.sort((a, b) => String(b.lastTimestamp).localeCompare(String(a.lastTimestamp)));

    return res.status(200).json(active);
  } catch (err) {
    console.error("conversations error:", err);
    const detail = err?.errors?.[0]?.message || err?.message || "unknown";
    return res.status(502).json({ error: "Erro a ler as conversas.", detail });
  }
}
