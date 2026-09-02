import serverConfig from "./_config.js";
import { getContext } from "./_adapters/supabase.js";

// WhatsApp message templates — the texts the "Meta Leads Notifier" Apps Script
// sends with each new-lead notification, editable from the dashboard.
//
// Two consumers, one endpoint:
//   • Apps Script (read-only): GET ?token=<WA_TEMPLATES_TOKEN> → ACTIVE templates
//     only, as a flat [{ match_key, audience, body }] it can rotate through.
//     Token-gated because the script can't do session auth. Wrong/missing → 401.
//   • Dashboard UI: GET (no token) → ALL rows (full shape, incl. inactive) for the
//     manager; POST/PATCH/DELETE to create/edit/toggle/reorder/remove. These run
//     in normal dashboard context with the Supabase service key (never client-
//     side), same posture as the other dashboard endpoints.
//
// Feature-flagged per client (serverConfig.templates → brandon only). Table +
// RLS (service-role only) created manually in Supabase.

const TABLE = "wa_templates";
const s = (v) => (v == null ? "" : String(v));
const AUDIENCES = new Set(["any", "specific_area", "open"]);

// Only the columns the manager/consumer use.
const COLS = "id, match_key, audience, body, active, sort, updated_at";

class DomainError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}

function normAudience(v) {
  const a = s(v).trim();
  return AUDIENCES.has(a) ? a : "any";
}

// Build the column patch for a write, mapping only provided keys.
function bodyToColumns(b, { forInsert } = {}) {
  const cols = {};
  if (b.match_key !== undefined) cols.match_key = s(b.match_key).trim().toLowerCase();
  if (b.audience !== undefined) cols.audience = normAudience(b.audience);
  if (b.body !== undefined) cols.body = s(b.body);
  if (b.active !== undefined) cols.active = !!b.active;
  if (b.sort !== undefined) cols.sort = Number.isFinite(+b.sort) ? Math.trunc(+b.sort) : 0;
  if (forInsert) {
    if (!cols.match_key) throw new DomainError(400, "match_key em falta.");
    if (!("audience" in cols)) cols.audience = "any";
    if (!("body" in cols) || !cols.body.trim()) throw new DomainError(400, "body em falta.");
  }
  return cols;
}

export default async function handler(req, res) {
  // Gate 1: feature enabled for this client?
  if (!serverConfig.templates) {
    return res.status(403).json({ error: "Templates não estão disponíveis para este cliente." });
  }
  // Gate 2: Supabase configured?
  const ctx = getContext();
  if (!ctx) {
    return res.status(400).json({ error: "Armazenamento de templates indisponível." });
  }
  const { supabase } = ctx;

  try {
    if (req.method === "GET") {
      // Consumer path: a `token` param means the Apps Script — validate strictly.
      if (req.query?.token !== undefined) {
        const expected = process.env.WA_TEMPLATES_TOKEN || "";
        if (!expected || s(req.query.token) !== expected) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const { data, error } = await supabase
          .from(TABLE)
          .select("match_key, audience, body")
          .eq("active", true)
          .order("match_key", { ascending: true })
          .order("audience", { ascending: true })
          .order("sort", { ascending: true });
        if (error) throw new Error(error.message);
        return res.status(200).json(data || []);
      }
      // UI path: full rows (incl. inactive), ordered for grouping.
      const { data, error } = await supabase
        .from(TABLE)
        .select(COLS)
        .order("match_key", { ascending: true })
        .order("audience", { ascending: true })
        .order("sort", { ascending: true })
        .order("updated_at", { ascending: true });
      if (error) throw new Error(error.message);
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const cols = bodyToColumns(req.body ?? {}, { forInsert: true });
      const { data, error } = await supabase.from(TABLE).insert(cols).select(COLS).single();
      if (error) throw new Error(error.message);
      return res.status(201).json(data);
    }

    if (req.method === "PATCH") {
      const b = req.body ?? {};
      const id = s(b.id).trim();
      if (!id) return res.status(400).json({ error: "Campo 'id' em falta." });
      const cols = bodyToColumns(b);
      if ("body" in cols && !cols.body.trim()) {
        return res.status(400).json({ error: "O texto não pode ficar vazio." });
      }
      if (Object.keys(cols).length === 0) {
        const { data: cur } = await supabase.from(TABLE).select(COLS).eq("id", id).maybeSingle();
        return res.status(200).json(cur || {});
      }
      cols.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from(TABLE).update(cols).eq("id", id).select(COLS).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return res.status(404).json({ error: "Template não encontrado." });
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const id = s(req.query?.id ?? req.body?.id).trim();
      if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });
      const { error } = await supabase.from(TABLE).delete().eq("id", id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err?.expose) return res.status(err.status).json({ error: err.message });
    console.error("wa-templates handler error:", err?.message || err);
    return res.status(502).json({ error: "Erro a comunicar com o armazenamento de templates." });
  }
}
