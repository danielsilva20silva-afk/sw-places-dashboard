import { getSheetsClient, upsertLead } from "./ai-reply.js";
import Anthropic from "@anthropic-ai/sdk";

// Promote a conversation into a lead manually (from the Conversas tab).
// The lead id === contact_id (ManyChat subscriber_id), so the lead links to the
// conversation and future messages keep enriching it. Reuses upsertLead so the
// row layout (created_at, username, status "Novo") stays consistent, and is
// deduped by id: an existing lead is returned untouched, never duplicated.
export const config = { maxDuration: 30 };

const LEADS_TAB = process.env.GOOGLE_SHEETS_TAB || "Leads";
const LEADS_RANGE = `${LEADS_TAB}!A2:M`;
const CONV_TAB = process.env.GOOGLE_CONVERSATIONS_TAB || "Conversations";
const CONV_RANGE = `${CONV_TAB}!A2:D`;

// Mirror of leads.js rowToLead (columns A–L).
function rowToLead(r) {
  return {
    id: r[0] ?? "", name: r[1] ?? "", email: r[2] ?? "", phone: r[3] ?? "",
    budget: r[4] ?? "", intention: r[5] ?? "", source: r[6] ?? "", date: r[7] ?? "",
    status: r[8] || "Novo", notes: r[9] ?? "", created_at: r[10] ?? "", username: r[11] ?? "", source_content: r[12] ?? "",
  };
}

async function findLead(sheets, spreadsheetId, id) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEADS_RANGE });
  const rows = resp.data.values || [];
  const row = rows.find((r) => r && String(r[0]) === String(id));
  return row ? rowToLead(row) : null;
}

// Short pt-PT summary of the conversation so far, for the lead's notes.
// Best effort: returns "" on any problem (no messages, no key, API error).
async function summarize(sheets, spreadsheetId, apiKey, contactId) {
  try {
    if (!apiKey) return "";
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: CONV_RANGE });
    const rows = resp.data.values || [];
    const lines = rows
      .filter((r) => r && String(r[0]) === String(contactId) && (r[1] === "user" || r[1] === "assistant") && r[2])
      .map((r) => `${r[1] === "user" ? "Cliente" : "Ana"}: ${String(r[2])}`);
    if (!lines.length) return "";
    const client = new Anthropic({ apiKey });
    const ai = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: "Resume em 1 a 3 frases, em português de Portugal, o que a pessoa procura e o contexto útil para o Gustavo (um agente imobiliário na Costa Vicentina). Escreve apenas o resumo, sem preâmbulo e sem aspas.",
      messages: [{ role: "user", content: `Conversa:\n\n${lines.join("\n")}` }],
    });
    return ai.content.find((b) => b.type === "text")?.text?.trim() || "";
  } catch (e) {
    console.error("[convert] summary failed:", e?.message);
    return "";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ctx = getSheetsClient();
  if (!ctx) return res.status(500).json({ error: "Google Sheets não configurado." });
  const { sheets, spreadsheetId } = ctx;

  const body = req.body ?? {};
  const contactId = String(body.contact_id || "").trim();
  if (!contactId) return res.status(400).json({ error: "Parâmetro 'contact_id' em falta." });
  const name = String(body.name || "").trim();
  const username = String(body.username || "").trim();

  try {
    // Dedupe: if a lead already exists for this id, return it untouched.
    const existing = await findLead(sheets, spreadsheetId, contactId);
    if (existing) return res.status(200).json({ status: "exists", lead: existing });

    // Summary (best effort) → create via the shared upsert (keyed by id).
    const summary = await summarize(sheets, spreadsheetId, process.env.ANTHROPIC_API_KEY, contactId);
    await upsertLead(sheets, spreadsheetId, contactId, { summary }, "DM · ANA", name, username);
    console.log(`[convert] created lead ${contactId} (name=${JSON.stringify(name)}, username=${JSON.stringify(username)}, summary=${summary ? "yes" : "no"}).`);

    const lead = await findLead(sheets, spreadsheetId, contactId);
    return res.status(201).json({ status: "created", lead });
  } catch (err) {
    console.error("convert-lead error:", err);
    const detail = err?.errors?.[0]?.message || err?.response?.data?.error?.message || err?.message || "unknown";
    return res.status(502).json({ error: "Erro ao converter em lead.", detail });
  }
}
