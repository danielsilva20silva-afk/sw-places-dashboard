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

  const out = assembleAdsInsights({ main, platform, hourly, daily, leads, preset: "7d" });
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

test("metaDatePreset maps the UI range to Meta's enum, defaults to last_7d", () => {
  assert.equal(metaDatePreset("7d"), "last_7d");
  assert.equal(metaDatePreset("14d"), "last_14d");
  assert.equal(metaDatePreset("30d"), "last_30d");
  assert.equal(metaDatePreset("maximum"), "maximum");
  assert.equal(metaDatePreset("bogus"), "last_7d");
});
