import adapter from "./_adapters/index.js";

// Thin handler: validate request → call the data adapter → return response.
// All Google Sheets logic lives in api/_adapters/sheets.js.
export default async function handler(req, res) {
  const ctx = adapter.getContext();
  if (!ctx) {
    return res.status(500).json({
      error: "Fonte de dados não configurada.",
    });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(await adapter.getLeads(ctx));
    }

    if (req.method === "POST") {
      const b = req.body ?? {};
      if (!b.name && !b.email) {
        return res.status(400).json({ error: "Lead precisa de pelo menos nome ou email." });
      }
      return res.status(201).json(await adapter.addLead(ctx, b));
    }

    if (req.method === "PATCH") {
      const b = req.body ?? {};
      if (!b.id) return res.status(400).json({ error: "Campo 'id' em falta." });
      return res.status(200).json(await adapter.updateLead(ctx, b.id, b));
    }

    if (req.method === "DELETE") {
      const id = req.query?.id ?? req.body?.id;
      if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });
      return res.status(200).json(await adapter.deleteLead(ctx, id));
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    // Domain errors from the adapter carry their own status + message.
    if (err?.expose) return res.status(err.status).json({ error: err.message });
    console.error("leads handler error:", err);
    const detail =
      err?.errors?.[0]?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "unknown";
    const code = typeof err?.code === "number" ? err.code : err?.response?.status;
    return res
      .status(code >= 400 && code < 600 ? code : 502)
      .json({ error: "Erro a comunicar com a fonte de dados.", detail });
  }
}
