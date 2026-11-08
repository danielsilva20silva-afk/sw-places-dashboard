import serverConfig from "./_config.js";
import { getContext } from "./_adapters/supabase.js";
import dataAdapter from "./_adapters/index.js";
import { assembleAdsInsights, metaDatePreset } from "./_adapters/adsInsights.js";

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
// NOTE: calendar_event_id requires `alter table lead_actions add column
// calendar_event_id text;` to have been run — the SELECT below fails otherwise.
const ACTION_COLS = "id, lead_id, title, description, due_at, done, done_at, created_at, calendar_event_id";

function actionColumns(b, { forInsert } = {}) {
  const cols = {};
  if (b.lead_id !== undefined) cols.lead_id = s(b.lead_id).trim();
  if (b.title !== undefined) cols.title = s(b.title).trim();
  if (b.description !== undefined) cols.description = s(b.description);
  if (b.due_at !== undefined) cols.due_at = s(b.due_at).trim();
  // Google Calendar event id for actions mirrored to the calendar; "" clears it.
  if (b.calendar_event_id !== undefined) { const v = s(b.calendar_event_id).trim(); cols.calendar_event_id = v || null; }
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

// ─────────────────────────── archived leads ───────────────────────────
// "Hide from the working list without deleting." Keyed by the composite lead id
// (same ids as lead_links / lead_actions — works for Supabase AND Meta-sheet
// leads, whose rows Meta owns and we can't delete). A merged lead is archived by
// its primary id (the composite the UI shows); secondaries follow because they're
// already folded inside it.
//   GET    → all archived ids [{ lead_id, archived_at }]
//   POST   → archive one { lead_id } (idempotent; re-archiving just refreshes it)
//   DELETE → unarchive one (by lead_id)
const ARCHIVE_TABLE = "archived_leads";

async function handleArchive(req, res, supabase) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from(ARCHIVE_TABLE)
      .select("lead_id, archived_at")
      .order("archived_at", { ascending: false });
    if (error) throw new Error(error.message);
    return res.status(200).json(data || []);
  }

  if (req.method === "POST") {
    const lead_id = s((req.body ?? {}).lead_id).trim();
    if (!lead_id) return res.status(400).json({ error: "lead_id em falta." });
    // Idempotent: lead_id is the primary key, so upsert never 409s on re-archive.
    const { data, error } = await supabase
      .from(ARCHIVE_TABLE)
      .upsert({ lead_id }, { onConflict: "lead_id" })
      .select("lead_id, archived_at")
      .single();
    if (error) throw new Error(error.message);
    return res.status(201).json(data);
  }

  if (req.method === "DELETE") {
    const lead_id = s(req.query?.lead_id ?? req.body?.lead_id).trim();
    if (!lead_id) return res.status(400).json({ error: "Parâmetro 'lead_id' em falta." });
    const { error } = await supabase.from(ARCHIVE_TABLE).delete().eq("lead_id", lead_id);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

// ─────────────────────────── ads insights ───────────────────────────
// Creative-performance analysis: Meta Ads insights (level=ad) joined with our own
// lead-quality data (classification A/B/C + pipeline status). Meta rate limits are
// real, so the assembled JSON is cached 15 min — a per-instance memory cache plus
// a best-effort Supabase app_config row (cross-instance). The Meta access token is
// read from app_config (key='meta_ads_token'), kept fresh by an external weekly
// job — never hardcoded, never sent to the client. All pure maths lives in
// api/_adapters/adsInsights.js (underscore-pathed → not a Vercel function).
const META_API_VERSION = "v21.0";
const META_AD_ACCOUNT_ID = "1694636325217643";
const META_TOKEN_KEY = "meta_ads_token";
const ADS_CACHE_TTL_MS = 15 * 60 * 1000;
const ADS_CACHE_PREFIX = "ads_insights_cache:";
const CONFIG_TABLE = "app_config";
const META_PRESETS = new Set(["7d", "14d", "30d", "maximum"]);
const META_PAGE_LIMIT = 200;
const META_MAX_PAGES = 25;

// Per-instance (warm) cache: preset → { at, payload }. Survives within one lambda
// instance only; the app_config row below covers cross-instance reuse.
const adsMemCache = new Map();

const isFresh = (at) => typeof at === "number" && Date.now() - at < ADS_CACHE_TTL_MS;

// Read the Meta token from app_config. Defensive about the value column name
// (value | token | access_token) since the external job owns this table.
async function readMetaToken(supabase) {
  try {
    const { data, error } = await supabase
      .from(CONFIG_TABLE)
      .select("*")
      .eq("key", META_TOKEN_KEY)
      .maybeSingle();
    if (error) {
      console.error("ads-insights readMetaToken:", error.message);
      return "";
    }
    if (!data) return "";
    return s(data.value || data.token || data.access_token || data.data).trim();
  } catch (err) {
    console.error("ads-insights readMetaToken threw:", err?.message || err);
    return "";
  }
}

// Persistent cache in app_config (best-effort both ways — a different table shape
// or a missing row just means we fetch fresh; it never breaks the request).
async function readAdsCache(supabase, preset) {
  try {
    const { data, error } = await supabase
      .from(CONFIG_TABLE)
      .select("value")
      .eq("key", ADS_CACHE_PREFIX + preset)
      .maybeSingle();
    if (error || !data) return null;
    const raw = data.value;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && isFresh(Date.parse(parsed.cachedAt))) return parsed;
    return null;
  } catch {
    return null;
  }
}
async function writeAdsCache(supabase, preset, payload) {
  try {
    await supabase
      .from(CONFIG_TABLE)
      .upsert({ key: ADS_CACHE_PREFIX + preset, value: JSON.stringify(payload) }, { onConflict: "key" });
  } catch {
    /* best-effort: caching is an optimisation, never a hard dependency */
  }
}

// One Meta insights request, following paging.next to completion (capped). Returns
// { data } with every page concatenated. Throws a MetaError the caller maps to a
// clean, UI-showable message (never a 500 crash).
class MetaError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
function isTokenError(errObj) {
  const code = Number(errObj?.code);
  const msg = s(errObj?.message).toLowerCase();
  return code === 190 || code === 102 || code === 10 || msg.includes("access token") || msg.includes("session has expired");
}

async function metaFetchAll(params, token, edge = "insights") {
  const base = `https://graph.facebook.com/${META_API_VERSION}/act_${META_AD_ACCOUNT_ID}/${edge}`;
  const qs = new URLSearchParams({ ...params, access_token: token, limit: String(META_PAGE_LIMIT) });
  let url = `${base}?${qs.toString()}`;
  const out = [];
  for (let page = 0; page < META_MAX_PAGES && url; page++) {
    let resp, json;
    try {
      resp = await fetch(url);
      json = await resp.json();
    } catch (err) {
      throw new MetaError(`Couldn't reach Meta: ${err?.message || err}`, "network");
    }
    if (json?.error) {
      throw new MetaError(s(json.error.message) || "Meta API error.", isTokenError(json.error) ? "token" : "meta");
    }
    if (Array.isArray(json?.data)) out.push(...json.data);
    url = json?.paging?.next || "";
  }
  return { data: out };
}

// Preview iframe format to request from the previews edge. Tried in order per ad
// (first one that yields an iframe wins) so an ad with only one placement still
// resolves. INSTAGRAM_STANDARD suits this IG-reel-heavy account; MOBILE_FEED is
// the broad fallback.
const META_PREVIEW_FORMATS = ["INSTAGRAM_STANDARD", "MOBILE_FEED_STANDARD"];
const MAX_PREVIEW_ADS = 60;      // cap per-ad preview calls (safety for big accounts)
const PREVIEW_CONCURRENCY = 8;

// Fetch every ad's creative thumbnail, (when a video) its video_id, and its
// effective_object_story_id (for the Facebook permalink). The ads edge carries no
// date filter, so we map ALL ads and let the caller use only the ids that have
// spend. Returns { thumbs, videoIds, storyIds } (all Map(adId→…)). Best-effort.
async function fetchAdCreatives(token) {
  const thumbs = new Map();
  const videoIds = new Map();
  const storyIds = new Map();
  try {
    const { data } = await metaFetchAll(
      { fields: "id,creative{thumbnail_url,video_id,effective_object_story_id}", thumbnail_width: "256", thumbnail_height: "256" },
      token,
      "ads"
    );
    for (const ad of data) {
      const id = s(ad?.id);
      if (!id) continue;
      const url = s(ad?.creative?.thumbnail_url);
      if (url) thumbs.set(id, url);
      const vid = s(ad?.creative?.video_id);
      if (vid) videoIds.set(id, vid);
      const story = s(ad?.creative?.effective_object_story_id);
      if (story) storyIds.set(id, story);
    }
  } catch (err) {
    // A token error is surfaced by the parallel insights calls; here we just
    // degrade media to placeholders rather than sink the whole page.
    console.error("ads-insights fetchAdCreatives:", err?.message || err);
  }
  return { thumbs, videoIds, storyIds };
}

// Resolve video ids → playable source URLs via the batch-by-ids endpoint
// (GET /?ids=v1,v2&fields=source). Signed, expiring CDN URLs. Meta commonly
// REFUSES `source` for ad-account videos (a known permission restriction); a
// failed batch logs the real error (first one, for diagnostics) and is skipped —
// the UI then falls back to the preview iframe. Returns { map, sampleError }.
async function fetchVideoSources(ids, token) {
  const map = new Map();
  let sampleError = null;
  const uniq = [...new Set(ids.filter(Boolean))];
  const CHUNK = 50;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const batch = uniq.slice(i, i + CHUNK);
    const qs = new URLSearchParams({ ids: batch.join(","), fields: "source", access_token: token });
    try {
      const resp = await fetch(`https://graph.facebook.com/${META_API_VERSION}/?${qs.toString()}`);
      const json = await resp.json();
      if (json?.error) {
        if (!sampleError) sampleError = json.error;
        continue;
      }
      for (const [vid, obj] of Object.entries(json || {})) {
        // Per-id errors can also appear inline under the id key.
        if (obj?.error && !sampleError) sampleError = obj.error;
        const src = s(obj?.source);
        if (src) map.set(vid, src);
      }
    } catch (err) {
      if (!sampleError) sampleError = { message: err?.message || String(err) };
    }
  }
  return { map, sampleError };
}

// Pull the iframe src out of a previews-edge body (HTML-unescaping &amp; etc.).
function extractIframeSrc(body) {
  const m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(s(body));
  if (!m) return "";
  return m[1].replace(/&amp;/g, "&").replace(/&#0?38;/g, "&");
}

// Per-ad rendered ad preview → Map(adId → iframe src). GET /{ad_id}/previews
// returns a renderable iframe body; these URLs are signed and short-lived, so
// they get the same cache-TTL treatment as thumbnails. Scoped to the (spend) ad
// ids the caller passes, capped and concurrency-limited. Best-effort per ad;
// returns { map, sampleError }.
async function fetchAdPreviews(adIds, token) {
  const map = new Map();
  let sampleError = null;
  const ids = [...new Set(adIds.filter(Boolean))].slice(0, MAX_PREVIEW_ADS);
  for (let i = 0; i < ids.length; i += PREVIEW_CONCURRENCY) {
    const chunk = ids.slice(i, i + PREVIEW_CONCURRENCY);
    const results = await Promise.all(chunk.map(async (adId) => {
      for (const fmt of META_PREVIEW_FORMATS) {
        try {
          const qs = new URLSearchParams({ ad_format: fmt, access_token: token });
          const resp = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${adId}/previews?${qs.toString()}`);
          const json = await resp.json();
          if (json?.error) { if (!sampleError) sampleError = json.error; continue; }
          const src = extractIframeSrc(json?.data?.[0]?.body);
          if (src) return [adId, src];
        } catch (err) {
          if (!sampleError) sampleError = { message: err?.message || String(err) };
        }
      }
      return [adId, ""];
    }));
    for (const [adId, src] of results) if (src) map.set(adId, src);
  }
  return { map, sampleError };
}

// `effective_object_story_id` → Facebook permalink. The id is "{page}_{post}";
// facebook.com/{page}_{post} resolves to the post. Stable (not signed).
function facebookUrlFromStory(storyId) {
  const id = s(storyId).trim();
  return id ? `https://www.facebook.com/${id}` : "";
}

// Build the lead list exactly as the dashboard sees it (the client's configured
// adapter — for brandon the Supabase-subscribers + Meta-sheet composite), so the
// join uses the same `source`/classification/status the UI shows.
async function fetchCompositeLeads() {
  try {
    const cc = dataAdapter.getContext();
    if (!cc) return [];
    return await dataAdapter.getLeads(cc);
  } catch (err) {
    console.error("ads-insights fetchCompositeLeads:", err?.message || err);
    return []; // the page still renders Meta spend/creative metrics without the join
  }
}

async function handleAdsInsights(req, res, supabase) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawPreset = s(req.query?.preset).trim();
  const preset = META_PRESETS.has(rawPreset) ? rawPreset : "7d";
  const force = s(req.query?.force).trim() === "1";

  // Cache: memory first (per-instance), then the app_config row (cross-instance).
  if (!force) {
    const mem = adsMemCache.get(preset);
    if (mem && isFresh(mem.at)) {
      return res.status(200).json({ ...mem.payload, cached: true });
    }
    const persisted = await readAdsCache(supabase, preset);
    if (persisted) {
      adsMemCache.set(preset, { at: Date.parse(persisted.cachedAt), payload: persisted });
      return res.status(200).json({ ...persisted, cached: true });
    }
  }

  const token = await readMetaToken(supabase);
  if (!token) {
    return res.status(200).json({
      ok: false,
      errorCode: "token_expired",
      error: "Meta token missing or expired — renew it in Apps Script.",
    });
  }

  const datePreset = metaDatePreset(preset);
  const videoFields = [
    "ad_id", "ad_name", "spend", "impressions", "reach", "frequency", "ctr",
    "inline_link_clicks", "actions", "cost_per_action_type",
    "video_play_actions", "video_continuous_2_sec_watched_actions",
    "video_thruplay_watched_actions", "video_avg_time_watched_actions",
    "video_p25_watched_actions", "video_p50_watched_actions",
    "video_p75_watched_actions", "video_p95_watched_actions", "video_p100_watched_actions",
  ].join(",");

  // A non-token breakdown failure degrades to empty (the main table still
  // renders); a token error from any insights call bubbles to the catch.
  const softBreakdown = (label) => (e) => { if (e.code === "token") throw e; console.error(`ads-insights ${label}:`, e.message); return { data: [] }; };

  try {
    // Phase 1 — insights + creatives + leads in parallel. `main` is the heavy
    // per-ad call; `baseline` is a last-30d CTR reference (fatigue); `creatives`
    // carries thumbnails + video ids + story ids. Breakdowns/baseline/creatives
    // are best-effort; a token error from an insights call bubbles to the catch.
    const [main, platform, hourly, daily, baseline, creatives, leads] = await Promise.all([
      metaFetchAll({ level: "ad", date_preset: datePreset, fields: videoFields }, token),
      metaFetchAll({ level: "ad", date_preset: datePreset, fields: "ad_id,spend,impressions,actions", breakdowns: "publisher_platform,platform_position" }, token).catch(softBreakdown("platform breakdown")),
      metaFetchAll({ level: "ad", date_preset: datePreset, fields: "ad_id,impressions,actions", breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone" }, token).catch(softBreakdown("hourly breakdown")),
      metaFetchAll({ level: "ad", date_preset: datePreset, fields: "ad_id,spend,actions", time_increment: "1" }, token).catch(softBreakdown("daily series")),
      metaFetchAll({ level: "ad", date_preset: "last_30d", fields: "ad_id,impressions,inline_link_clicks" }, token).catch(softBreakdown("30d baseline")),
      fetchAdCreatives(token),
      fetchCompositeLeads(),
    ]);

    // The ad ids with spend in the period — scope the per-ad preview calls (and
    // the video-source lookup) to just these, not the whole account.
    const spendAdIds = [...new Set((main.data || []).map((r) => s(r.ad_id)).filter(Boolean))];
    const spendVideoIds = spendAdIds.map((id) => creatives.videoIds.get(id)).filter(Boolean);

    // Phase 2 — media that depends on the spend set: video sources (often refused
    // by Meta → iframe fallback) and the rendered ad-preview iframes. Parallel.
    const [videoRes, previewRes] = await Promise.all([
      fetchVideoSources(spendVideoIds, token),
      fetchAdPreviews(spendAdIds, token),
    ]);

    // adId → playable video source (only where Meta actually served `source`).
    const videos = new Map();
    for (const adId of spendAdIds) {
      const vid = creatives.videoIds.get(adId);
      const src = vid && videoRes.map.get(vid);
      if (src) videos.set(adId, src);
    }
    // adId → Facebook permalink (from the story id).
    const facebookUrls = new Map();
    for (const [adId, story] of creatives.storyIds) {
      const url = facebookUrlFromStory(story);
      if (url) facebookUrls.set(adId, url);
    }

    const payload = assembleAdsInsights({
      main, platform, hourly, daily, baseline, leads, preset,
      thumbnails: creatives.thumbs, videos, previews: previewRes.map, facebookUrls,
      cachedAt: new Date().toISOString(),
    });

    // Diagnostics (vercel logs): coverage + the real error Meta returns for the
    // refused video `source` field, on a sample.
    const nVideo = payload.ads.filter((a) => a.videoUrl).length;
    const nPreview = payload.ads.filter((a) => a.previewUrl).length;
    const nFb = payload.ads.filter((a) => a.facebookUrl).length;
    const nNone = payload.ads.filter((a) => !a.videoUrl && !a.previewUrl && !a.facebookUrl).length;
    console.log(`ads-insights[${preset}]: ${payload.ads.length} ads — ${nVideo} video, ${nPreview} preview-iframe, ${nFb} facebook-link, ${nNone} none; thumbs ${payload.ads.filter((a) => a.thumbnailUrl).length}`);
    if (videoRes.sampleError) console.log(`ads-insights[${preset}] video source refused (sample):`, JSON.stringify(videoRes.sampleError));
    if (previewRes.sampleError) console.log(`ads-insights[${preset}] preview error (sample):`, JSON.stringify(previewRes.sampleError));

    adsMemCache.set(preset, { at: Date.parse(payload.cachedAt), payload });
    await writeAdsCache(supabase, preset, payload);
    return res.status(200).json({ ...payload, cached: false });
  } catch (err) {
    if (err instanceof MetaError && err.code === "token") {
      return res.status(200).json({
        ok: false,
        errorCode: "token_expired",
        error: "Meta token expired — renew it in Apps Script.",
      });
    }
    console.error("ads-insights fetch error:", err?.message || err);
    return res.status(200).json({
      ok: false,
      errorCode: "meta_error",
      error: "Couldn't fetch data from Meta. Please try again shortly.",
    });
  }
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
  if (resource === "archive" && !serverConfig.archive) {
    return res.status(403).json({ error: "Arquivo não está disponível para este cliente." });
  }
  if (resource === "ads-insights" && !serverConfig.adsInsights) {
    return res.status(403).json({ error: "Ads não está disponível para este cliente." });
  }
  const KNOWN = ["links", "templates", "greetings", "actions", "archive", "ads-insights"];
  if (!KNOWN.includes(resource)) {
    return res.status(400).json({ error: "resource inválido (usa 'links', 'templates', 'greetings', 'actions', 'archive' ou 'ads-insights')." });
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
    if (resource === "archive") return await handleArchive(req, res, ctx.supabase);
    if (resource === "ads-insights") return await handleAdsInsights(req, res, ctx.supabase);
    return await handleTemplates(req, res, ctx.supabase);
  } catch (err) {
    if (err?.expose) return res.status(err.status).json({ error: err.message });
    console.error(`brandon-store [${resource}] error:`, err?.message || err);
    return res.status(502).json({ error: "Erro a comunicar com o armazenamento." });
  }
}
