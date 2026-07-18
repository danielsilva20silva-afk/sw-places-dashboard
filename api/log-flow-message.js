import { getSheetsClient, upsertLead, upsertSubscriber } from "./ai-reply.js";
import { waitUntil } from "@vercel/functions";

// Log a ManyChat FLOW message into Ana's history + tag the lead with its reel.
//
// Context: a ManyChat flow (private reply to a reel comment) sends a first,
// STATIC message. Ana (Default Reply → api/ai-reply) only takes over once the
// person answers, but she never sees that static message because only the
// Conversations tab counts as her history. This endpoint records that static
// message as an ASSISTANT turn in Conversations (same tab/format Ana reads), so
// when the person replies Ana has the full context. It also stamps the lead with
// the originating reel's shared content (source_content) and link (source_url).
//
// Reuses the frozen ai-reply.js helpers (getSheetsClient / upsertLead /
// upsertSubscriber) exactly like convert-lead.js — api/ai-reply.js and
// _ana-prompt.js are NOT modified.
export const config = { maxDuration: 30 };

// Conversations tab (A–D: contact_id | role | message | timestamp) — same env
// override as ai-reply.js / sheets.js so the tab name stays in sync.
const CONV_TAB = process.env.GOOGLE_CONVERSATIONS_TAB || "Conversations";
// Leads tab. source_url is column O (after manual_notes at N); written to its own
// cell so the A:M write in upsertLead never has to widen its range.
const LEADS_TAB = process.env.GOOGLE_SHEETS_TAB || "Leads";
const LEADS_ID_RANGE = `${LEADS_TAB}!A2:A`;
const SOURCE_URL_COL = "O";

// Append a single ASSISTANT turn (the flow's static message) in the exact 4-column
// format Ana uses. A single row — not appendTurns — because there is no user turn
// to pair it with (an empty user row would show as a blank bubble and pollute
// history).
async function appendAssistantTurn(sheets, spreadsheetId, contactId, message) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${CONV_TAB}!A:D`,
    valueInputOption: "RAW",
    requestBody: { values: [[String(contactId), "assistant", message, new Date().toISOString()]] },
  });
}

// Write the reel link into the lead's source_url cell (column O), located by id.
// Called right after upsertLead so the row is guaranteed to exist. Targeted cell
// write → never touches username/source_content/manual_notes (L/M/N).
async function writeSourceUrl(sheets, spreadsheetId, leadId, url) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEADS_ID_RANGE });
  const ids = resp.data.values || [];
  const idx = ids.findIndex((r) => r && String(r[0]) === String(leadId));
  if (idx === -1) return; // lead row not found (shouldn't happen post-upsert)
  const rowNumber = idx + 2; // +1 header, +1 for 1-based rows
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${LEADS_TAB}!${SOURCE_URL_COL}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[String(url)]] },
  });
}

// The actual work — exported so the logic is unit-testable with a mock client.
export async function logFlowMessage({ sheets, spreadsheetId, contactId, message, sourceContent, sourceUrl, name, username }) {
  // 1. Record the static message as an assistant turn (essential).
  await appendAssistantTurn(sheets, spreadsheetId, contactId, message);

  // 2. Subscriber identity — cheap, only when ManyChat passed name/username. A
  //    getInfo lookup is intentionally deferred to Ana's first turn (keeps this
  //    endpoint fast); upsertSubscriber never blanks an existing name/username.
  if (name || username) {
    await upsertSubscriber(sheets, spreadsheetId, contactId, name, username);
  }

  // 3. Stamp the lead with the reel reference (upsert by contact_id; created_at /
  //    date preserved on update — exactly how Ana's upsertLead behaves). Only
  //    when there's something to store.
  if (sourceContent || sourceUrl) {
    await upsertLead(
      sheets, spreadsheetId, String(contactId),
      { source_content: sourceContent }, "DM · ANA", name, username,
    );
    if (sourceUrl) await writeSourceUrl(sheets, spreadsheetId, String(contactId), sourceUrl);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ctx = getSheetsClient();
  if (!ctx) return res.status(500).json({ error: "Google Sheets não configurado (GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)." });
  const { sheets, spreadsheetId } = ctx;

  const body = req.body ?? {};
  console.log("[flow] incoming POST body:", JSON.stringify(body));

  const rawSid = body.subscriber_id;
  const contactId = rawSid === undefined || rawSid === null ? "" : String(rawSid).trim();
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!contactId || !message) {
    return res.status(400).json({ error: "Parâmetros obrigatórios em falta: 'subscriber_id' e 'message'." });
  }
  const sourceContent = typeof body.source_content === "string" ? body.source_content.trim() : "";
  const sourceUrl = typeof body.source_url === "string" ? body.source_url.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";

  // Respond 200 immediately (ManyChat's automation has a ~10s timeout); the
  // Sheets writes finish in the background via waitUntil — same pattern as ai-reply.
  res.status(200).json({ status: "ok" });
  waitUntil(
    logFlowMessage({ sheets, spreadsheetId, contactId, message, sourceContent, sourceUrl, name, username })
      .catch((e) => console.error(`[flow] logFlowMessage failed for ${contactId}:`, e?.message))
  );
}
