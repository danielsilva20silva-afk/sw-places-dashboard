import { getSheetsClient, generateReply, appendTurns, upsertSubscriber } from "./ai-reply.js";
import * as mc from "./_manychat.js";

// Claude generation can take a few seconds; give it room.
export const config = { maxDuration: 60 };

// TEMPORARY TOOL — "Recuperar conversas".
// Gustavo pastes a pre-Ana Instagram DM (handle + message). We generate Ana's
// reply, he copies it into Instagram by hand (these are outside Meta's 24h
// window, so we can NOT sendFlow), and on confirmation we save both turns to
// the Conversations tab keyed by subscriber_id — the same key the live webhook
// uses — so the next time the person messages, live Ana has full context.

function cleanHandle(h) {
  return String(h || "").trim().replace(/^@+/, "").toLowerCase();
}

// Resolve an Instagram handle to a ManyChat subscriber.
// Uses GET /fb/subscriber/findByName (ManyChat's only public username-ish
// lookup — it matches loosely on name/username, so we disambiguate here).
// Returns { id, name, username, first, last, method } or null when it can't
// match confidently (caller then asks for a subscriber_id instead).
async function resolveHandle(handle) {
  const q = cleanHandle(handle);
  if (!q) return null;
  let candidates = [];
  try {
    candidates = await mc.findByName(q);
  } catch (e) {
    console.error(`[recover] findByName failed for "${q}":`, e?.message);
    return null;
  }
  const profiles = candidates.map((c) => mc.subscriberProfile(c)).filter((p) => p.id);
  // Prefer an exact @username match (case-insensitive).
  const exact = profiles.filter((p) => cleanHandle(p.username) === q);
  if (exact.length === 1) return { ...exact[0], method: "username" };
  if (exact.length > 1) return null; // ambiguous — don't guess
  // No username match: only trust a lone result (never guess among many).
  if (profiles.length === 1) return { ...profiles[0], method: "single-result" };
  return null;
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
  const mode = String(body.mode || "generate");

  try {
    // ── SAVE: append the (user, assistant) turns + persist the profile ──
    if (mode === "save") {
      const contactId = String(body.subscriber_id || "").trim();
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const reply = typeof body.reply === "string" ? body.reply.trim() : "";
      if (!contactId || !message || !reply) {
        return res.status(400).json({ error: "Faltam campos (subscriber_id, message, reply)." });
      }
      // Store exactly what Gustavo sent (he may have edited the reply).
      await appendTurns({ sheets, spreadsheetId, contactId, userMessage: message, assistantReply: reply });
      await upsertSubscriber(sheets, spreadsheetId, contactId, body.name || "", body.username || "");
      console.log(`[recover] saved history for ${contactId} (msg + reply).`);
      return res.status(200).json({ saved: true, subscriber_id: contactId });
    }

    // ── GENERATE: resolve subscriber → Ana reply (no save) ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada." });

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "A mensagem da pessoa é obrigatória." });

    let subscriberId = "";
    let name = "";
    let username = "";
    let method = "";

    const rawSid = String(body.subscriber_id || "").trim();
    if (rawSid) {
      // subscriber_id given directly — the reliable path.
      subscriberId = rawSid;
      method = "subscriber_id";
      try {
        const p = mc.subscriberProfile(await mc.getSubscriberInfo(subscriberId));
        name = p.name || [p.first, p.last].filter(Boolean).join(" ");
        username = p.username;
      } catch (e) {
        console.error(`[recover] getInfo failed for ${subscriberId}:`, e?.message);
      }
    } else {
      // Resolve from the handle via findByName.
      const resolved = await resolveHandle(body.handle);
      if (!resolved) {
        return res.status(422).json({
          status: "need_subscriber_id",
          error: "Não encontrei essa conta pelo handle. Abre a conversa no ManyChat, copia o Subscriber ID e cola-o no campo abaixo.",
        });
      }
      subscriberId = resolved.id;
      name = resolved.name || [resolved.first, resolved.last].filter(Boolean).join(" ");
      username = resolved.username;
      method = resolved.method;
    }

    const firstName = name ? name.split(/\s+/)[0] : "";
    console.log("[recover] resolved subscriber:", JSON.stringify({ subscriberId, name, username, method }));

    // Generate WITHOUT persisting — save happens only after Gustavo confirms.
    const { reply } = await generateReply({
      sheets, spreadsheetId, apiKey,
      contactId: String(subscriberId), message, profileFirstName: firstName,
    });
    if (!reply) return res.status(502).json({ error: "A Ana não devolveu resposta." });

    return res.status(200).json({ subscriber_id: String(subscriberId), name, username, method, reply });
  } catch (err) {
    console.error("recover-conversation error:", err);
    const detail =
      err?.errors?.[0]?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "unknown";
    return res.status(502).json({ error: "Erro ao recuperar a conversa.", detail });
  }
}
