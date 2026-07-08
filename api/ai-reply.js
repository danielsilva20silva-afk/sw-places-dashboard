import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { ANA_PROMPT } from "./_ana-prompt.js";

// "Conversations" tab, columns A–D: contact_id | role | message | timestamp
const SHEET_NAME = process.env.GOOGLE_CONVERSATIONS_TAB || "Conversations";
const DATA_RANGE = `${SHEET_NAME}!A2:D`;

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!email || !key || !spreadsheetId) return null;

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

// Create the Conversations tab (with headers) if it doesn't exist yet.
async function ensureTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title)" });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === SHEET_NAME);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:D1`,
    valueInputOption: "RAW",
    requestBody: { values: [["contact_id", "role", "message", "timestamp"]] },
  });
}

// "Leads" tab, columns A–J: id | name | email | phone | budget | intention | source | date | status | notes
const LEADS_TAB = process.env.GOOGLE_SHEETS_TAB || "Leads";
const LEADS_RANGE = `${LEADS_TAB}!A2:J`;

// Extract + strip the hidden <lead>{...}</lead> block Ana may append.
// Returns { clean, data } — data is the parsed JSON, or null if absent/invalid.
function extractLead(reply) {
  const match = reply.match(/<lead>([\s\S]*?)<\/lead>/i);
  let data = null;
  if (match) {
    try { data = JSON.parse(match[1].trim()); }
    catch (e) { console.error("lead JSON parse failed:", e?.message); }
  }
  let clean = reply.replace(/<lead>[\s\S]*?<\/lead>/i, "").trim();
  // Safety net: drop any unclosed/leftover block so the user never sees it
  const stray = clean.indexOf("<lead>");
  if (stray !== -1) clean = clean.slice(0, stray).trim();
  return { clean, data };
}

// Create or update a lead from Ana's block. Deduped by lead id === contact_id,
// so one conversation maps to at most one lead. Preserves fields a human may
// have changed (budget/source/date/status).
async function upsertLead(sheets, spreadsheetId, leadId, data, source) {
  const today = new Date().toISOString().slice(0, 10);
  const zone = String(data.zone || "").trim();
  const summary = String(data.summary || "").trim();
  const notes = zone && !summary.toLowerCase().includes(zone.toLowerCase())
    ? `${summary}${summary ? " — " : ""}Zona de interesse: ${zone}`
    : summary;

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEADS_RANGE });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => r && String(r[0]) === String(leadId));

  if (idx === -1) {
    const row = [
      leadId, data.name || "", data.email || "", data.phone || "", "",
      data.intention || "", source, today, "Novo", notes,
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: `${LEADS_TAB}!A:J`, valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    return "created";
  }

  const ex = rows[idx];
  const merged = [
    leadId,
    data.name || ex[1] || "",
    data.email || ex[2] || "",
    data.phone || ex[3] || "",
    ex[4] || "",                    // budget preserved
    data.intention || ex[5] || "",
    ex[6] || source,                // source preserved
    ex[7] || today,                 // date preserved
    ex[8] || "Novo",                // status preserved
    notes || ex[9] || "",           // latest AI summary preferred
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${LEADS_TAB}!A${idx + 2}:J${idx + 2}`, valueInputOption: "RAW",
    requestBody: { values: [merged] },
  });
  return "updated";
}

export default async function handler(req, res) {
  const ctx = getSheetsClient();
  if (!ctx) {
    return res.status(500).json({ error: "Google Sheets não configurado (GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)." });
  }
  const { sheets, spreadsheetId } = ctx;

  try {
    // DELETE ?contact_id=X → clear that conversation's rows (used by "Limpar conversa")
    if (req.method === "DELETE") {
      const contactId = req.query?.contact_id ?? req.body?.contact_id;
      if (!contactId) return res.status(400).json({ error: "Parâmetro 'contact_id' em falta." });
      await ensureTab(sheets, spreadsheetId);
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
      const rows = resp.data.values || [];
      const keep = rows.filter((r) => r && r[0] !== contactId);
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: DATA_RANGE });
      if (keep.length) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!A2`,
          valueInputOption: "RAW",
          requestBody: { values: keep },
        });
      }
      return res.status(200).json({ cleared: true });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada." });

    const { contact_id, message, source } = req.body ?? {};
    if (!contact_id || !message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Campos 'contact_id' e 'message' são obrigatórios." });
    }
    const leadSource = (source && String(source).trim()) || "AI CHAT";

    await ensureTab(sheets, spreadsheetId);

    // 1. Read this contact's history, in order
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
    const rows = resp.data.values || [];
    const history = rows
      .filter((r) => r && r[0] === contact_id && (r[1] === "user" || r[1] === "assistant") && r[2])
      .map((r) => ({ role: r[1], content: String(r[2]) }));

    // 2. Call Anthropic with the system prompt + prior turns + the new message
    const client = new Anthropic({ apiKey });
    const aiRes = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: ANA_PROMPT,
      messages: [...history, { role: "user", content: message }],
    });
    const rawReply = aiRes.content.find((b) => b.type === "text")?.text?.trim() || "";

    // 3. Extract + strip Ana's hidden <lead> block — only clean text is saved/shown
    const { clean: reply, data: leadData } = extractLead(rawReply);

    // 4. Persist both turns (clean reply only)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:D`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [contact_id, "user", message, new Date().toISOString()],
          [contact_id, "assistant", reply, new Date().toISOString()],
        ],
      },
    });

    // 5. If Ana collected a contact, create/update the lead (best-effort:
    //    a lead failure must never break the conversation)
    if (leadData && (String(leadData.phone || "").trim() || String(leadData.email || "").trim())) {
      try {
        await upsertLead(sheets, spreadsheetId, contact_id, leadData, leadSource);
      } catch (e) {
        console.error("upsertLead failed:", e?.message);
      }
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("ai-reply error:", err);
    const detail =
      err?.errors?.[0]?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "unknown";
    const code = typeof err?.status === "number" ? err.status : (typeof err?.code === "number" ? err.code : 502);
    return res.status(code >= 400 && code < 600 ? code : 502).json({ error: "Erro ao gerar resposta da Ana.", detail });
  }
}
