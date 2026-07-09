import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import { ANA_PROMPT } from "./_ana-prompt.js";
import * as mc from "./_manychat.js";

// Let the background delivery work (Claude + ManyChat calls) finish after we
// return the immediate 200 to ManyChat.
export const config = { maxDuration: 60 };

// ManyChat delivery config (overridable via env)
const MC_FIELD_ID = Number(process.env.MANYCHAT_ANA_FIELD_ID || 14760048);
const MC_FLOW_NS = process.env.MANYCHAT_FLOW_NS || "content20260708180843_207601";
const MC_HUMAN_TAG = process.env.MANYCHAT_HUMAN_TAG || "Humano";

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

// Current date/time helpers in Europe/Lisbon.
function lisbonStamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}
function lisbonHuman() {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
}

// Create or update a lead from Ana's block. Deduped by lead id === contact_id,
// so one conversation maps to at most one lead. Preserves fields a human may
// have changed (budget/source/date/status).
async function upsertLead(sheets, spreadsheetId, leadId, data, source, fallbackName) {
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
      leadId, data.name || fallbackName || "", data.email || "", data.phone || "", data.budget || "",
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
    data.name || ex[1] || fallbackName || "",
    data.email || ex[2] || "",
    data.phone || ex[3] || "",
    data.budget || ex[4] || "",     // budget from block, else preserved
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

// Core: read history → Claude → strip <lead> → persist turns → upsert lead.
// Shared by the test page (sync) and the ManyChat webhook (async).
async function generateAndPersist({ sheets, spreadsheetId, apiKey, contactId, message, source, profileName, profileFirstName }) {
  await ensureTab(sheets, spreadsheetId);

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
  const rows = resp.data.values || [];
  const history = rows
    .filter((r) => r && r[0] === contactId && (r[1] === "user" || r[1] === "assistant") && r[2])
    .map((r) => {
      const content = String(r[2]);
      // Prefix past USER messages with their send time so Claude can resolve
      // relative dates; assistant turns stay clean so Ana doesn't mimic the tag.
      if (r[1] === "user" && r[3]) return { role: "user", content: `[${lisbonStamp(r[3])}] ${content}` };
      return { role: r[1], content };
    });

  const nowStamp = lisbonStamp();
  const ctx = [
    `A data e hora atuais em Portugal (Europe/Lisbon) são: ${lisbonHuman()} (${nowStamp}).`,
    `As mensagens do utilizador no histórico vêm prefixadas com [AAAA-MM-DD HH:MM], que indica quando foram enviadas. Isto são metadados: não faz parte do texto da pessoa e nunca incluis esse prefixo nas tuas respostas.`,
  ];
  if (profileFirstName && String(profileFirstName).trim()) {
    ctx.push(`O primeiro nome da pessoa (perfil de Instagram) é "${String(profileFirstName).trim()}". Podes usá-lo com naturalidade quando fizer sentido, mas não és obrigada a usá-lo em todas as mensagens.`);
  }
  const system = `${ANA_PROMPT}\n\n## Contexto (injetado automaticamente)\n${ctx.join("\n")}`;

  const client = new Anthropic({ apiKey });
  const aiRes = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system,
    messages: [...history, { role: "user", content: `[${nowStamp}] ${message}` }],
  });
  const rawReply = aiRes.content.find((b) => b.type === "text")?.text?.trim() || "";
  const { clean: reply, data: leadData } = extractLead(rawReply);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:D`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [contactId, "user", message, new Date().toISOString()],
        [contactId, "assistant", reply, new Date().toISOString()],
      ],
    },
  });

  if (leadData && (String(leadData.phone || "").trim() || String(leadData.email || "").trim())) {
    try {
      await upsertLead(sheets, spreadsheetId, contactId, leadData, source, profileName);
    } catch (e) {
      console.error("upsertLead failed:", e?.message);
    }
  }

  return { reply, leadData };
}

// ManyChat async flow: human-takeover check FIRST, then generate + deliver.
async function processManyChat({ sheets, spreadsheetId, apiKey, subscriberId, message, profileName, profileFirstName }) {
  try {
    // a. Human takeover: if the subscriber has the 'Humano' tag, stay silent.
    try {
      const info = await mc.getSubscriberInfo(subscriberId);
      if (mc.subscriberHasTag(info, MC_HUMAN_TAG)) {
        console.log(`[ana] subscriber ${subscriberId} has '${MC_HUMAN_TAG}' tag — staying silent.`);
        return;
      }
    } catch (e) {
      // Can't confirm takeover; proceed (bias toward answering) but log it.
      console.error(`[ana] getInfo failed for ${subscriberId}, proceeding:`, e?.message);
    }

    // b–e. Generate reply + persist turns + upsert lead
    const { reply } = await generateAndPersist({
      sheets, spreadsheetId, apiKey,
      contactId: String(subscriberId), message, source: "DM · ANA",
      profileName, profileFirstName,
    });
    if (!reply) {
      console.error(`[ana] empty reply for ${subscriberId}, nothing to deliver.`);
      return;
    }

    // f. Deliver: set the ana_response field, then fire the delivery flow
    await mc.setCustomField(subscriberId, MC_FIELD_ID, reply);
    await mc.sendFlow(subscriberId, MC_FLOW_NS);
  } catch (e) {
    console.error(`[ana] processManyChat failed for ${subscriberId}:`, e?.message);
  }
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
    const body = req.body ?? {};

    // ── ManyChat webhook path (detected by presence of subscriber_id) ──
    const rawSid = body.subscriber_id;
    if (rawSid !== undefined && rawSid !== null && String(rawSid).trim() !== "") {
      // Respond 200 immediately so ManyChat's automation ends (avoids its ~10s
      // timeout); waitUntil keeps the function alive to finish Claude + delivery.
      res.status(200).json({ status: "ok" });
      const subscriberId = /^\d+$/.test(String(rawSid)) ? Number(rawSid) : rawSid;
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const first = typeof body.first_name === "string" ? body.first_name.trim() : "";
      const last = typeof body.last_name === "string" ? body.last_name.trim() : "";
      const profileName = [first, last].filter(Boolean).join(" ");
      if (apiKey && message) {
        waitUntil(processManyChat({ sheets, spreadsheetId, apiKey, subscriberId, message, profileName, profileFirstName: first }));
      } else {
        console.error("[ana] ManyChat call missing ANTHROPIC_API_KEY or message; skipping.");
      }
      return;
    }

    // ── Test-page path (synchronous: { contact_id, message } → { reply }) ──
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada." });
    const { contact_id, message, source } = body;
    if (!contact_id || !message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Campos 'contact_id' e 'message' são obrigatórios." });
    }
    const leadSource = (source && String(source).trim()) || "AI CHAT";
    const { reply } = await generateAndPersist({
      sheets, spreadsheetId, apiKey, contactId: contact_id, message, source: leadSource,
    });
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
