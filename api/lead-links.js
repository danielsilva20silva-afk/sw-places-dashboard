import serverConfig from "./_config.js";
import { getContext } from "./_adapters/supabase.js";

// Lead-merge links — the link-based, reversible "these two records are the same
// person" store. A merge is one row in Supabase `lead_links`
// (primary_id, secondary_id); the dashboard applies links at READ time and never
// modifies the source records. Unmerge = delete the row.
//
// Feature-flagged per client (serverConfig.dedupe). Reuses the same Supabase
// service-role client as the brandon subscribers / meta_lead_notes side table
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). The table + indexes are created
// manually in the Supabase SQL editor; unique(secondary_id) enforces that a
// record can be a secondary of only one primary.

const TABLE = "lead_links";
const s = (v) => (v == null ? "" : String(v));

export default async function handler(req, res) {
  // Gate 1: feature enabled for this client? (off clients get zero surface)
  if (!serverConfig.dedupe) {
    return res.status(403).json({ error: "Merge não está disponível para este cliente." });
  }
  // Gate 2: Supabase configured? (missing env → friendly, never a crash)
  const ctx = getContext();
  if (!ctx) {
    return res.status(400).json({ error: "Armazenamento de merges indisponível." });
  }
  const { supabase } = ctx;

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("id, primary_id, secondary_id, created_at")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const b = req.body ?? {};
      const primary_id = s(b.primary_id).trim();
      const secondary_id = s(b.secondary_id).trim();
      if (!primary_id || !secondary_id) {
        return res.status(400).json({ error: "Faltam primary_id / secondary_id." });
      }
      if (primary_id === secondary_id) {
        return res.status(400).json({ error: "primary_id e secondary_id não podem ser iguais." });
      }
      // A record can be a secondary of only one primary (unique(secondary_id)):
      // upsert so re-merging a secondary just re-points it, never 409s.
      const { data, error } = await supabase
        .from(TABLE)
        .upsert({ primary_id, secondary_id }, { onConflict: "secondary_id" })
        .select("id, primary_id, secondary_id, created_at")
        .single();
      if (error) throw new Error(error.message);
      return res.status(201).json(data);
    }

    if (req.method === "DELETE") {
      const id = s(req.query?.id ?? req.body?.id).trim();
      const secondary_id = s(req.query?.secondary_id ?? req.body?.secondary_id).trim();
      if (!id && !secondary_id) {
        return res.status(400).json({ error: "Parâmetro 'id' ou 'secondary_id' em falta." });
      }
      let q = supabase.from(TABLE).delete();
      q = id ? q.eq("id", id) : q.eq("secondary_id", secondary_id);
      const { error } = await q;
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("lead-links handler error:", err?.message || err);
    // GET degrades to an empty list so the dashboard just shows no merges; writes
    // surface a friendly error the drawer can display inline.
    if (req.method === "GET") return res.status(200).json([]);
    return res.status(502).json({ error: "Erro a comunicar com o armazenamento de merges." });
  }
}
