import { useState } from "react";
import { GOLD } from "../constants";
import { t } from "../labels";
import { cleanField, leadWhen, sourceCampaignLabel } from "../utils";

// Drawer section for a merged primary: source/campaign chips for every record the
// person came through, then a "Merged records" list with a per-record Unmerge
// (deletes the link — the record reappears independently; nothing is destroyed).

const chip = {
  fontSize: 11, fontWeight: 600, color: "#8A6D2F", background: GOLD + "22",
  borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap",
};
const heading = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" };

function UnmergeRow({ entry, onUnmerge, isLast }) {
  const lead = entry.lead;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unmerge = async () => {
    if (busy) return;
    if (!entry.linkId) return;
    if (!window.confirm(t("merged_unmerge_confirm"))) return;
    setBusy(true);
    setError("");
    const r = await onUnmerge(String(entry.linkId));
    if (!r?.ok) { setError(t("merged_unmerge_failed")); setBusy(false); }
    // On success the links change → this row re-renders away.
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: isLast ? "none" : "1px solid #F0F0F0" }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lead.name || cleanField(lead.email) || "—"}
        </p>
        <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cleanField(lead.source)} · {leadWhen(lead)}
        </p>
        {error && <p style={{ fontSize: 11, color: "#BE123C", margin: "3px 0 0" }}>{error}</p>}
      </div>
      <button
        type="button"
        onClick={unmerge}
        disabled={busy || !entry.linkId}
        style={{
          flexShrink: 0, background: "white", color: "#8A6D2F", border: "1px solid #EAD9B0",
          borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? t("merged_unmerging") : t("merged_unmerge")}
      </button>
    </div>
  );
}

export default function MergedRecords({ primary, secondaries, onUnmerge }) {
  if (!secondaries || !secondaries.length) return null;

  // Distinct source/campaign chips across every record (primary first).
  const seen = new Set();
  const chips = [];
  for (const l of [primary, ...secondaries.map((s) => s.lead)]) {
    const label = sourceCampaignLabel(cleanField(l.source)) || cleanField(l.source);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    chips.push(label);
  }

  return (
    <div style={{ background: "#FBF9F4", border: "1px solid #EDE7DA", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: GOLD }}>🔗</span>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#5A430D", margin: 0 }}>
          {t("merged_title")} ({secondaries.length + 1})
        </p>
      </div>

      <p style={heading}>{t("merged_sources")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {chips.map((c) => <span key={c} style={chip}>{c}</span>)}
      </div>

      <div>
        {secondaries.map((entry, i) => (
          <UnmergeRow key={String(entry.lead.id)} entry={entry} onUnmerge={onUnmerge} isLast={i === secondaries.length - 1} />
        ))}
      </div>
    </div>
  );
}
