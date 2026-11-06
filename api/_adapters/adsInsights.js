// Ads-insights computation + assembly (PURE, import-free, node-testable).
// The brandon-only "Ads" page joins Meta Ads creative performance with our own
// lead-quality data (classification A/B/C + pipeline status). This module holds
// every pure transform; all network I/O, the Supabase token read and the 15-min
// cache live in the op handler (api/brandon-store.js?resource=ads-insights). It
// is underscore-pathed (api/_adapters/…) so it is NOT counted as a Vercel
// function. Nothing here is brandon-specific beyond the status vocabulary; it is
// only ever reached behind the adsInsights feature gate, so swplaces is untouched.

const s = (v) => (v == null ? "" : String(v));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Division that never blows up: null when the denominator is 0 (or non-finite),
// so the UI can render an em-dash instead of NaN/Infinity. This is the single
// zero-division guard every rate/cost metric below funnels through.
export function ratio(n, d) {
  const den = num(d);
  return den > 0 ? num(n) / den : null;
}

// ── Meta `actions` extraction ───────────────────────────────────────────────
// Meta returns conversion counts as an array of { action_type, value }. Pull the
// value for one exact action_type (0 when absent). Used for 3-second video plays
// (action_type "video_view", which Meta defines as a 3s view).
export function actionValue(actions, type) {
  if (!Array.isArray(actions)) return 0;
  for (const a of actions) {
    if (a && a.action_type === type) return num(a.value);
  }
  return 0;
}

// Instant-Form leads surface under several action_type names depending on the
// objective/attribution setup (and Meta often reports the SAME leads under two
// of them). Take the MAX across the known lead types rather than the sum, so a
// lead reported as both "lead" and "onsite_conversion.lead_grouped" counts once.
export const LEAD_ACTION_TYPES = [
  "onsite_conversion.lead_grouped",
  "lead",
  "leadgen_grouped",
  "leadgen.other",
  "offsite_conversion.fb_pixel_lead",
];
export function leadCount(actions) {
  if (!Array.isArray(actions)) return 0;
  let max = 0;
  for (const a of actions) {
    if (a && LEAD_ACTION_TYPES.includes(a.action_type)) max = Math.max(max, num(a.value));
  }
  return max;
}

// The video_* fields (video_play_actions, video_thruplay_watched_actions,
// video_pXX_watched_actions, video_avg_time_watched_actions, …) each come back as
// an array of { action_type:"video_view", value } — usually a single entry. Take
// the first non-zero value (falling back to the first entry), or treat a bare
// number as itself.
export function firstActionVal(field) {
  if (Array.isArray(field)) {
    for (const a of field) {
      const v = num(a?.value);
      if (v) return v;
    }
    return field.length ? num(field[0]?.value) : 0;
  }
  return num(field);
}

// ── Creative-efficiency rates ───────────────────────────────────────────────
// Hook rate: did the thumb stop? 3-second plays ÷ impressions.
export function hookRate(threeSecPlays, impressions) {
  return ratio(threeSecPlays, impressions);
}
// Hold rate: did they stay? ThruPlays ÷ 3-second plays.
export function holdRate(thruPlays, threeSecPlays) {
  return ratio(thruPlays, threeSecPlays);
}

// Video retention as a fraction of plays (0..1): plays=100%, then the share still
// watching at each quartile/near-end. null everywhere when there are no plays.
export function retentionCurve({ plays, p25, p50, p75, p95, p100 } = {}) {
  const base = num(plays);
  const pct = (v) => (base > 0 ? num(v) / base : null);
  return {
    plays: base,
    p0: base > 0 ? 1 : null,
    p25: pct(p25),
    p50: pct(p50),
    p75: pct(p75),
    p95: pct(p95),
    p100: pct(p100),
  };
}

// ── Lead-quality join (Meta ad name ↔ our leads) ────────────────────────────
// IMPORTANT (reality vs. brief): ad-attributed leads do NOT live in `subscribers`
// with an ad-name column. Brandon's leads are a COMPOSITE of two sources
// (api/_adapters/composite.js): Supabase `subscribers` (landing-page sign-ups,
// whose `source` is a form id like "hero-email" — NOT ad-attributed) and the Meta
// Ads Instant-Forms Google Sheet, whose rows carry `ad_name`/`campaign_name`. The
// sheet adapter folds the ad name into the lead's `source` as "Meta Ads · <ad>"
// (ad_name, or form_name when ad_name is blank). So the join key is recovered from
// `source`, and only Meta-sourced leads join; subscribers rows never match an ad.
export const QUALIFIED_STATUSES = [
  "Contacted — qualifying",
  "Contacted — answered",
  "Viewing booked",
  "Closed",
];

// "Meta Ads · Reel A — QdL" → "Reel A — QdL". Bare "Meta Ads" (no ad/form label)
// → null (unattributed). Non-Meta source (subscribers) → null.
export function leadAdName(source) {
  const str = s(source);
  if (!str.startsWith("Meta Ads")) return null;
  const dot = str.indexOf("·");
  if (dot === -1) return null;
  const label = str.slice(dot + 1).trim();
  return label || null;
}

// Normalise an ad name for matching across the two systems: trim, collapse inner
// whitespace, lowercase. Meta insights `ad_name` and the sheet's `ad_name` are the
// same string in practice; this only absorbs stray casing/spacing drift.
export function normAdName(name) {
  return s(name).trim().replace(/\s+/g, " ").toLowerCase();
}

// Group leads by (normalised) ad name → quality tallies. "total" is total leads in
// system for that ad (all-time; our leads carry no spend-window), with A/B/C +
// unclassified counts and a qualified-or-better count. Keyed by normAdName; each
// entry keeps the first-seen display `adName`.
export function joinLeadsByAd(leads, { qualifiedStatuses = QUALIFIED_STATUSES } = {}) {
  const qSet = new Set(qualifiedStatuses);
  const map = new Map();
  for (const l of Array.isArray(leads) ? leads : []) {
    const adName = leadAdName(l?.source);
    if (!adName) continue;
    const key = normAdName(adName);
    if (!map.has(key)) {
      map.set(key, { adName, total: 0, A: 0, B: 0, C: 0, unclassified: 0, qualified: 0 });
    }
    const e = map.get(key);
    e.total += 1;
    const cls = s(l?.classification).trim().toUpperCase();
    if (cls === "A") e.A += 1;
    else if (cls === "B") e.B += 1;
    else if (cls === "C") e.C += 1;
    else e.unclassified += 1;
    if (qSet.has(s(l?.status).trim())) e.qualified += 1;
  }
  return map;
}

// ── Assembly from raw Meta payloads + our leads ─────────────────────────────
// Meta insights responses are { data: [...], paging }. Accept either the whole
// response, its `.data`, or a bare array.
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function groupByAd(rows) {
  const map = new Map();
  for (const r of rows) {
    const id = s(r?.ad_id);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(r);
  }
  return map;
}

function mapPlatformRow(r) {
  return {
    platform: s(r.publisher_platform) || "—",
    position: s(r.platform_position) || "—",
    spend: num(r.spend),
    impressions: num(r.impressions),
    leads: leadCount(r.actions),
  };
}

// Hourly breakdown label "13:00:00 - 13:59:59" → hour 13. Aggregate impressions +
// leads into a fixed 0..23 histogram so the chart always has every slot.
function hourOf(label) {
  const m = /^(\d{1,2})/.exec(s(label).trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}
function aggregateHours(rows) {
  const slots = Array.from({ length: 24 }, (_, hour) => ({ hour, impressions: 0, leads: 0 }));
  for (const r of rows) {
    const h = hourOf(r?.hourly_stats_aggregated_by_advertiser_time_zone);
    if (h == null) continue;
    slots[h].impressions += num(r.impressions);
    slots[h].leads += leadCount(r.actions);
  }
  return slots;
}

function mapDailyRow(r) {
  return { date: s(r.date_start), spend: num(r.spend), leads: leadCount(r.actions) };
}

function buildAd(r, { platformByAd, hourlyByAd, dailyByAd, joinMap, thumbnails, videos, baseline30 }) {
  const adId = s(r.ad_id);
  const adName = s(r.ad_name);
  const spend = num(r.spend);
  const impressions = num(r.impressions);
  const clicks = num(r.inline_link_clicks);
  const leads = leadCount(r.actions);

  const threeSec = actionValue(r.actions, "video_view");
  const thruPlays = firstActionVal(r.video_thruplay_watched_actions);
  const videoPlays = firstActionVal(r.video_play_actions);
  const retention = retentionCurve({
    plays: videoPlays,
    p25: firstActionVal(r.video_p25_watched_actions),
    p50: firstActionVal(r.video_p50_watched_actions),
    p75: firstActionVal(r.video_p75_watched_actions),
    p95: firstActionVal(r.video_p95_watched_actions),
    p100: firstActionVal(r.video_p100_watched_actions),
  });

  const join = joinMap.get(normAdName(adName)) || null;
  const qualified = join?.qualified || 0;
  const aLeads = join?.A || 0;

  return {
    adId,
    adName,
    spend,
    impressions,
    reach: num(r.reach),
    frequency: num(r.frequency),
    clicks,
    // Link CTR, computed consistently everywhere (clicks ÷ impressions), as a
    // fraction; the UI formats it as a %. (Meta's own `ctr` field mixes in all
    // click types — we keep one definition across per-ad rows and totals.)
    ctr: ratio(clicks, impressions),
    leads,
    cpl: ratio(spend, leads),
    // Video creative metrics.
    threeSecPlays: threeSec,
    thruPlays,
    videoPlays,
    continuous2s: firstActionVal(r.video_continuous_2_sec_watched_actions),
    avgWatchTime: firstActionVal(r.video_avg_time_watched_actions),
    hookRate: hookRate(threeSec, impressions),
    holdRate: holdRate(thruPlays, threeSec),
    retention,
    // Lead-quality join.
    sysLeads: join?.total || 0,
    byClass: {
      A: join?.A || 0,
      B: join?.B || 0,
      C: join?.C || 0,
      unclassified: join?.unclassified || 0,
    },
    qualified,
    aLeads,
    costPerQualified: ratio(spend, qualified),
    costPerA: ratio(spend, aLeads),
    // Creative thumbnail (signed Meta CDN URL — fetched fresh each cache rebuild,
    // never persisted beyond the cache TTL). "" when the ad has no creative/thumb;
    // the UI shows a neutral placeholder.
    thumbnailUrl: s((thumbnails && thumbnails.get(adId)) || ""),
    // Playable video source (signed, expiring CDN URL — same TTL treatment as the
    // thumbnail). null when the ad isn't a video, has no video_id, or Meta refused
    // the `source` field; the UI then just shows the thumbnail.
    videoUrl: (videos && videos.get(adId)) || null,
    // The ad's OWN trailing-30d link CTR — a fatigue baseline, independent of the
    // selected period (null when the ad had no 30d impressions). Used by the
    // "sinais de fadiga" diagnosis.
    ctr30: baseline30 && baseline30.has(adId) ? baseline30.get(adId) : null,
    // Detail-panel breakdowns.
    platforms: (platformByAd.get(adId) || []).map(mapPlatformRow),
    hours: aggregateHours(hourlyByAd.get(adId) || []),
    daily: (dailyByAd.get(adId) || []).map(mapDailyRow).sort((a, b) => a.date.localeCompare(b.date)),
    // Filled in after benchmarks are known (assembleAdsInsights).
    insights: [],
  };
}

// ── Account benchmarks (period averages) ────────────────────────────────────
// Impression/spend-weighted aggregates — i.e. the account rate, not a mean of
// per-ad rates (a 50-impression ad can't skew the average). hook/ctr weight by
// impressions, hold by 3s plays, avgWatch by video plays, cpl is spend ÷ leads.
// Each is null when its denominator is 0. `leadsPerAd` is a plain mean, used only
// as a volume floor by the diagnoses.
export function weightedBenchmarks(ads) {
  let imp = 0, three = 0, thru = 0, clicks = 0, spend = 0, leads = 0, plays = 0, watchW = 0;
  for (const a of Array.isArray(ads) ? ads : []) {
    imp += num(a.impressions);
    three += num(a.threeSecPlays);
    thru += num(a.thruPlays);
    clicks += num(a.clicks);
    spend += num(a.spend);
    leads += num(a.leads);
    plays += num(a.videoPlays);
    watchW += num(a.avgWatchTime) * num(a.videoPlays);
  }
  const n = (Array.isArray(ads) ? ads : []).length;
  return {
    hook: ratio(three, imp),
    hold: ratio(thru, three),
    avgWatch: ratio(watchW, plays),
    ctr: ratio(clicks, imp),
    cpl: ratio(spend, leads),
    leadsPerAd: n ? leads / n : 0,
  };
}

// ── Top performers ("quadro de honra") ──────────────────────────────────────
// One winner per category over the period. A sample floor (≥1000 impressions,
// default) keeps a lucky 50-impression ad off the podium; some categories add
// their own floor (≥1 qualified, ≥3 classified). A category with no eligible ad
// returns null → the UI greys that card.
const classifiedCount = (a) => num(a.byClass?.A) + num(a.byClass?.B) + num(a.byClass?.C);

export function topPerformers(ads, { minImpressions = 1000 } = {}) {
  const list = Array.isArray(ads) ? ads : [];
  const eligible = list.filter((a) => num(a.impressions) >= minImpressions);

  const pick = (cands, valueFn, better) => {
    let best = null, bestV = null;
    for (const a of cands) {
      const v = valueFn(a);
      if (v == null) continue;
      if (best === null || better(v, bestV)) { best = a; bestV = v; }
    }
    return best ? { adId: best.adId, adName: best.adName, thumbnailUrl: best.thumbnailUrl || "", videoUrl: best.videoUrl || null, value: bestV } : null;
  };
  const higher = (x, y) => x > y;
  const lower = (x, y) => x < y;

  return {
    bestHook: pick(eligible, (a) => a.hookRate, higher),
    bestRetention: pick(eligible, (a) => a.holdRate, higher),
    bestCtr: pick(eligible, (a) => a.ctr, higher),
    cheapestQualified: pick(eligible.filter((a) => num(a.qualified) >= 1), (a) => a.costPerQualified, lower),
    bestQuality: pick(
      eligible.filter((a) => classifiedCount(a) >= 3),
      (a) => (classifiedCount(a) > 0 ? num(a.byClass.A) / classifiedCount(a) : null),
      higher
    ),
  };
}

// ── Auto-insights ("leituras automáticas") ──────────────────────────────────
// Rule-based diagnoses (Portuguese) comparing one ad to the period benchmarks.
// Heuristics only — the UI labels them as such. Each rule is a pure predicate so
// it unit-tests as fires / doesn't-fire / boundary. A rule needing a benchmark it
// doesn't have (null) simply doesn't fire.
export const DIAGNOSES = [
  {
    code: "weak_hook",
    text: "Weak first 3 seconds: viewers who stay, stay to the end — fix the hook, not the video.",
    test: (a, b) => b.hook != null && b.hold != null && a.hookRate != null && a.holdRate != null
      && a.hookRate < b.hook && a.holdRate > b.hold,
  },
  {
    code: "weak_middle",
    text: "Strong hook but the middle loses people: tighten or speed up the mid-section.",
    test: (a, b) => b.hook != null && b.hold != null && a.hookRate != null && a.holdRate != null
      && a.hookRate > b.hook && a.holdRate < b.hold,
  },
  {
    code: "form_friction",
    text: "The video sells but the form blocks: review the instant form / post-click friction.",
    test: (a, b) => b.ctr != null && b.cpl != null && a.ctr != null && a.cpl != null
      && a.ctr > b.ctr && a.cpl > b.cpl,
  },
  {
    code: "fatigue",
    text: "Fatigue signs: the audience has seen this too many times — prepare fresh creative.",
    test: (a) => num(a.frequency) > 2.5 && a.ctr != null && a.ctr30 != null && a.ctr < a.ctr30,
  },
  {
    code: "low_quality",
    text: "Volume without quality: review the ad's promise vs the product.",
    test: (a, b) => {
      const qShare = num(a.sysLeads) > 0 ? num(a.qualified) / num(a.sysLeads) : null;
      const volFloor = Math.max(5, num(b.leadsPerAd));
      return num(a.leads) >= volFloor && qShare != null && classifiedCount(a) >= 1 && qShare < 0.2;
    },
  },
];

export function adDiagnoses(ad, benchmarks) {
  const b = benchmarks || {};
  const out = [];
  for (const d of DIAGNOSES) {
    let fired;
    try { fired = !!d.test(ad, b); } catch { fired = false; }
    if (fired) out.push({ code: d.code, text: d.text });
  }
  return out;
}

function computeTotals(ads) {
  let spend = 0, impressions = 0, reach = 0, clicks = 0, leads = 0;
  let qualified = 0, aLeads = 0, sysLeads = 0;
  for (const a of ads) {
    spend += a.spend;
    impressions += a.impressions;
    reach += a.reach; // sum across ads over-counts de-duped reach — a rough header figure
    clicks += a.clicks;
    leads += a.leads;
    qualified += a.qualified;
    aLeads += a.aLeads;
    sysLeads += a.sysLeads;
  }
  return {
    spend,
    impressions,
    reach,
    clicks,
    leads,
    ctr: ratio(clicks, impressions),
    cpl: ratio(spend, leads),
    sysLeads,
    qualified,
    aLeads,
    costPerQualified: ratio(spend, qualified),
    costPerA: ratio(spend, aLeads),
    ads: ads.length,
  };
}

// Build the full page payload from the four Meta insight payloads + our leads.
// Only ads with spend > 0 in the period make the table (per the brief); the join
// still exposes lead-only ad names (paused creatives that still produced leads)
// via `unmatchedLeadAds`, so nothing is silently dropped.
//
// `thumbnails` (Map adId→url) and `baseline` (last-30d `main` payload, for each
// ad's own trailing CTR) are optional — the page degrades gracefully without them
// (placeholder thumbs; the fatigue diagnosis just can't fire).
export function assembleAdsInsights({ main, platform, hourly, daily, leads, preset, cachedAt, thumbnails, videos, baseline } = {}) {
  const joinMap = joinLeadsByAd(leads);
  const platformByAd = groupByAd(rowsOf(platform));
  const hourlyByAd = groupByAd(rowsOf(hourly));
  const dailyByAd = groupByAd(rowsOf(daily));
  const thumbMap = thumbnails instanceof Map ? thumbnails : new Map(Object.entries(thumbnails || {}));
  const videoMap = videos instanceof Map ? videos : new Map(Object.entries(videos || {}));

  // Each ad's own trailing-30d link CTR (fatigue baseline), keyed by ad id.
  const baseline30 = new Map();
  for (const r of rowsOf(baseline)) {
    const id = s(r.ad_id);
    if (id) baseline30.set(id, ratio(num(r.inline_link_clicks), num(r.impressions)));
  }

  const ads = rowsOf(main)
    .map((r) => buildAd(r, { platformByAd, hourlyByAd, dailyByAd, joinMap, thumbnails: thumbMap, videos: videoMap, baseline30 }))
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  // Benchmarks need every (built) ad; diagnoses then compare each ad to them.
  const benchmarks = weightedBenchmarks(ads);
  for (const a of ads) a.insights = adDiagnoses(a, benchmarks);

  const insightNames = new Set(ads.map((a) => normAdName(a.adName)));
  const unmatchedLeadAds = [];
  for (const [key, e] of joinMap) {
    if (!insightNames.has(key)) unmatchedLeadAds.push({ adName: e.adName, leads: e.total, qualified: e.qualified });
  }
  unmatchedLeadAds.sort((a, b) => b.leads - a.leads);

  return {
    ok: true,
    preset: s(preset),
    cachedAt: cachedAt || new Date().toISOString(),
    totals: computeTotals(ads),
    benchmarks,
    topPerformers: topPerformers(ads),
    ads,
    unmatchedLeadAds,
  };
}

// date_preset mapping for the UI's range selector → Meta's enum. Unknown → 7d.
export const PRESET_TO_META = {
  "7d": "last_7d",
  "14d": "last_14d",
  "30d": "last_30d",
  maximum: "maximum",
};
export function metaDatePreset(preset) {
  return PRESET_TO_META[s(preset)] || "last_7d";
}
