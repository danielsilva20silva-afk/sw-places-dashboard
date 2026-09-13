import serverConfig from "./_config.js";
import { getContext } from "./_adapters/supabase.js";

// Combined Supabase-backed store for two brandon-only features, behind ONE
// serverless function (Vercel Hobby caps deployments at 12 functions). Dispatch
// by ?resource=:
//   • resource=links     → lead-merge links   (feature: dedupe)     — see below
//   • resource=templates → WhatsApp templates  (feature: templates)  — see below
//
// Each resource keeps the exact behaviour of its former standalone endpoint; only
// the route changed (/api/lead-links → /api/brandon-store?resource=links, and
// /api/wa-templates → /api/brandon-store?resource=templates). Reuses the brandon
// Supabase service-role client. Frozen files untouched; swplaces never calls this
// (both features are off there).

const s = (v) => (v == null ? "" : String(v));

class DomainError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}

// ───────────────────────── lead-merge links ─────────────────────────
// Reversible "these two records are the same person" links. GET all / POST merge
// (upsert by secondary_id) / DELETE unmerge (by id or secondary_id).
const LINKS_TABLE = "lead_links";

async function handleLinks(req, res, supabase) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from(LINKS_TABLE)
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
    // upsert so re-merging just re-points it, never 409s.
    const { data, error } = await supabase
      .from(LINKS_TABLE)
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
    let q = supabase.from(LINKS_TABLE).delete();
    q = id ? q.eq("id", id) : q.eq("secondary_id", secondary_id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

// ─────────────────────── WhatsApp templates ───────────────────────
// The texts the "Meta Leads Notifier" Apps Script sends per campaign.
//   • GET ?token=<WA_TEMPLATES_TOKEN> → ACTIVE templates, flat (Apps Script)
//   • GET (no token) → all rows (manager UI)
//   • POST/PATCH/DELETE → create/edit/toggle/reorder/remove
const TPL_TABLE = "wa_templates";
const TPL_COLS = "id, match_key, audience, body, active, sort, updated_at";
const AUDIENCES = new Set(["any", "specific_area", "open"]);

// Greetings for the {greeting} placeholder live in a tiny key-value settings
// table (wa_settings) under one row; the value is a JSON array of strings.
const SETTINGS_TABLE = "wa_settings";
const GREETINGS_KEY = "greetings";
const DEFAULT_GREETINGS = ["Hey", "Hi", "Hello"];

// Trim, drop empties, de-dupe (case-insensitive, first spelling wins).
function cleanGreetings(list) {
  const out = [];
  const seen = new Set();
  for (const g of Array.isArray(list) ? list : []) {
    const v = s(g).trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

async function readGreetings(supabase) {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE).select("value").eq("key", GREETINGS_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  const list = cleanGreetings(data?.value);
  return list.length ? list : DEFAULT_GREETINGS.slice();
}

function normAudience(v) {
  const a = s(v).trim();
  return AUDIENCES.has(a) ? a : "any";
}

function tplColumns(b, { forInsert } = {}) {
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

async function handleTemplates(req, res, supabase) {
  if (req.method === "GET") {
    // Consumer path: a `token` param means the Apps Script — validate strictly.
    if (req.query?.token !== undefined) {
      const expected = process.env.WA_TEMPLATES_TOKEN || "";
      if (!expected || s(req.query.token) !== expected) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { data, error } = await supabase
        .from(TPL_TABLE)
        .select("match_key, audience, body")
        .eq("active", true)
        .order("match_key", { ascending: true })
        .order("audience", { ascending: true })
        .order("sort", { ascending: true });
      if (error) throw new Error(error.message);
      // Consumer response: greetings + templates (templates array shape unchanged).
      const greetings = await readGreetings(supabase);
      return res.status(200).json({ greetings, templates: data || [] });
    }
    // UI path: full rows (incl. inactive), ordered for grouping.
    const { data, error } = await supabase
      .from(TPL_TABLE)
      .select(TPL_COLS)
      .order("match_key", { ascending: true })
      .order("audience", { ascending: true })
      .order("sort", { ascending: true })
      .order("updated_at", { ascending: true });
    if (error) throw new Error(error.message);
    return res.status(200).json(data || []);
  }

  if (req.method === "POST") {
    const cols = tplColumns(req.body ?? {}, { forInsert: true });
    const { data, error } = await supabase.from(TPL_TABLE).insert(cols).select(TPL_COLS).single();
    if (error) throw new Error(error.message);
    return res.status(201).json(data);
  }

  if (req.method === "PATCH") {
    const b = req.body ?? {};
    const id = s(b.id).trim();
    if (!id) return res.status(400).json({ error: "Campo 'id' em falta." });
    const cols = tplColumns(b);
    if ("body" in cols && !cols.body.trim()) {
      return res.status(400).json({ error: "O texto não pode ficar vazio." });
    }
    if (Object.keys(cols).length === 0) {
      const { data: cur } = await supabase.from(TPL_TABLE).select(TPL_COLS).eq("id", id).maybeSingle();
      return res.status(200).json(cur || {});
    }
    cols.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from(TPL_TABLE).update(cols).eq("id", id).select(TPL_COLS).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: "Template não encontrado." });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const id = s(req.query?.id ?? req.body?.id).trim();
    if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });
    const { error } = await supabase.from(TPL_TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

// ─────────────────────────── greetings ───────────────────────────
// GET → { greetings: [...] }; POST { greetings: [...] } replaces the whole list
// (cleaned; at least one required). Shares the templates feature gate.
async function handleGreetings(req, res, supabase) {
  if (req.method === "GET") {
    return res.status(200).json({ greetings: await readGreetings(supabase) });
  }

  if (req.method === "POST" || req.method === "PUT") {
    const list = cleanGreetings((req.body ?? {}).greetings);
    if (!list.length) {
      return res.status(400).json({ error: "É preciso pelo menos uma saudação." });
    }
    const { error } = await supabase
      .from(SETTINGS_TABLE)
      .upsert({ key: GREETINGS_KEY, value: list, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return res.status(200).json({ greetings: list });
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}

// ─────────────────────────── lead actions ───────────────────────────
// Per-lead "what's next" tasks (next-action tracking). Keyed by the composite
// lead id (same ids as lead_links — works for Supabase AND Meta-sheet leads).
//   GET    → all pending + the 100 most recent completed
//   POST   → create
//   PATCH  → edit / complete (done=true stamps done_at) / reopen (clears it)
//   DELETE → remove
const ACTIONS_TABLE = "lead_actions";
const ACTION_COLS = "id, lead_id, title, description, due_at, done, done_at, created_at";

function actionColumns(b, { forInsert } = {}) {
  const cols = {};
  if (b.lead_id !== undefined) cols.lead_id = s(b.lead_id).trim();
  if (b.title !== undefined) cols.title = s(b.title).trim();
  if (b.description !== undefined) cols.description = s(b.description);
  if (b.due_at !== undefined) cols.due_at = s(b.due_at).trim();
  if (b.done !== undefined) {
    cols.done = !!b.done;
    cols.done_at = b.done ? new Date().toISOString() : null; // stamp/clear on toggle
  }
  if (forInsert) {
    if (!cols.lead_id) throw new DomainError(400, "lead_id em falta.");
    if (!cols.title) throw new DomainError(400, "title em falta.");
    if (!cols.due_at) throw new DomainError(400, "due_at em falta.");
    cols.done = false;
  }
  return cols;
}

async function handleActions(req, res, supabase) {
  if (req.method === "GET") {
    const [pending, done] = await Promise.all([
      supabase.from(ACTIONS_TABLE).select(ACTION_COLS).eq("done", false).order("due_at", { ascending: true }),
      supabase.from(ACTIONS_TABLE).select(ACTION_COLS).eq("done", true).order("done_at", { ascending: false }).limit(100),
    ]);
    if (pending.error) throw new Error(pending.error.message);
    if (done.error) throw new Error(done.error.message);
    return res.status(200).json([...(pending.data || []), ...(done.data || [])]);
  }

  if (req.method === "POST") {
    const cols = actionColumns(req.body ?? {}, { forInsert: true });
    const { data, error } = await supabase.from(ACTIONS_TABLE).insert(cols).select(ACTION_COLS).single();
    if (error) throw new Error(error.message);
    return res.status(201).json(data);
  }

  if (req.method === "PATCH") {
    const b = req.body ?? {};
    const id = s(b.id).trim();
    if (!id) return res.status(400).json({ error: "Campo 'id' em falta." });
    const cols = actionColumns(b);
    if ("title" in cols && !cols.title) {
      return res.status(400).json({ error: "O título não pode ficar vazio." });
    }
    if (Object.keys(cols).length === 0) {
      const { data: cur } = await supabase.from(ACTIONS_TABLE).select(ACTION_COLS).eq("id", id).maybeSingle();
      return res.status(200).json(cur || {});
    }
    const { data, error } = await supabase.from(ACTIONS_TABLE).update(cols).eq("id", id).select(ACTION_COLS).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: "Ação não encontrada." });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const id = s(req.query?.id ?? req.body?.id).trim();
    if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });
    const { error } = await supabase.from(ACTIONS_TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

// ───────────────────────────── dispatch ─────────────────────────────
export default async function handler(req, res) {
  const resource = s(req.query?.resource).trim();

  // Per-resource feature gate (each stays brandon-only, off elsewhere).
  if (resource === "links" && !serverConfig.dedupe) {
    return res.status(403).json({ error: "Merge não está disponível para este cliente." });
  }
  if ((resource === "templates" || resource === "greetings") && !serverConfig.templates) {
    return res.status(403).json({ error: "Templates não estão disponíveis para este cliente." });
  }
  if (resource === "actions" && !serverConfig.actions) {
    return res.status(403).json({ error: "Ações não estão disponíveis para este cliente." });
  }
  const KNOWN = ["links", "templates", "greetings", "actions"];
  if (!KNOWN.includes(resource)) {
    return res.status(400).json({ error: "resource inválido (usa 'links', 'templates', 'greetings' ou 'actions')." });
  }

  // Supabase configured? (missing env → friendly, never a crash)
  const ctx = getContext();
  if (!ctx) {
    return res.status(400).json({ error: "Armazenamento indisponível." });
  }

  try {
    if (resource === "links") return await handleLinks(req, res, ctx.supabase);
    if (resource === "greetings") return await handleGreetings(req, res, ctx.supabase);
    if (resource === "actions") return await handleActions(req, res, ctx.supabase);
    return await handleTemplates(req, res, ctx.supabase);
  } catch (err) {
    if (err?.expose) return res.status(err.status).json({ error: err.message });
    console.error(`brandon-store [${resource}] error:`, err?.message || err);
    return res.status(502).json({ error: "Erro a comunicar com o armazenamento." });
  }
}
