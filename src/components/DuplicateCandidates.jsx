import { useState } from "react";
import { t } from "../labels";
import { leadWhen, leadTime, cleanField } from "../utils";

// Highlighted drawer panel: "possible duplicate of {name} — {source} — {date}"
// with a Merge action, one card per detected candidate. The user picks which
// record is PRIMARY (default: the oldest — it usually holds the earliest notes/
// status); merging creates a reversible link (source records are never changed).

const matchedText = (on) =>
  (on || [])
    .map((k) => (k === "phone" ? t("dup_matched_phone") : t("dup_matched_email")))
    .join(" · ");

function CandidateRow({ self, candidate, onMerge, isLast }) {
  const other = candidate.lead;
  // Default primary = the older of the two records.
  const [primaryIsSelf, setPrimaryIsSelf] = useState(leadTime(self) <= leadTime(other));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const primaryLead = primaryIsSelf ? self : other;
  const secondaryLead = primaryIsSelf ? other : self;

  const merge = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await onMerge(String(primaryLead.id), String(secondaryLead.id));
    if (!r?.ok) {
      setError(t("dup_merge_failed"));
      setBusy(false);
    }
    // On success the links change and this panel re-renders away — no reset needed.
  };

  return (
    <div style={{ paddingTop: 10, marginTop: 10, borderTop: isLast ? "none" : undefined, borderBottom: isLast ? "none" : "1px dashed #EAD9B0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#7A5A12" }}>{t("dup_of")}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#5A430D" }}>{other.name || cleanField(other.email) || "—"}</span>
      </div>
      <div style={{ fontSize: 12, color: "#8A6D2F", margin: "2px 0 8px" }}>
        {cleanField(other.source)} · {leadWhen(other)} · <em>{matchedText(candidate.on)}</em>
      </div>

      {/* Primary chooser (default oldest) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#7A5A12" }}>{t("dup_primary_label")}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#5A430D" }}>
          {(primaryLead.name || cleanField(primaryLead.email) || "—")} · {cleanField(primaryLead.source)}
        </span>
        <button
          type="button"
          onClick={() => setPrimaryIsSelf((v) => !v)}
          disabled={busy}
          style={{ background: "none", border: "none", padding: 0, cursor: busy ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: "#8A6D2F", textDecoration: "underline" }}
        >
          {t("dup_switch_primary")}
        </button>
      </div>

      <button
        type="button"
        onClick={merge}
        disabled={busy}
        style={{
          background: "#8A6D2F", color: "white", border: "none", borderRadius: 9,
          padding: "8px 16px", fontSize: 13, fontWeight: 600,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? t("dup_merging") : t("dup_merge")}
      </button>
      {error && <p style={{ fontSize: 12, color: "#BE123C", margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}

export default function DuplicateCandidates({ self, candidates, onMerge }) {
  if (!candidates || !candidates.length) return null;
  return (
    <div style={{ background: "#FDF7E8", border: "1px solid #EAD9B0", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#C2871F", fontWeight: 700 }}>⧉</span>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#5A430D", margin: 0 }}>
          {t("dup_title")}{candidates.length > 1 ? ` (${candidates.length})` : ""}
        </p>
      </div>
      {candidates.map((c, i) => (
        <CandidateRow
          key={String(c.lead.id)}
          self={self}
          candidate={c}
          onMerge={onMerge}
          isLast={i === candidates.length - 1}
        />
      ))}
      <p style={{ fontSize: 11, color: "#9A7C3A", margin: "10px 0 0", lineHeight: 1.5 }}>{t("dup_primary_hint")}</p>
    </div>
  );
}
