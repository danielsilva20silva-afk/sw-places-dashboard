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

export function getSheetsClient() {
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

// "Subscribers" tab, columns A–D: contact_id | name | username | last_seen
// Holds the display identity of every ManyChat subscriber so active
// conversations (which have no lead yet) can still show who is talking.
const SUBS_TAB = process.env.GOOGLE_SUBSCRIBERS_TAB || "Subscribers";
const SUBS_RANGE = `${SUBS_TAB}!A2:D`;

// Create the Subscribers tab (with headers) if it doesn't exist yet.
async function ensureSubsTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title)" });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === SUBS_TAB);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SUBS_TAB } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SUBS_TAB}!A1:D1`,
    valueInputOption: "RAW",
    requestBody: { values: [["contact_id", "name", "username", "last_seen"]] },
  });
}

// Upsert a subscriber's display name/username (deduped by contact_id). Best
// effort — never throws into the caller. Never blanks an existing name/username
// with an empty value (a later message that fails to resolve a name won't wipe
// a previously-captured one).
export async function upsertSubscriber(sheets, spreadsheetId, contactId, name, username) {
  try {
    await ensureSubsTab(sheets, spreadsheetId);
    const now = new Date().toISOString();
    const nm = String(name || "").trim();
    const un = String(username || "").trim();
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: SUBS_RANGE });
    const rows = resp.data.values || [];
    const idx = rows.findIndex((r) => r && String(r[0]) === String(contactId));
    if (idx === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range: `${SUBS_TAB}!A:D`, valueInputOption: "RAW",
        requestBody: { values: [[String(contactId), nm, un, now]] },
      });
      console.log(`[ana] subscriber persisted (new) ${contactId}:`, JSON.stringify({ name: nm, username: un }));
    } else {
      const ex = rows[idx];
      const merged = [String(contactId), nm || ex[1] || "", un || ex[2] || "", now];
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${SUBS_TAB}!A${idx + 2}:D${idx + 2}`, valueInputOption: "RAW",
        requestBody: { values: [merged] },
      });
      console.log(`[ana] subscriber persisted (update) ${contactId}:`, JSON.stringify({ name: merged[1], username: merged[2] }));
    }
  } catch (e) {
    console.error(`[ana] upsertSubscriber failed for ${contactId}:`, e?.message);
  }
}

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

// Generate Ana's reply: read history → Claude → strip <lead>. Does NOT persist
// anything. Shared by the live flow and the "Recuperar conversas" tool (which
// needs the reply before Gustavo confirms he sent it).
export async function generateReply({ sheets, spreadsheetId, apiKey, contactId, message, profileFirstName }) {
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
  return { reply, leadData };
}

// Append a user turn + an assistant turn to the Conversations tab, keyed by
// contactId (same key the live webhook uses). `assistantReply` is passed in so
// the recovery flow can store exactly what Gustavo actually sent.
export async function appendTurns({ sheets, spreadsheetId, contactId, userMessage, assistantReply }) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A:D`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [contactId, "user", userMessage, new Date().toISOString()],
        [contactId, "assistant", assistantReply, new Date().toISOString()],
      ],
    },
  });
}

// Core: generate → persist turns → upsert lead. Shared by the test page (sync)
// and the ManyChat webhook (async).
async function generateAndPersist({ sheets, spreadsheetId, apiKey, contactId, message, source, profileName, profileFirstName }) {
  const { reply, leadData } = await generateReply({ sheets, spreadsheetId, apiKey, contactId, message, profileFirstName });

  await appendTurns({ sheets, spreadsheetId, contactId, userMessage: message, assistantReply: reply });

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
    // a. Fetch subscriber info: human-takeover check + profile name/username.
    //    The API is the PRIMARY source of the name; webhook-body values (if any)
    //    are only a fallback.
    let apiFullName = "";   // real name only (no username fallback)
    let apiUsername = "";
    let apiFirst = "";
    try {
      const info = await mc.getSubscriberInfo(subscriberId);
      if (mc.subscriberHasTag(info, MC_HUMAN_TAG)) {
        console.log(`[ana] subscriber ${subscriberId} has '${MC_HUMAN_TAG}' tag — staying silent.`);
        return;
      }
      const p = mc.subscriberProfile(info);
      apiFullName = p.name || [p.first, p.last].filter(Boolean).join(" ");
      apiUsername = p.username || "";
      apiFirst = p.first || (p.name ? p.name.split(/\s+/)[0] : "");
      console.log(`[ana] getInfo profile ${subscriberId}:`, JSON.stringify({ name: p.name, first_name: p.first, last_name: p.last, username: p.username, resolvedName: apiFullName || apiUsername }));
    } catch (e) {
      // Can't confirm takeover / fetch profile; proceed (bias toward answering).
      console.error(`[ana] getInfo failed for ${subscriberId}, proceeding:`, e?.message);
    }

    // Lead name: full name → @username → webhook-body name. (Claude's stated
    // name in the <lead> block still wins inside upsertLead.)
    const effName = apiFullName || apiUsername || profileName || "";
    const effFirst = apiFirst || profileFirstName || "";

    // Persist the display identity so active conversations (no lead yet) show
    // who's talking. Prefer the real name; keep username as a separate column.
    await upsertSubscriber(
      sheets, spreadsheetId, String(subscriberId),
      apiFullName || profileName || "", apiUsername,
    );

    // b–e. Generate reply + persist turns + upsert lead
    const { reply } = await generateAndPersist({
      sheets, spreadsheetId, apiKey,
      contactId: String(subscriberId), message, source: "DM · ANA",
      profileName: effName, profileFirstName: effFirst,
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

    // Log the raw body of every POST (test page + ManyChat). Logged before
    // detection so a mis-keyed payload — e.g. the subscriber id under a name
    // other than "subscriber_id" — is still visible in Vercel logs.
    console.log("[ana] incoming POST body:", JSON.stringify(body));

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
      console.log("[ana] ManyChat extracted:", JSON.stringify({
        subscriber_id: body.subscriber_id ?? null,
        message: body.message ?? null,
        first_name: body.first_name ?? null,
        last_name: body.last_name ?? null,
      }));
      console.log("[ana] field present?", JSON.stringify({
        subscriber_id: body.subscriber_id !== undefined,
        message: body.message !== undefined,
        first_name: body.first_name !== undefined,
        last_name: body.last_name !== undefined,
      }));
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
