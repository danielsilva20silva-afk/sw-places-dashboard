import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ratio,
  actionValue,
  leadCount,
  firstActionVal,
  hookRate,
  holdRate,
  retentionCurve,
  leadAdName,
  normAdName,
  joinLeadsByAd,
  assembleAdsInsights,
  metaDatePreset,
  presetWindow,
  inWindow,
} from "./adsInsights.js";

// ── ratio / zero-division guard ─────────────────────────────────────────────
test("ratio returns null on zero / non-finite denominator, never NaN/Infinity", () => {
  assert.equal(ratio(10, 0), null);
  assert.equal(ratio(10, undefined), null);
  assert.equal(ratio(10, "x"), null);
  assert.equal(ratio(0, 0), null);
  assert.equal(ratio(5, 2), 2.5);
});

// ── action extraction ───────────────────────────────────────────────────────
test("actionValue pulls one action_type, 0 when absent or malformed", () => {
  const actions = [
    { action_type: "video_view", value: "1200" },
    { action_type: "link_click", value: "40" },
  ];
  assert.equal(actionValue(actions, "video_view"), 1200);
  assert.equal(actionValue(actions, "post_engagement"), 0);
  assert.equal(actionValue(null, "video_view"), 0);
});

test("leadCount takes the MAX across lead action types (no double counting)", () => {
  const actions = [
    { action_type: "lead", value: "8" },
    { action_type: "onsite_conversion.lead_grouped", value: "8" }, // same 8 leads, reported twice
    { action_type: "link_click", value: "50" },
  ];
  assert.equal(leadCount(actions), 8);
  assert.equal(leadCount([{ action_type: "leadgen.other", value: "3" }]), 3);
  assert.equal(leadCount([]), 0);
  assert.equal(leadCount(undefined), 0);
});

test("firstActionVal reads array-shaped video fields and bare numbers", () => {
  assert.equal(firstActionVal([{ action_type: "video_view", value: "500" }]), 500);
  assert.equal(firstActionVal([{ value: "0" }, { value: "300" }]), 300); // first non-zero
  assert.equal(firstActionVal("42"), 42);
  assert.equal(firstActionVal(undefined), 0);
});

// ── creative rates ──────────────────────────────────────────────────────────
test("hookRate = 3s plays / impressions, holdRate = thruplays / 3s plays", () => {
  assert.equal(hookRate(300, 1000), 0.3);
  assert.equal(holdRate(90, 300), 0.3);
  // zero-division cases
  assert.equal(hookRate(300, 0), null);
  assert.equal(holdRate(90, 0), null);
});

test("retentionCurve expresses each mark as a fraction of plays; null when no plays", () => {
  const c = retentionCurve({ plays: 1000, p25: 500, p50: 250, p75: 120, p95: 40, p100: 20 });
  assert.equal(c.p0, 1);
  assert.equal(c.p25, 0.5);
  assert.equal(c.p50, 0.25);
  assert.equal(c.p100, 0.02);
  const empty = retentionCurve({ plays: 0, p25: 0 });
  assert.equal(empty.p0, null);
  assert.equal(empty.p25, null);
});

// ── lead ad-name recovery + normalisation ───────────────────────────────────
test("leadAdName recovers the ad from the composite source; non-Meta → null", () => {
  assert.equal(leadAdName("Meta Ads · Reel A — QdL"), "Reel A — QdL");
  assert.equal(leadAdName("Meta Ads"), null); // unattributed
  assert.equal(leadAdName("hero-email"), null); // subscribers source, never an ad
  assert.equal(leadAdName(""), null);
  assert.equal(leadAdName(null), null);
});

test("normAdName trims, collapses whitespace, lowercases", () => {
  assert.equal(normAdName("  Reel   A  "), "reel a");
  assert.equal(normAdName("Reel A"), normAdName("reel  a"));
});

// ── the subscribers/leads join ──────────────────────────────────────────────
test("joinLeadsByAd tallies total, A/B/C, unclassified and qualified per ad", () => {
  const leads = [
    { source: "Meta Ads · Reel A", classification: "A", status: "Viewing booked" },
    { source: "Meta Ads · Reel A", classification: "B", status: "Contacted — qualifying" },
    { source: "Meta Ads · Reel A", classification: "", status: "New" },
    { source: "Meta Ads · reel a", classification: "a", status: "Closed" }, // casing drift → same ad
    { source: "Meta Ads · Reel B", classification: "C", status: "Lost" },
    { source: "hero-email", classification: "A", status: "Closed" }, // subscribers → ignored
    { source: "Meta Ads", classification: "A", status: "Closed" }, // unattributed → ignored
  ];
  const map = joinLeadsByAd(leads);
  const a = map.get("reel a");
  assert.equal(a.total, 4);
  assert.equal(a.A, 2); // "A" + lowercase "a"
  assert.equal(a.B, 1);
  assert.equal(a.unclassified, 1);
  assert.equal(a.qualified, 3); // Viewing booked + qualifying + Closed (Lost/New excluded)
  const b = map.get("reel b");
  assert.equal(b.total, 1);
  assert.equal(b.qualified, 0); // Lost is not qualified
  assert.equal(map.size, 2); // only the two Meta ads
});

test("joinLeadsByAd on no leads / non-array is empty, never throws", () => {
  assert.equal(joinLeadsByAd([]).size, 0);
  assert.equal(joinLeadsByAd(undefined).size, 0);
});

// ── date-window scoping of the lead join (period correctness) ────────────────
test("presetWindow derives since/until from the preset; maximum = no window", () => {
  const now = Date.parse("2026-02-10T12:00:00Z");
  assert.equal(presetWindow("maximum", now), null);
  assert.equal(presetWindow("7d", now).since, now - 7 * 86400000);
  assert.equal(presetWindow("7d", now).until, now);
  assert.equal(presetWindow("14d", now).since, now - 14 * 86400000);
  assert.equal(presetWindow("30d", now).since, now - 30 * 86400000);
  assert.equal(presetWindow("bogus", now).since, now - 7 * 86400000); // unmapped → 7d, mirrors metaDatePreset
});

test("inWindow: inside counts, outside doesn't, boundaries inclusive, untimed excluded from a window", () => {
  const now = Date.parse("2026-02-10T12:00:00Z");
  const w = presetWindow("7d", now); // [now-7d, now]
  assert.equal(inWindow("2026-02-08T00:00:00Z", w), true);  // 2 days ago → inside
  assert.equal(inWindow("2026-01-01T00:00:00Z", w), false); // 40 days ago → outside
  assert.equal(inWindow(new Date(w.since).toISOString(), w), true);  // exactly at `since` → inclusive
  assert.equal(inWindow(new Date(w.until).toISOString(), w), true);  // exactly at `until` → inclusive
  assert.equal(inWindow(new Date(w.since - 1).toISOString(), w), false); // 1 ms before since → out
  assert.equal(inWindow("", w), false);          // no timestamp → excluded from a bounded window
  assert.equal(inWindow("not-a-date", w), false); // unparseable → excluded
  assert.equal(inWindow("", null), true);         // maximum (no window) → everything counts
});

test("joinLeadsByAd windows by the lead's ORIGINAL created_at, not the classification date", () => {
  const now = Date.parse("2026-02-10T12:00:00Z");
  const leads = [
    { source: "Meta Ads · Reel A", classification: "A", status: "Closed", created_at: "2026-02-09T09:00:00Z" }, // in 7d
    { source: "Meta Ads · Reel A", classification: "A", status: "Closed", created_at: "2025-11-01T09:00:00Z" }, // old → out of 7d
    { source: "Meta Ads · Reel A", classification: "B", status: "New", created_at: "2026-02-08T09:00:00Z" },    // in 7d
  ];
  const win = joinLeadsByAd(leads, { window: presetWindow("7d", now) });
  const a7 = win.get("reel a");
  assert.equal(a7.total, 2);     // only the two recent leads
  assert.equal(a7.A, 1);         // the old A-lead is excluded
  assert.equal(a7.qualified, 1); // only the recent Closed lead
  // maximum (no window) counts them all, incl. the old one
  const all = joinLeadsByAd(leads, { window: presetWindow("maximum", now) });
  assert.equal(all.get("reel a").total, 3);
  assert.equal(all.get("reel a").A, 2);
});

// ── full assembly, incl. cost-per-qualified / cost-per-A with zero division ──
test("assembleAdsInsights joins Meta rows with leads and computes costs", () => {
  const main = {
    data: [
      {
        ad_id: "1", ad_name: "Reel A", spend: "100", impressions: "1000", reach: "800",
        frequency: "1.25", inline_link_clicks: "50",
        actions: [
          { action_type: "video_view", value: "300" }, // 3s plays
          { action_type: "lead", value: "10" },
        ],
        video_play_actions: [{ value: "600" }],
        video_thruplay_watched_actions: [{ value: "90" }],
        video_p25_watched_actions: [{ value: "300" }],
        video_p50_watched_actions: [{ value: "150" }],
        video_p75_watched_actions: [{ value: "60" }],
        video_p95_watched_actions: [{ value: "30" }],
        video_p100_watched_actions: [{ value: "20" }],
        video_avg_time_watched_actions: [{ value: "7" }],
      },
      { ad_id: "2", ad_name: "Paused Reel", spend: "0", impressions: "0", actions: [] }, // spend 0 → excluded
    ],
  };
  const platform = { data: [
    { ad_id: "1", publisher_platform: "instagram", platform_position: "story", spend: "60", impressions: "600", actions: [{ action_type: "lead", value: "6" }] },
  ] };
  const hourly = { data: [
    { ad_id: "1", hourly_stats_aggregated_by_advertiser_time_zone: "13:00:00 - 13:59:59", impressions: "400", actions: [{ action_type: "lead", value: "4" }] },
  ] };
  const daily = { data: [
    { ad_id: "1", date_start: "2026-01-02", spend: "40", actions: [{ action_type: "lead", value: "4" }] },
    { ad_id: "1", date_start: "2026-01-01", spend: "60", actions: [{ action_type: "lead", value: "6" }] },
  ] };
  const leads = [
    { source: "Meta Ads · Reel A", classification: "A", status: "Viewing booked" },
    { source: "Meta Ads · Reel A", classification: "A", status: "New" },
    { source: "Meta Ads · Reel A", classification: "C", status: "Closed" },
    { source: "Meta Ads · Ghost Ad", classification: "B", status: "Closed" }, // no insights row → unmatched
  ];

  // "maximum" → no date window, so these timestamp-less fixture leads all join
  // (this test is about the join + cost math, not the period scoping below).
  const out = assembleAdsInsights({ main, platform, hourly, daily, leads, preset: "maximum" });
  assert.equal(out.ok, true);
  assert.equal(out.ads.length, 1); // only Reel A (spend > 0)

  const ad = out.ads[0];
  assert.equal(ad.adName, "Reel A");
  assert.equal(ad.hookRate, 0.3); // 300/1000
  assert.equal(ad.holdRate, 0.3); // 90/300
  assert.equal(ad.ctr, 0.05); // 50/1000 link CTR
  assert.equal(ad.leads, 10);
  assert.equal(ad.cpl, 10); // 100/10
  assert.equal(ad.retention.p50, 150 / 600);
  // join: 3 leads on Reel A, 2×A, 1×C, qualified = Viewing booked + Closed = 2
  assert.equal(ad.sysLeads, 3);
  assert.equal(ad.byClass.A, 2);
  assert.equal(ad.aLeads, 2);
  assert.equal(ad.qualified, 2);
  assert.equal(ad.costPerQualified, 50); // 100/2
  assert.equal(ad.costPerA, 50); // 100/2
  // detail breakdowns present
  assert.equal(ad.platforms.length, 1);
  assert.equal(ad.platforms[0].platform, "instagram");
  assert.equal(ad.hours[13].impressions, 400);
  assert.equal(ad.hours[13].leads, 4);
  assert.equal(ad.daily[0].date, "2026-01-01"); // sorted ascending
  // unmatched lead-only ad surfaced, not dropped
  assert.equal(out.unmatchedLeadAds.length, 1);
  assert.equal(out.unmatchedLeadAds[0].adName, "Ghost Ad");

  // totals
  assert.equal(out.totals.spend, 100);
  assert.equal(out.totals.leads, 10);
  assert.equal(out.totals.cpl, 10);
});

test("assembleAdsInsights with an ad that has zero qualified/A leads → null costs (no divide-by-zero)", () => {
  const main = { data: [{ ad_id: "9", ad_name: "Cold Ad", spend: "80", impressions: "500", inline_link_clicks: "0", actions: [] }] };
  const leads = [{ source: "Meta Ads · Cold Ad", classification: "", status: "New" }];
  const out = assembleAdsInsights({ main, platform: {}, hourly: {}, daily: {}, leads, preset: "30d" });
  const ad = out.ads[0];
  assert.equal(ad.qualified, 0);
  assert.equal(ad.aLeads, 0);
  assert.equal(ad.costPerQualified, null);
  assert.equal(ad.costPerA, null);
  assert.equal(ad.ctr, 0); // 0 clicks / 500 impressions → a real 0, not a divide-by-zero
  assert.equal(ad.cpl, null); // 0 leads → divide-by-zero guarded to null
  assert.equal(ad.hookRate, 0); // 0 three-sec plays / 500 impressions → real 0 (denominator is impressions)
});

test("assembleAdsInsights scopes QUALIFIED / A-LEADS / costs / benchmarks to the preset window", () => {
  const now = Date.parse("2026-02-10T12:00:00Z");
  const main = { data: [{ ad_id: "1", ad_name: "Reel A", spend: "100", impressions: "4000", inline_link_clicks: "40", actions: [{ action_type: "lead", value: "7" }] }] };
  const leads = [
    // in the last 7 days
    { source: "Meta Ads · Reel A", classification: "A", status: "Viewing booked", created_at: "2026-02-09T09:00:00Z" },
    { source: "Meta Ads · Reel A", classification: "B", status: "New", created_at: "2026-02-08T09:00:00Z" },
    // older — must NOT count in the 7-day view (the all-time bug)
    { source: "Meta Ads · Reel A", classification: "A", status: "Closed", created_at: "2025-12-01T09:00:00Z" },
    { source: "Meta Ads · Reel A", classification: "A", status: "Closed", created_at: "2025-11-15T09:00:00Z" },
  ];
  const win = assembleAdsInsights({ main, leads, preset: "7d", now });
  const a = win.ads[0];
  assert.equal(a.sysLeads, 2);          // only the 2 recent leads, not all 4
  assert.equal(a.aLeads, 1);            // 1 recent A (the 2 old A-leads excluded)
  assert.equal(a.qualified, 1);         // 1 recent qualified (Viewing booked)
  assert.equal(a.byClass.A, 1);         // tooltip counts are windowed too
  assert.equal(a.costPerA, 100);        // €100 / 1 A-lead, not /3
  assert.equal(a.costPerQualified, 100);
  assert.equal(win.benchmarks.costPerA, 100); // benchmark weighting is windowed
  assert.equal(win.totals.aLeads, 1);

  // the same data over "maximum" counts all 4 leads (3 A-leads)
  const all = assembleAdsInsights({ main, leads, preset: "maximum", now });
  assert.equal(all.ads[0].aLeads, 3);
  assert.equal(all.ads[0].costPerA, 100 / 3);
});

test("metaDatePreset maps the UI range to Meta's enum, defaults to last_7d", () => {
  assert.equal(metaDatePreset("7d"), "last_7d");
  assert.equal(metaDatePreset("14d"), "last_14d");
  assert.equal(metaDatePreset("30d"), "last_30d");
  assert.equal(metaDatePreset("maximum"), "maximum");
  assert.equal(metaDatePreset("bogus"), "last_7d");
});

// ════════════════════════════════════════════════════════════════════════════
// v2: thumbnails, benchmarks, top performers, auto-insights
// ════════════════════════════════════════════════════════════════════════════
import {
  weightedBenchmarks,
  topPerformers,
  adDiagnoses,
  DIAGNOSES,
} from "./adsInsights.js";

// ── weighted benchmarks ──
test("weightedBenchmarks are impression/spend-weighted account rates, not a mean of rates", () => {
  const ads = [
    // big ad: 10000 impr, 3000 3s, 900 thru, 300 clicks, €100, 10 leads, 5000 plays, 8s
    { impressions: 10000, threeSecPlays: 3000, thruPlays: 900, clicks: 300, spend: 100, leads: 10, videoPlays: 5000, avgWatchTime: 8 },
    // tiny ad with a wild rate that must NOT skew the weighted average
    { impressions: 100, threeSecPlays: 100, thruPlays: 100, clicks: 100, spend: 1, leads: 0, videoPlays: 50, avgWatchTime: 20 },
  ];
  const b = weightedBenchmarks(ads);
  assert.equal(b.hook, 3100 / 10100); // ≈0.307, close to the big ad's 0.30 (tiny ad barely moves it)
  assert.equal(b.hold, 1000 / 3100);
  assert.equal(b.ctr, 400 / 10100);
  assert.equal(b.cpl, 101 / 10); // total spend / total leads
  assert.equal(b.avgWatch, (8 * 5000 + 20 * 50) / 5050); // play-weighted
  assert.equal(b.leadsPerAd, 10 / 2);
});

test("weightedBenchmarks on empty input → null rates, never throws", () => {
  const b = weightedBenchmarks([]);
  assert.equal(b.hook, null);
  assert.equal(b.cpl, null);
  assert.equal(b.costPerQualified, null);
  assert.equal(b.costPerA, null);
  assert.equal(b.leadsPerAd, 0);
});

test("weightedBenchmarks.costPerQualified is spend-weighted over ONLY ads with ≥1 qualified", () => {
  const ads = [
    { impressions: 1000, spend: 100, qualified: 4 }, // included
    { impressions: 1000, spend: 60, qualified: 2 },  // included
    { impressions: 1000, spend: 999, qualified: 0 }, // excluded: no qualified → spend must not inflate it
  ];
  assert.equal(weightedBenchmarks(ads).costPerQualified, (100 + 60) / (4 + 2)); // 160/6
});

test("weightedBenchmarks.costPerA is spend-weighted over ONLY ads with ≥1 A-lead", () => {
  const ads = [
    { impressions: 1000, spend: 100, aLeads: 2 },  // included: €100 over 2 A-leads
    { impressions: 1000, spend: 60, aLeads: 3 },   // included: €60 over 3 A-leads
    { impressions: 1000, spend: 999, aLeads: 0 },  // excluded: its spend must NOT inflate cost/A
  ];
  assert.equal(weightedBenchmarks(ads).costPerA, (100 + 60) / (2 + 3)); // 160/5 = 32
});

test("weightedBenchmarks.costPerA is null when no ad produced an A-lead", () => {
  assert.equal(weightedBenchmarks([{ impressions: 500, spend: 80, aLeads: 0 }]).costPerA, null);
});

// ── top performers ──
function ad(over = {}) {
  return {
    adId: "x", adName: "Ad", thumbnailUrl: "t", impressions: 2000,
    hookRate: 0.2, holdRate: 0.2, ctr: 0.02, qualified: 2, costPerQualified: 50,
    byClass: { A: 1, B: 1, C: 1, unclassified: 0 }, ...over,
  };
}

test("topPerformers picks the winner per category and respects the ≥1000-impression floor", () => {
  const ads = [
    ad({ adId: "1", adName: "A", impressions: 5000, hookRate: 0.4, holdRate: 0.1, ctr: 0.01, qualified: 2, costPerQualified: 80, byClass: { A: 5, B: 1, C: 0, unclassified: 0 } }),
    ad({ adId: "2", adName: "B", impressions: 5000, hookRate: 0.1, holdRate: 0.5, ctr: 0.05, qualified: 4, costPerQualified: 20, byClass: { A: 1, B: 3, C: 2, unclassified: 0 } }),
    // tiny but amazing — must be excluded by the impression floor
    ad({ adId: "3", adName: "Tiny", impressions: 200, hookRate: 0.99, holdRate: 0.99, ctr: 0.99, qualified: 9, costPerQualified: 1, byClass: { A: 9, B: 0, C: 0, unclassified: 0 } }),
  ];
  const tp = topPerformers(ads);
  assert.equal(tp.bestHook.adId, "1"); // 0.4 (Tiny's 0.99 excluded)
  assert.equal(tp.bestRetention.adId, "2"); // 0.5
  assert.equal(tp.bestCtr.adId, "2"); // 0.05
  assert.equal(tp.cheapestQualified.adId, "2"); // €20 < €80
  assert.equal(tp.bestQuality.adId, "1"); // 5/6 A-share vs 1/6
  assert.equal(tp.bestHook.thumbnailUrl, "t");
});

test("topPerformers category floors: ≥1 qualified and ≥3 classified; null when none eligible", () => {
  const ads = [
    ad({ adId: "1", impressions: 3000, qualified: 0, byClass: { A: 1, B: 1, C: 0, unclassified: 0 } }), // 0 qualified, 2 classified
  ];
  const tp = topPerformers(ads);
  assert.equal(tp.cheapestQualified, null); // no ad with ≥1 qualified
  assert.equal(tp.bestQuality, null); // no ad with ≥3 classified
  assert.equal(tp.bestHook.adId, "1"); // hook has no extra floor
});

test("topPerformers with no ad over the impression floor → all null", () => {
  const tp = topPerformers([ad({ impressions: 10 })]);
  assert.equal(tp.bestHook, null);
  assert.equal(tp.bestCtr, null);
});

test("topPerformers cheapestALead: lowest € / A among ads with ≥2 A-leads (floor, ties, null)", () => {
  const mk = (over) => ad({ impressions: 3000, ...over });
  const ads = [
    mk({ adId: "1", aLeads: 3, costPerA: 40 }),
    mk({ adId: "2", aLeads: 5, costPerA: 25 }), // cheapest & eligible → winner
    mk({ adId: "3", aLeads: 1, costPerA: 5 }),  // cheaper, but only 1 A-lead → below the ≥2 floor
  ];
  assert.equal(topPerformers(ads).cheapestALead.adId, "2");
  assert.equal(topPerformers(ads).cheapestALead.value, 25);

  // tie on € / A → first-seen keeps the podium (strict < never displaces it)
  const tied = [mk({ adId: "a", aLeads: 2, costPerA: 30 }), mk({ adId: "b", aLeads: 4, costPerA: 30 })];
  assert.equal(topPerformers(tied).cheapestALead.adId, "a");

  // exactly 1 A-lead is NOT enough → null (greyed card)
  assert.equal(topPerformers([mk({ adId: "z", aLeads: 1, costPerA: 10 })]).cheapestALead, null);
  // zero A-leads → null
  assert.equal(topPerformers([mk({ adId: "y", aLeads: 0, costPerA: null })]).cheapestALead, null);
});

// ── auto-insights (each rule: fires / doesn't / boundary) ──
const BENCH = { hook: 0.3, hold: 0.3, ctr: 0.02, cpl: 20, avgWatch: 5, leadsPerAd: 4 };
const codes = (a, b = BENCH) => adDiagnoses(a, b).map((d) => d.code);
// a fully-average ad that trips no rule — spread + override per test
const baseAd = { hookRate: 0.3, holdRate: 0.3, ctr: 0.02, cpl: 20, frequency: 1, ctr30: 0.02, sysLeads: 4, qualified: 2, leads: 4, byClass: { A: 1, B: 1, C: 1, unclassified: 0 } };

test("diagnosis weak_hook: fires / doesn't / boundary", () => {
  assert.ok(codes({ ...baseAd, hookRate: 0.2, holdRate: 0.4 }).includes("weak_hook")); // hook<avg, hold>avg
  assert.ok(!codes({ ...baseAd, hookRate: 0.4, holdRate: 0.4 }).includes("weak_hook")); // hook>avg → no
  assert.ok(!codes({ ...baseAd, hookRate: 0.3, holdRate: 0.4 }).includes("weak_hook")); // hook==avg (boundary) → no
});

test("diagnosis weak_middle: fires / doesn't / boundary", () => {
  assert.ok(codes({ ...baseAd, hookRate: 0.4, holdRate: 0.2 }).includes("weak_middle")); // hook>avg, hold<avg
  assert.ok(!codes({ ...baseAd, hookRate: 0.2, holdRate: 0.2 }).includes("weak_middle")); // hook<avg → no
  assert.ok(!codes({ ...baseAd, hookRate: 0.4, holdRate: 0.3 }).includes("weak_middle")); // hold==avg (boundary) → no
});

test("diagnosis filtering_hook: fires / doesn't / boundary", () => {
  // hook<avg AND cpl<avg AND leads≥3 → fires (a filtering hook, not a failing one)
  assert.ok(codes({ ...baseAd, hookRate: 0.2, cpl: 10, leads: 3 }).includes("filtering_hook"));
  assert.ok(!codes({ ...baseAd, hookRate: 0.4, cpl: 10, leads: 5 }).includes("filtering_hook")); // hook>avg → no
  assert.ok(!codes({ ...baseAd, hookRate: 0.2, cpl: 40, leads: 5 }).includes("filtering_hook")); // cpl>avg → no
  assert.ok(!codes({ ...baseAd, hookRate: 0.3, cpl: 10, leads: 5 }).includes("filtering_hook")); // hook==avg (boundary) → no
  assert.ok(!codes({ ...baseAd, hookRate: 0.2, cpl: 20, leads: 5 }).includes("filtering_hook")); // cpl==avg (boundary) → no
  assert.ok(!codes({ ...baseAd, hookRate: 0.2, cpl: 10, leads: 2 }).includes("filtering_hook")); // <3 leads → no
});

test("diagnosis form_friction: fires / doesn't / boundary", () => {
  assert.ok(codes({ ...baseAd, ctr: 0.05, cpl: 40 }).includes("form_friction")); // ctr>avg, cpl>avg
  assert.ok(!codes({ ...baseAd, ctr: 0.05, cpl: 10 }).includes("form_friction")); // cpl<avg → no
  assert.ok(!codes({ ...baseAd, ctr: 0.02, cpl: 40 }).includes("form_friction")); // ctr==avg (boundary) → no
});

test("diagnosis fatigue: fires / doesn't / boundary", () => {
  assert.ok(codes({ ...baseAd, frequency: 3, ctr: 0.01, ctr30: 0.03 }).includes("fatigue")); // freq>2.5 & ctr<own 30d
  assert.ok(!codes({ ...baseAd, frequency: 3, ctr: 0.04, ctr30: 0.03 }).includes("fatigue")); // ctr≥ctr30 → no
  assert.ok(!codes({ ...baseAd, frequency: 2.5, ctr: 0.01, ctr30: 0.03 }).includes("fatigue")); // freq==2.5 (boundary) → no
  assert.ok(!codes({ ...baseAd, frequency: 3, ctr: 0.01, ctr30: null }).includes("fatigue")); // no 30d baseline → no
});

test("diagnosis low_quality: fires / doesn't / boundary", () => {
  // leads≥max(5,4)=5, qualified/sys = 1/10 = 0.1 < 0.2, classified≥1
  assert.ok(codes({ ...baseAd, leads: 6, sysLeads: 10, qualified: 1 }).includes("low_quality"));
  assert.ok(!codes({ ...baseAd, leads: 6, sysLeads: 10, qualified: 5 }).includes("low_quality")); // share 0.5 → no
  assert.ok(!codes({ ...baseAd, leads: 4, sysLeads: 10, qualified: 1 }).includes("low_quality")); // volume below floor (4<5) → no
  assert.ok(!codes({ ...baseAd, leads: 6, sysLeads: 10, qualified: 2 }).includes("low_quality")); // share==0.2 (boundary) → no
});

test("rule precedence: filtering_hook suppresses the contradictory weak_hook", () => {
  // both conditions true: hook<avg & hold>avg (weak_hook) AND cpl<avg & ≥3 leads (filtering)
  const both = codes({ ...baseAd, hookRate: 0.2, holdRate: 0.4, cpl: 10, leads: 5 });
  assert.ok(both.includes("filtering_hook"));
  assert.ok(!both.includes("weak_hook")); // suppressed: "don't fix the hook" outranks "fix the hook"
  // weak_hook alone (CPL above avg → filtering can't fire) is unaffected
  const wh = codes({ ...baseAd, hookRate: 0.2, holdRate: 0.4, cpl: 40, leads: 5 });
  assert.ok(wh.includes("weak_hook"));
  assert.ok(!wh.includes("filtering_hook"));
  // filtering_hook alone (hold below avg → weak_hook can't fire) still fires
  const fh = codes({ ...baseAd, hookRate: 0.2, holdRate: 0.2, cpl: 10, leads: 5 });
  assert.ok(fh.includes("filtering_hook"));
  assert.ok(!fh.includes("weak_hook"));
});

test("an average ad trips no diagnosis; rules are independent", () => {
  assert.deepEqual(codes(baseAd), []);
  assert.equal(DIAGNOSES.length, 6);
});

test("diagnosis copy is the English wording (locks the translation; all ASCII)", () => {
  const byCode = Object.fromEntries(DIAGNOSES.map((d) => [d.code, d.text]));
  assert.equal(byCode.weak_hook, "Weak first 3 seconds: viewers who stay, stay to the end — fix the hook, not the video.");
  assert.equal(byCode.weak_middle, "Strong hook but the middle loses people: tighten or speed up the mid-section.");
  assert.equal(byCode.filtering_hook, "Low hook, cheap leads: this hook is filtering, not failing — it lets fewer people in, but the right ones. Don't 'fix' the hook.");
  assert.equal(byCode.form_friction, "The video sells but the form blocks: review the instant form / post-click friction.");
  assert.equal(byCode.fatigue, "Fatigue signs: the audience has seen this too many times — prepare fresh creative.");
  assert.equal(byCode.low_quality, "Volume without quality: review the ad's promise vs the product.");
  // No accented/Portuguese characters remain in any diagnosis text (— em-dash allowed).
  for (const d of DIAGNOSES) assert.ok(!/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(d.text), `${d.code} has non-English chars`);
});

// ── assembly surfaces thumbnails, ctr30, benchmarks, topPerformers, per-ad insights ──
test("assembleAdsInsights attaches thumbnails + ctr30 and emits benchmarks/topPerformers/insights", () => {
  const main = { data: [
    { ad_id: "1", ad_name: "Reel A", spend: "100", impressions: "4000", inline_link_clicks: "40", frequency: "3",
      actions: [{ action_type: "video_view", value: "2000" }, { action_type: "lead", value: "10" }],
      video_play_actions: [{ value: "3000" }], video_thruplay_watched_actions: [{ value: "1200" }] },
  ] };
  const baseline = { data: [{ ad_id: "1", impressions: "9000", inline_link_clicks: "180" }] }; // 30d ctr = 0.02
  const thumbnails = new Map([["1", "https://cdn/thumb1.jpg"]]);
  const leads = [
    { source: "Meta Ads · Reel A", classification: "A", status: "Viewing booked" },
    { source: "Meta Ads · Reel A", classification: "B", status: "New" },
    { source: "Meta Ads · Reel A", classification: "C", status: "New" },
  ];
  const out = assembleAdsInsights({ main, baseline, thumbnails, leads, preset: "maximum" }); // all-time: join the fixture leads
  const a = out.ads[0];
  assert.equal(a.thumbnailUrl, "https://cdn/thumb1.jpg");
  assert.equal(a.ctr30, 180 / 9000); // 0.02
  assert.ok(out.benchmarks && typeof out.benchmarks.hook === "number");
  assert.equal(out.benchmarks.costPerA, 100); // €100 spend over 1 A-lead, weighted
  assert.equal(out.benchmarks.costPerQualified, 100); // €100 over 1 qualified (Viewing booked)
  assert.equal(out.totals.costPerA, 100);
  assert.ok(out.topPerformers && "cheapestALead" in out.topPerformers);
  assert.ok(out.topPerformers && "bestHook" in out.topPerformers);
  assert.ok(Array.isArray(a.insights));
  // current ctr = 40/4000 = 0.01 < own 30d 0.02, frequency 3 > 2.5 → fatigue fires
  assert.ok(a.insights.some((d) => d.code === "fatigue"));
});

test("assembleAdsInsights without thumbnails/baseline degrades (placeholder url, no fatigue)", () => {
  const main = { data: [{ ad_id: "1", ad_name: "Reel A", spend: "50", impressions: "2000", inline_link_clicks: "40", frequency: "3", actions: [] }] };
  const out = assembleAdsInsights({ main, leads: [], preset: "7d" });
  assert.equal(out.ads[0].thumbnailUrl, "");
  assert.equal(out.ads[0].ctr30, null);
  assert.ok(!out.ads[0].insights.some((d) => d.code === "fatigue")); // no 30d baseline → can't fire
});

test("assembleAdsInsights attaches videoUrl from the videos map; null when absent", () => {
  const main = { data: [
    { ad_id: "1", ad_name: "Video Ad", spend: "50", impressions: "2000", actions: [] },
    { ad_id: "2", ad_name: "Image Ad", spend: "30", impressions: "1000", actions: [] },
  ] };
  const videos = new Map([["1", "https://cdn/video1.mp4"]]); // only ad 1 is a video
  const out = assembleAdsInsights({ main, videos, leads: [], preset: "7d" });
  const byId = Object.fromEntries(out.ads.map((a) => [a.adId, a]));
  assert.equal(byId["1"].videoUrl, "https://cdn/video1.mp4");
  assert.equal(byId["2"].videoUrl, null); // no entry → null, never undefined
  // accepts a plain object too (defensive against a cache round-trip)
  const out2 = assembleAdsInsights({ main, videos: { 1: "https://cdn/v.mp4" }, leads: [], preset: "7d" });
  assert.equal(out2.ads.find((a) => a.adId === "1").videoUrl, "https://cdn/v.mp4");
});

test("assembleAdsInsights attaches previewUrl + facebookUrl (two-tier fallback); null when absent", () => {
  const main = { data: [
    { ad_id: "1", ad_name: "Video OK", spend: "50", impressions: "2000", actions: [] },     // source served
    { ad_id: "2", ad_name: "Source refused", spend: "40", impressions: "1500", actions: [] }, // iframe fallback
    { ad_id: "3", ad_name: "FB only", spend: "20", impressions: "1200", actions: [] },        // only permalink
  ] };
  const out = assembleAdsInsights({
    main, leads: [], preset: "7d",
    videos: new Map([["1", "https://cdn/v.mp4"]]),
    previews: new Map([["1", "https://fb/iframe1"], ["2", "https://fb/iframe2"]]),
    facebookUrls: new Map([["1", "https://www.facebook.com/p_1"], ["2", "https://www.facebook.com/p_2"], ["3", "https://www.facebook.com/p_3"]]),
  });
  const byId = Object.fromEntries(out.ads.map((a) => [a.adId, a]));
  assert.equal(byId["1"].videoUrl, "https://cdn/v.mp4");
  assert.equal(byId["1"].previewUrl, "https://fb/iframe1");
  assert.equal(byId["1"].facebookUrl, "https://www.facebook.com/p_1");
  assert.equal(byId["2"].videoUrl, null);                 // Meta refused source
  assert.equal(byId["2"].previewUrl, "https://fb/iframe2"); // → iframe fallback
  assert.equal(byId["3"].videoUrl, null);
  assert.equal(byId["3"].previewUrl, null);
  assert.equal(byId["3"].facebookUrl, "https://www.facebook.com/p_3"); // → only the escape hatch
  // plain-object maps survive a cache round-trip
  const out2 = assembleAdsInsights({ main, previews: { 2: "https://fb/x" }, leads: [], preset: "7d" });
  assert.equal(out2.ads.find((a) => a.adId === "2").previewUrl, "https://fb/x");
});
