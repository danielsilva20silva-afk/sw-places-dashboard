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
    // Single thread: ?contact_id=X → just that conversation's messages
    // (used by the lead detail panel). Chronological order.
    const contactId = req.query?.contact_id;
    if (contactId) {
      const conv = await getValues(sheets, spreadsheetId, CONV_RANGE);
      const messages = [];
      for (const r of conv) {
        if (!r || String(r[0]) !== String(contactId)) continue;
        const role = r[1] || "";
        if (role !== "user" && role !== "assistant") continue;
        messages.push({ role, message: r[2] || "", timestamp: r[3] || "" });
      }
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
