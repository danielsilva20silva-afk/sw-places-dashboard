import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from "recharts";
import { GOLD, CLASSIFICATION_CONFIG } from "../constants";
import { getAdsInsights } from "../api";
import useIsMobile from "../useIsMobile";

// ── Brandon-only "Ads" page ──────────────────────────────────────────────────
// Meta Ads creative performance joined with our lead-quality data. English copy
// (brandon-only, like the rest of this client). All numbers come assembled from
// /api/brandon-store?resource=ads-insights — this component only formats + charts.
// Gated by the adsInsights feature; never rendered for other clients.

const RANGES = [
  ["7d", "7 days"],
  ["14d", "14 days"],
  ["30d", "30 days"],
  ["maximum", "Maximum"],
];

const card = { background: "white", borderRadius: 16, border: "1px solid #EBEBEB" };
const muted = "#8A857C";

// ── formatters (null = no data → em-dash, never NaN) ──
const nf = new Intl.NumberFormat("en-GB");
const fmtNum = (n) => (n == null ? "—" : nf.format(Math.round(n)));
const fmtEur = (n) => {
  if (n == null) return "—";
  const v = Number(n);
  return `€${v >= 100 ? nf.format(Math.round(v)) : v.toFixed(2)}`;
};
const fmtCost = (n) => {
  if (n == null) return "—";
  const v = Number(n);
  return `€${v < 10 ? v.toFixed(2) : nf.format(Math.round(v))}`;
};
const fmtPct = (frac) => {
  if (frac == null) return "—";
  const p = frac * 100;
  return `${p < 10 ? p.toFixed(2) : p.toFixed(1)}%`;
};
const fmtSec = (n) => (n == null || n === 0 ? "—" : `${Number(n).toFixed(1)}s`);

// Creative thumbnail with graceful fallback: a missing/expired/broken signed CDN
// URL degrades to a neutral placeholder tile, never a broken-image icon. A small
// ▶ badge marks thumbnails whose ad has a playable video.
function Thumb({ url, name, size = 32, radius = 7, hasVideo = false }) {
  const [broken, setBroken] = useState(false);
  const common = {
    width: size, height: size, borderRadius: radius, flexShrink: 0,
    objectFit: "cover", background: "#EDEAE3", border: "1px solid #ECE7DC", display: "block",
  };
  const badge = hasVideo ? (
    <span style={{
      position: "absolute", right: -3, bottom: -3, width: 15, height: 15, borderRadius: "50%",
      background: "rgba(17,17,17,0.82)", color: "white", fontSize: 8, display: "flex",
      alignItems: "center", justifyContent: "center", border: "1.5px solid white",
    }}>▶</span>
  ) : null;
  const inner = (!url || broken)
    ? <div title={name} style={{ ...common, display: "flex", alignItems: "center", justifyContent: "center", color: "#C3BBA9", fontSize: Math.round(size * 0.42) }}>▦</div>
    : <img src={url} alt="" title={name} loading="lazy" onError={() => setBroken(true)} style={common} />;
  if (!badge) return inner;
  return <span style={{ position: "relative", display: "inline-block", flexShrink: 0, lineHeight: 0 }}>{inner}{badge}</span>;
}

// Large creative media: a muted <video> player (poster = thumbnail, preload none
// so nothing downloads until play) when a source exists, else the thumbnail
// image, else a placeholder. Used in the top-performer modal, the detail panel
// and the compare cards.
function AdMedia({ ad, maxHeight = 260 }) {
  const [broken, setBroken] = useState(false);
  const box = { width: "100%", maxHeight, borderRadius: 12, display: "block", background: "#121212" };
  if (ad.videoUrl) {
    return <video key={ad.videoUrl} src={ad.videoUrl} poster={ad.thumbnailUrl || undefined} controls muted preload="none" playsInline style={{ ...box, objectFit: "contain" }} />;
  }
  if (ad.thumbnailUrl && !broken) {
    return <img src={ad.thumbnailUrl} alt="" onError={() => setBroken(true)} style={{ ...box, height: maxHeight, objectFit: "cover", background: "#EDEAE3" }} />;
  }
  return <div style={{ ...box, height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#C3BBA9", fontSize: 40, background: "#EDEAE3" }}>▦</div>;
}

// Generic modal overlay: dim backdrop, click-outside + Esc to close, body-scroll
// locked while open, content scrolls on small screens.
function Modal({ onClose, children, maxWidth = 680 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,14,0.55)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, maxWidth, width: "100%", padding: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// Column legend — one marketer-friendly line per column. Reused for header
// title= tooltips and the "Legend" modal.
const LEGEND = [
  { key: "adName", label: "Ad", text: "The ad creative and its name." },
  { key: "spend", label: "Spend", text: "Amount spent on this ad in the selected period." },
  { key: "impressions", label: "Impr.", text: "Number of times the ad was shown." },
  { key: "hookRate", label: "Hook", text: "% of impressions that watched at least 3 seconds. Does the first moment grab attention?" },
  { key: "holdRate", label: "Hold", text: "% of 3s viewers that watched to the end (ThruPlay). Does the video keep people?" },
  { key: "avgWatchTime", label: "Avg watch", text: "Average seconds watched per play." },
  { key: "ctr", label: "CTR", text: "% of impressions that clicked the link." },
  { key: "leads", label: "Leads", text: "Form submissions (leads) reported by Meta." },
  { key: "cpl", label: "CPL", text: "Cost per lead (spend ÷ leads)." },
  { key: "qualified", label: "Qual.", text: "Leads Brandon marked as qualified or better." },
  { key: "costPerQualified", label: "€ per qual.", text: "Spend ÷ qualified leads." },
  { key: "byClass", label: "A / B / C", text: "Brandon's lead-quality classification counts (+N = not yet classified)." },
];
const LEGEND_TEXT = Object.fromEntries(LEGEND.map((l) => [l.key, l.text]));

// Subtle vs-benchmark cell tint: green when better by >10%, red when worse by
// >10%, nothing inside the ±10% neutral band. `higherBetter` flips direction for
// cost metrics (lower CPL is better).
function tintBg(value, benchmark, higherBetter) {
  if (value == null || benchmark == null || !(benchmark > 0)) return undefined;
  const r = value / benchmark;
  if (higherBetter ? r >= 1.1 : r <= 0.9) return "#F0F8F1"; // green tint
  if (higherBetter ? r <= 0.9 : r >= 1.1) return "#FDF3F2"; // red tint
  return undefined;
}

// A/B/C chip cluster + unclassified count.
function ClassChips({ byClass }) {
  if (!byClass) return <span style={{ color: "#CCC" }}>—</span>;
  const order = ["A", "B", "C"];
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {order.map((k) => {
        const n = byClass[k] || 0;
        const c = CLASSIFICATION_CONFIG[k];
        return (
          <span key={k} title={`${n} ${k}-leads`} style={{
            fontSize: 11, fontWeight: 700, minWidth: 20, textAlign: "center",
            padding: "1px 5px", borderRadius: 6, color: c.text, background: c.bg,
            border: `1px solid ${c.border}`, opacity: n ? 1 : 0.4,
          }}>{n}</span>
        );
      })}
      {byClass.unclassified ? (
        <span title={`${byClass.unclassified} unclassified`} style={{ fontSize: 11, color: "#AAA" }}>
          +{byClass.unclassified}
        </span>
      ) : null}
    </span>
  );
}

// ── Main sortable table columns ──
// numeric: higher = better? only affects nothing here; sort is plain numeric/text.
const COLUMNS = [
  { key: "adName", label: "Ad", align: "left", get: (a) => a.adName, fmt: (v) => v || "—", text: true },
  { key: "spend", label: "Spend", get: (a) => a.spend, fmt: fmtEur },
  { key: "impressions", label: "Impr.", get: (a) => a.impressions, fmt: fmtNum },
  { key: "hookRate", label: "Hook", title: "3-second plays ÷ impressions (tinted vs period average)", get: (a) => a.hookRate, fmt: fmtPct, bench: "hook", higherBetter: true },
  { key: "holdRate", label: "Hold", title: "ThruPlays ÷ 3-second plays (tinted vs period average)", get: (a) => a.holdRate, fmt: fmtPct, bench: "hold", higherBetter: true },
  { key: "avgWatchTime", label: "Avg watch", title: "Average watch time (tinted vs period average)", get: (a) => a.avgWatchTime, fmt: fmtSec, bench: "avgWatch", higherBetter: true },
  { key: "ctr", label: "CTR", title: "Link clicks ÷ impressions (tinted vs period average)", get: (a) => a.ctr, fmt: fmtPct, bench: "ctr", higherBetter: true },
  { key: "leads", label: "Leads", title: "Leads reported by Meta", get: (a) => a.leads, fmt: fmtNum },
  { key: "cpl", label: "CPL", title: "Cost per lead — spend ÷ Meta leads (tinted vs period average)", get: (a) => a.cpl, fmt: fmtCost, bench: "cpl", higherBetter: false },
  { key: "qualified", label: "Qual.", title: "Leads in a qualified-or-better status (our pipeline)", get: (a) => a.qualified, fmt: fmtNum },
  { key: "costPerQualified", label: "€ / qual.", title: "Spend ÷ qualified leads", get: (a) => a.costPerQualified, fmt: fmtCost },
  { key: "byClass", label: "A / B / C", align: "left", get: (a) => a.aLeads, sortKey: (a) => a.aLeads, chips: true },
];

const th = {
  fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase",
  letterSpacing: "0.4px", padding: "10px 12px", whiteSpace: "nowrap", cursor: "pointer",
  userSelect: "none", position: "sticky", top: 0, background: "#FBFAF8",
};
const td = { fontSize: 13, color: "#222", padding: "11px 12px", whiteSpace: "nowrap" };

function StatCard({ label, value, sub }) {
  return (
    <div style={{ ...card, padding: "18px 20px 14px" }}>
      <p style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px", fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, color: "#111", letterSpacing: "-1.5px", margin: "0 0 5px", lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, color: "#BBB", margin: 0 }}>{sub}</p>
    </div>
  );
}

// ── Top performers strip ("quadro de honra") ──
// One winning ad per category over the period. A null winner (no ad cleared the
// ≥1000-impression sample floor, or the category's extra floor) renders greyed.
// `metricLabel` + `bench` (how to find the account average) + `higherBetter` drive
// the "vs account average" delta shown in the modal. bestQuality has no benchmark.
const PERF_CARDS = [
  { key: "bestHook", icon: "🪝", label: "Best Hook", metricLabel: "Hook rate", fmt: fmtPct, bench: (b) => b?.hook, higherBetter: true },
  { key: "bestRetention", icon: "🎬", label: "Best Retention", metricLabel: "Hold rate", fmt: fmtPct, bench: (b) => b?.hold, higherBetter: true },
  { key: "bestCtr", icon: "🖱", label: "Best CTR", metricLabel: "CTR", fmt: fmtPct, bench: (b) => b?.ctr, higherBetter: true },
  { key: "cheapestQualified", icon: "💶", label: "Cheapest Qualified", metricLabel: "Cost per qualified", fmt: fmtCost, bench: (b, t) => t?.costPerQualified, higherBetter: false },
  { key: "bestQuality", icon: "⭐", label: "Best Lead Quality", metricLabel: "A-lead share", fmt: (v) => `${fmtPct(v)} A`, bench: () => null, higherBetter: true },
];

function TopPerformers({ performers, onOpen }) {
  if (!performers) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
      {PERF_CARDS.map((c) => {
        const w = performers[c.key];
        const base = { ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, minHeight: 92 };
        if (!w) {
          return (
            <div key={c.key} style={{ ...base, opacity: 0.55 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>{c.icon} {c.label}</span>
              <span style={{ fontSize: 12, color: "#B4AE9F", marginTop: "auto" }}>not enough data</span>
            </div>
          );
        }
        return (
          <button key={c.key} onClick={() => onOpen(c.key)} title={`${c.label}: ${w.adName}`} style={{ ...base, cursor: "pointer", textAlign: "left", font: "inherit" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>{c.icon} {c.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <Thumb url={w.thumbnailUrl} name={w.adName} size={34} hasVideo={!!w.videoUrl} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111", lineHeight: 1 }}>{c.fmt(w.value)}</div>
                <div style={{ fontSize: 11, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{w.adName}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// "vs account average" delta pill. Green/red by direction; "—" when no benchmark.
function Delta({ value, benchmark, higherBetter }) {
  if (value == null || benchmark == null || !(benchmark > 0)) {
    return <span style={{ fontSize: 12, color: muted }}>vs average: —</span>;
  }
  const pct = (value / benchmark - 1) * 100;
  const good = higherBetter ? pct > 0 : pct < 0;
  const neutral = Math.abs(pct) < 0.5;
  const color = neutral ? muted : good ? "#15803D" : "#B91C1C";
  const bg = neutral ? "#F2EFE9" : good ? "#F0F8F1" : "#FDF3F2";
  const arrow = neutral ? "·" : pct > 0 ? "▲" : "▼";
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, background: bg, borderRadius: 7, padding: "3px 9px" }}>
      {arrow} {Math.abs(pct).toFixed(0)}% vs account average
    </span>
  );
}

// ── Auto-insights box ("leituras automáticas") ──
// Rule-based diagnoses (Portuguese), already computed server-side per ad.
function InsightsBox({ insights }) {
  const list = insights || [];
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0 }}>💡 Automatic insights</p>
        <span style={{ fontSize: 11, color: muted }}>based on period averages</span>
      </div>
      {list.length ? (
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((d) => (
            <li key={d.code} style={{ display: "flex", gap: 8, fontSize: 13, color: "#333", lineHeight: 1.5 }}>
              <span style={{ color: GOLD, flexShrink: 0 }}>›</span>
              <span>{d.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 12, color: muted, margin: "10px 0 0" }}>No unusual signals for this ad.</p>
      )}
    </div>
  );
}

// ── Top-performer modal ──
// Opened from a top-performer card. Large media, the winning metric with its
// "vs account average" delta, the full stat grid, retention curve and automatic
// insights — all reusing the detail-panel pieces. "Show in table" closes and
// selects/scrolls the row; Esc / click-outside close (via Modal).
function AdModal({ ad, perfCard, metricValue, benchmark, onClose, onShowInTable }) {
  return (
    <Modal onClose={onClose} maxWidth={620}>
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.adName}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: muted, fontSize: 15, flexShrink: 0, lineHeight: 1 }} aria-label="Close">✕</button>
        </div>

        <AdMedia ad={ad} maxHeight={260} />

        {/* Winning metric highlight */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "14px 0", padding: "12px 14px", background: "#FBF8F1", border: "1px solid #EADFC2", borderRadius: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.4px" }}>{perfCard.icon} {perfCard.metricLabel}</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: "#111", letterSpacing: "-1px", lineHeight: 1 }}>{perfCard.fmt(metricValue)}</span>
          <Delta value={metricValue} benchmark={benchmark} higherBetter={perfCard.higherBetter} />
        </div>

        <div style={{ ...card, padding: "14px 16px", marginBottom: 12 }}><MiniStats ad={ad} wide /></div>
        <div style={{ marginBottom: 12 }}><InsightsBox insights={ad.insights} /></div>
        <Panel title="Video retention" sub="% of plays still watching">
          <RetentionChart ads={[{ adName: ad.adName, retention: ad.retention, color: GOLD }]} />
        </Panel>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #F0EEE8", padding: "12px 16px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => onShowInTable(ad.adId)} style={{ border: "none", background: GOLD, color: "white", cursor: "pointer", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600 }}>
          Show in table
        </button>
      </div>
    </Modal>
  );
}

// ── Column legend modal ──
function LegendModal({ onClose }) {
  return (
    <Modal onClose={onClose} maxWidth={520}>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", margin: 0 }}>What the columns mean</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: muted, fontSize: 15, lineHeight: 1 }} aria-label="Close">✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LEGEND.map((l) => (
            <div key={l.key} style={{ display: "flex", gap: 10 }}>
              <span style={{ flexShrink: 0, width: 72, fontSize: 12, fontWeight: 700, color: "#111" }}>{l.label}</span>
              <span style={{ fontSize: 12.5, color: "#444", lineHeight: 1.5 }}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Retention curve (0 → 25 → 50 → 75 → 95 → 100 %, as % of plays) ──
function retentionSeries(retention) {
  if (!retention) return [];
  const pts = [
    ["0%", retention.p0], ["25%", retention.p25], ["50%", retention.p50],
    ["75%", retention.p75], ["95%", retention.p95], ["100%", retention.p100],
  ];
  return pts.map(([mark, v]) => ({ mark, pct: v == null ? null : Math.round(v * 1000) / 10 }));
}

function RetentionChart({ ads }) {
  // ads: [{ adName, retention, color }]
  const data = useMemo(() => {
    const marks = ["0%", "25%", "50%", "75%", "95%", "100%"];
    return marks.map((mark, i) => {
      const row = { mark };
      ads.forEach((a, idx) => {
        const s = retentionSeries(a.retention)[i];
        row[`a${idx}`] = s ? s.pct : null;
      });
      return row;
    });
  }, [ads]);
  const hasAny = ads.some((a) => a.retention && a.retention.plays > 0);
  if (!hasAny) return <Empty note="No video retention data for this ad." />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
        <XAxis dataKey="mark" tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
        <Tooltip formatter={(v) => (v == null ? "—" : `${v}%`)} />
        {ads.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {ads.map((a, idx) => (
          <Line key={idx} type="monotone" dataKey={`a${idx}`} name={a.adName} stroke={a.color || GOLD}
            strokeWidth={2.5} dot={{ r: 3, fill: a.color || GOLD, strokeWidth: 0 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function HourHistogram({ hours }) {
  const data = (hours || []).map((h) => ({ hour: `${String(h.hour).padStart(2, "0")}h`, impressions: h.impressions, leads: h.leads }));
  const hasAny = data.some((d) => d.impressions > 0 || d.leads > 0);
  if (!hasAny) return <Empty note="No hourly data." />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#AAA" }} tickLine={false} axisLine={false} interval={2} />
        <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Bar yAxisId="l" dataKey="impressions" name="Impressions" fill="#E7DFCB" radius={[3, 3, 0, 0]} />
        <Line yAxisId="r" type="monotone" dataKey="leads" name="Leads" stroke={GOLD} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function DailyChart({ daily }) {
  const data = (daily || []).map((d) => ({ date: d.date.slice(5), spend: d.spend, leads: d.leads }));
  if (!data.length) return <Empty note="No daily data." />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#AAA" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip formatter={(v, n) => (n === "Spend" ? fmtEur(v) : v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="l" dataKey="spend" name="Spend" fill="#E7DFCB" radius={[3, 3, 0, 0]} />
        <Line yAxisId="r" type="monotone" dataKey="leads" name="Leads" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD, strokeWidth: 0 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PlatformSplit({ platforms }) {
  const rows = useMemo(() => {
    // Collapse to publisher_platform · position, sort by spend desc.
    const m = new Map();
    for (const p of platforms || []) {
      const key = `${p.platform} · ${p.position}`;
      if (!m.has(key)) m.set(key, { key, spend: 0, impressions: 0, leads: 0 });
      const e = m.get(key);
      e.spend += p.spend; e.impressions += p.impressions; e.leads += p.leads;
    }
    return [...m.values()].sort((a, b) => b.spend - a.spend);
  }, [platforms]);
  if (!rows.length) return <Empty note="No placement data." />;
  const max = Math.max(...rows.map((r) => r.spend), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: "#333", textTransform: "capitalize" }}>{r.key}</span>
            <span style={{ color: muted }}>{fmtEur(r.spend)} · {fmtNum(r.leads)} leads</span>
          </div>
          <div style={{ height: 7, background: "#F2EFE9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(r.spend / max) * 100}%`, height: "100%", background: GOLD, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ note }) {
  return <div style={{ padding: "24px 0", textAlign: "center", color: "#BBB", fontSize: 12 }}>{note}</div>;
}

function Panel({ title, sub, children }) {
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0 }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: muted, margin: "2px 0 0" }}>{sub}</p>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

// Compact funnel: impressions → 3s plays → thruplays → leads.
function Funnel({ ad }) {
  const steps = [
    ["Impressions", ad.impressions],
    ["3s plays", ad.threeSecPlays],
    ["ThruPlays", ad.thruPlays],
    ["Leads", ad.leads],
  ];
  const top = Math.max(ad.impressions, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {steps.map(([label, v]) => (
        <div key={label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: "#333" }}>{label}</span>
            <span style={{ color: muted }}>{fmtNum(v)}</span>
          </div>
          <div style={{ height: 7, background: "#F2EFE9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${Math.max((v / top) * 100, v > 0 ? 2 : 0)}%`, height: "100%", background: GOLD, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const COMPARE_COLORS = [GOLD, "#6366F1"];

export default function AdsTab() {
  const isMobile = useIsMobile();
  const [range, setRange] = useState("7d");
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [sort, setSort] = useState({ key: "spend", dir: "desc" });
  const [selectedId, setSelectedId] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [perfModalKey, setPerfModalKey] = useState(null); // open top-performer modal (PERF_CARDS key)
  const [legendOpen, setLegendOpen] = useState(false);

  const load = useCallback((preset, { force = false } = {}) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    getAdsInsights(preset, { force })
      .then((data) => {
        // Success only when the assembled payload is actually present (ok + totals).
        // Anything else — a handled {ok:false} error, or a non-JSON 200 that fell
        // back to {} (e.g. an SPA/CDN catch-all) — surfaces the error card, never a
        // blank screen.
        if (data && data.ok && data.totals) {
          setState({ loading: false, error: null, data });
        } else {
          setState({ loading: false, error: (data && data.error) || "Couldn't load ads — unexpected response.", data: null });
        }
      })
      .catch((e) => setState({ loading: false, error: e.message || "Couldn't load ads.", data: null }));
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const ads = useMemo(() => state.data?.ads || [], [state.data]);
  const totals = state.data?.totals || null;
  const benchmarks = state.data?.benchmarks || null;

  const sortedAds = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[1];
    const getter = col.sortKey || col.get;
    const arr = [...ads].sort((a, b) => {
      const va = getter(a), vb = getter(b);
      if (col.text) return String(va || "").localeCompare(String(vb || ""));
      const na = va == null ? -Infinity : va;
      const nb = vb == null ? -Infinity : vb;
      return na - nb;
    });
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [ads, sort]);

  const selected = useMemo(() => ads.find((a) => a.adId === selectedId) || null, [ads, selectedId]);
  const compareAds = useMemo(() => compareIds.map((id) => ads.find((a) => a.adId === id)).filter(Boolean), [compareIds, ads]);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "adName" ? "asc" : "desc" }));
  };

  const onRowClick = (ad) => {
    if (compareMode) {
      setCompareIds((ids) => {
        if (ids.includes(ad.adId)) return ids.filter((x) => x !== ad.adId);
        if (ids.length >= 2) return [ids[1], ad.adId]; // keep last two
        return [...ids, ad.adId];
      });
    } else {
      setSelectedId((id) => (id === ad.adId ? null : ad.adId));
    }
  };

  const exitCompare = () => { setCompareMode(false); setCompareIds([]); };

  // Top-performer modal: resolve the card config + winner + full ad + benchmark.
  const perfModal = useMemo(() => {
    if (!perfModalKey || !state.data) return null;
    const perfCard = PERF_CARDS.find((c) => c.key === perfModalKey);
    const winner = state.data.topPerformers?.[perfModalKey];
    if (!perfCard || !winner) return null;
    const ad = ads.find((a) => a.adId === winner.adId);
    if (!ad) return null;
    return { perfCard, ad, metricValue: winner.value, benchmark: perfCard.bench(benchmarks, totals) };
  }, [perfModalKey, state.data, ads, benchmarks, totals]);

  // "Show in table": close the modal, select the row, scroll it into view.
  const showInTable = (adId) => {
    setPerfModalKey(null);
    setSelectedId(adId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`adrow-${adId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <div>
      {/* Header: range selector + compare toggle + refresh */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 6, background: "#F2EFE9", padding: 4, borderRadius: 12 }}>
          {RANGES.map(([key, label]) => (
            <button key={key} onClick={() => setRange(key)} style={{
              border: "none", cursor: "pointer", borderRadius: 9, padding: "7px 13px",
              fontSize: 13, fontWeight: 600,
              background: range === key ? "white" : "transparent",
              color: range === key ? "#111" : muted,
              boxShadow: range === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {state.data?.cachedAt && (
            <span style={{ fontSize: 11, color: "#BBB" }}>
              Updated {new Date(state.data.cachedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={() => { exitCompare(); setSelectedId(null); load(range, { force: true }); }} title="Refresh now (bypass 15-min cache)"
            style={{ border: "1px solid #E5E0D6", background: "white", cursor: "pointer", borderRadius: 10, padding: "7px 12px", fontSize: 13, color: "#555", fontWeight: 600 }}>
            ↻ Refresh
          </button>
          <button onClick={() => (compareMode ? exitCompare() : setCompareMode(true))} style={{
            border: "1px solid " + (compareMode ? GOLD : "#E5E0D6"), cursor: "pointer", borderRadius: 10,
            padding: "7px 13px", fontSize: 13, fontWeight: 600,
            background: compareMode ? GOLD : "white", color: compareMode ? "white" : "#555",
          }}>{compareMode ? "Exit compare" : "Compare"}</button>
        </div>
      </div>

      {compareMode && (
        <div style={{ ...card, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: muted, background: "#FBF8F1", borderColor: "#EADFC2" }}>
          Pick up to 2 ads in the table to compare their funnels and retention curves side by side.
          {compareIds.length > 0 && <span style={{ marginLeft: 6, color: "#111", fontWeight: 600 }}>{compareIds.length} selected</span>}
        </div>
      )}

      {/* Loading / error */}
      {state.loading && <div style={{ ...card, padding: 40, textAlign: "center", color: muted, fontSize: 14 }}>Loading ads…</div>}

      {!state.loading && state.error && (
        <div style={{ ...card, padding: "22px 24px", borderColor: "#F3D9D9", background: "#FEF6F6" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#B91C1C" }}>Couldn't load ads</p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8A5656" }}>{state.error}</p>
          <button onClick={() => load(range, { force: true })} style={{ marginTop: 12, border: "none", background: "#B91C1C", color: "white", cursor: "pointer", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>Try again</button>
        </div>
      )}

      {!state.loading && !state.error && totals && (
        <>
          {/* Top cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Spend" value={fmtEur(totals.spend)} sub={`${totals.ads} active ads`} />
            <StatCard label="Leads" value={fmtNum(totals.leads)} sub={`${fmtNum(totals.qualified)} qualified`} />
            <StatCard label="Cost / lead" value={fmtCost(totals.cpl)} sub={totals.costPerQualified != null ? `${fmtCost(totals.costPerQualified)} / qualified` : "—"} />
            <StatCard label="CTR" value={fmtPct(totals.ctr)} sub={`${fmtNum(totals.clicks)} link clicks`} />
          </div>

          {/* Top performers strip ("quadro de honra") — click a card to select */}
          {!compareMode && <TopPerformers performers={state.data?.topPerformers} onOpen={setPerfModalKey} />}

          {/* Compare view */}
          {compareMode && compareAds.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${compareAds.length}, 1fr)`, gap: 12, marginBottom: 12 }}>
                {compareAds.map((ad, i) => (
                  <div key={ad.adId} style={{ ...card, padding: "14px 16px", borderTop: `3px solid ${COMPARE_COLORS[i]}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 10px", minWidth: 0 }}>
                      <Thumb url={ad.thumbnailUrl} name={ad.adName} size={40} radius={9} hasVideo={!!ad.videoUrl} />
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.adName}</p>
                    </div>
                    {ad.videoUrl && <div style={{ marginBottom: 10 }}><AdMedia ad={ad} maxHeight={150} /></div>}
                    <MiniStats ad={ad} />
                    <div style={{ marginTop: 12 }}><Funnel ad={ad} /></div>
                  </div>
                ))}
              </div>
              <Panel title="Retention curves" sub="% of video plays still watching at each mark">
                <RetentionChart ads={compareAds.map((a, i) => ({ adName: a.adName, retention: a.retention, color: COMPARE_COLORS[i] }))} />
              </Panel>
            </div>
          )}

          {/* Main table */}
          <div style={{ ...card, marginBottom: 18, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px 0" }}>
              <button onClick={() => setLegendOpen(true)} title="What the columns mean" style={{ border: "1px solid #E5E0D6", background: "white", cursor: "pointer", borderRadius: 9, padding: "5px 11px", fontSize: 12, color: "#555", fontWeight: 600 }}>
                ⓘ Legend
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key} title={LEGEND_TEXT[c.key] || c.title || ""} onClick={() => toggleSort(c.key)}
                        style={{ ...th, textAlign: c.align || "right" }}>
                        {c.label}{sort.key === c.key ? (sort.dir === "desc" ? " ▾" : " ▴") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAds.map((ad, i) => {
                    const isSel = compareMode ? compareIds.includes(ad.adId) : ad.adId === selectedId;
                    return (
                      <tr key={ad.adId} id={`adrow-${ad.adId}`} onClick={() => onRowClick(ad)} style={{
                        cursor: "pointer", borderTop: i === 0 ? "none" : "1px solid #F3F1EC",
                        background: isSel ? "#FBF6EA" : "transparent",
                      }}
                        onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#FAFAFA"; }}
                        onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                        {COLUMNS.map((c) => {
                          // Subtle vs-period-average tint on rate/cost cells (skipped on
                          // selected rows so the cream highlight stays legible).
                          const tint = (!isSel && c.bench && benchmarks) ? tintBg(c.get(ad), benchmarks[c.bench], c.higherBetter) : undefined;
                          return (
                            <td key={c.key} style={{ ...td, textAlign: c.align || "right", background: tint, maxWidth: c.key === "adName" ? 240 : undefined, overflow: c.key === "adName" ? "hidden" : undefined, textOverflow: c.key === "adName" ? "ellipsis" : undefined }}>
                              {c.chips ? <ClassChips byClass={ad.byClass} />
                                : c.key === "adName" ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 9, maxWidth: "100%" }}>
                                    <Thumb url={ad.thumbnailUrl} name={ad.adName} size={30} hasVideo={!!ad.videoUrl} />
                                    <span style={{ fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ad.adName}>{ad.adName || "—"}</span>
                                  </span>
                                )
                                : c.fmt(c.get(ad))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {!sortedAds.length && (
                    <tr><td colSpan={COLUMNS.length} style={{ ...td, textAlign: "center", color: "#BBB", padding: 28 }}>No ads with spend in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail panel for the selected ad (single-select mode) */}
          {!compareMode && selected && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <Thumb url={selected.thumbnailUrl} name={selected.adName} size={52} radius={10} hasVideo={!!selected.videoUrl} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.adName}</h3>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ border: "none", background: "none", cursor: "pointer", color: muted, fontSize: 13, flexShrink: 0 }}>Close ✕</button>
              </div>
              {/* Playable creative when the ad is a video (poster = thumbnail). */}
              {selected.videoUrl && (
                <div style={{ ...card, padding: 10, marginBottom: 12, maxWidth: 440 }}><AdMedia ad={selected} maxHeight={240} /></div>
              )}
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...card, padding: "14px 16px" }}><MiniStats ad={selected} wide /></div>
              </div>
              {/* Automatic insights — the "why" layer */}
              <div style={{ marginBottom: 12 }}><InsightsBox insights={selected.insights} /></div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <Panel title="Video retention" sub="% of plays still watching"><RetentionChart ads={[{ adName: selected.adName, retention: selected.retention, color: GOLD }]} /></Panel>
                <Panel title="Placements" sub="Spend & leads by platform · position"><PlatformSplit platforms={selected.platforms} /></Panel>
                <Panel title="Hour of day" sub="Impressions (bars) vs leads (line), advertiser time zone"><HourHistogram hours={selected.hours} /></Panel>
                <Panel title="Daily spend vs leads"><DailyChart daily={selected.daily} /></Panel>
              </div>
            </div>
          )}

          {/* Lead-only ads (produced leads but no spend in the period) */}
          {state.data?.unmatchedLeadAds?.length > 0 && (
            <div style={{ ...card, padding: "14px 18px", marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: "0 0 4px" }}>Leads from ads with no spend in this period</p>
              <p style={{ fontSize: 11, color: muted, margin: "0 0 10px" }}>These ad names appear on our leads but have no active-spend row in the selected range (paused/older creatives).</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {state.data.unmatchedLeadAds.slice(0, 20).map((u) => (
                  <span key={u.adName} style={{ fontSize: 12, color: "#555", background: "#F6F4EF", border: "1px solid #ECE7DC", borderRadius: 8, padding: "4px 9px" }}>
                    {u.adName} · <strong>{u.leads}</strong> leads{u.qualified ? ` · ${u.qualified} qual.` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Overlays */}
      {perfModal && (
        <AdModal
          ad={perfModal.ad}
          perfCard={perfModal.perfCard}
          metricValue={perfModal.metricValue}
          benchmark={perfModal.benchmark}
          onClose={() => setPerfModalKey(null)}
          onShowInTable={showInTable}
        />
      )}
      {legendOpen && <LegendModal onClose={() => setLegendOpen(false)} />}
    </div>
  );
}

// Inline key metrics used in detail + compare cards.
function MiniStats({ ad, wide }) {
  const items = [
    ["Spend", fmtEur(ad.spend)],
    ["Hook", fmtPct(ad.hookRate)],
    ["Hold", fmtPct(ad.holdRate)],
    ["Avg watch", fmtSec(ad.avgWatchTime)],
    ["CTR", fmtPct(ad.ctr)],
    ["Leads", fmtNum(ad.leads)],
    ["CPL", fmtCost(ad.cpl)],
    ["Qualified", fmtNum(ad.qualified)],
    ["€ / qual.", fmtCost(ad.costPerQualified)],
    ["€ / A-lead", fmtCost(ad.costPerA)],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${wide ? 90 : 80}px, 1fr))`, gap: 10 }}>
      {items.map(([label, value]) => (
        <div key={label}>
          <p style={{ fontSize: 10, color: muted, textTransform: "uppercase", letterSpacing: "0.4px", margin: "0 0 3px", fontWeight: 600 }}>{label}</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#111", margin: 0 }}>{value}</p>
        </div>
      ))}
    </div>
  );
}
