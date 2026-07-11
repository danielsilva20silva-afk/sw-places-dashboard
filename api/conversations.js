import adapter from "./_adapters/index.js";

// Thin handler: validate request → call the data adapter → return response.
// All Google Sheets logic lives in api/_adapters/sheets.js.
export default async function handler(req, res) {
  const ctx = adapter.getContext();
  if (!ctx) {
    return res.status(500).json({ error: "Fonte de dados não configurada." });
  }

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
      return res.status(201).json(await adapter.addMessage(ctx, { contactId, role, message, timestamp: b.timestamp }));
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
      return res.status(200).json(await adapter.updateMessage(ctx, { contactId, row, message, timestamp: b.timestamp }));
    }

    // ── DELETE: remove a single message row (verified) ──
    if (req.method === "DELETE") {
      const contactId = String(req.query?.contact_id ?? req.body?.contact_id ?? "").trim();
      const row = parseInt(req.query?.row ?? req.body?.row, 10);
      const timestamp = req.query?.timestamp ?? req.body?.timestamp;
      if (!contactId || !(row >= 2)) {
        return res.status(400).json({ error: "Campos obrigatórios: contact_id, row." });
      }
      return res.status(200).json(await adapter.deleteMessage(ctx, { contactId, row, timestamp }));
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST, PATCH, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // GET ?contact_id=X → single thread; otherwise → all conversations.
    const contactId = req.query?.contact_id;
    if (contactId) {
      return res.status(200).json(await adapter.getThread(ctx, contactId));
    }
    return res.status(200).json(await adapter.listConversations(ctx));
  } catch (err) {
    // Domain errors from the adapter carry their own status + message.
    if (err?.expose) return res.status(err.status).json({ error: err.message });
    console.error("conversations error:", err);
    const detail = err?.errors?.[0]?.message || err?.message || "unknown";
    return res.status(502).json({ error: "Erro a ler as conversas.", detail });
  }
}
