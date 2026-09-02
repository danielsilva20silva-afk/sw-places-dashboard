import { useMemo, useState } from "react";
import { branding } from "../config";
import { t } from "../labels";
import { cleanField, sourceCampaignLabel } from "../utils";
import { parseNotes, formatStampDisplay } from "../notesFormat";

// Combined, read-only notes history for a MERGED lead: every note entry from the
// primary and each secondary record, tagged with its origin and interleaved by
// timestamp (newest first). New notes are added to the PRIMARY only (writes never
// touch secondary records) via onAppend. Per-entry edit/delete is intentionally
// not offered in merged view — unmerge to edit a specific record's notes.

const label = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" };
const areaStyle = {
  width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10,
  padding: "10px 12px", fontSize: 13, color: "#111", resize: "none", outline: "none",
  lineHeight: 1.6, fontFamily: "inherit",
};

// "DD/MM/YYYY HH:mm" (Lisbon wall-clock) → epoch ms for sorting. Undated → -Inf
// so legacy undated notes sink to the bottom of a newest-first list.
function stampToMs(stamp) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(stamp || "");
  if (!m) return -Infinity;
  const [, dd, mo, yyyy, hh, mi] = m;
  return Date.UTC(+yyyy, +mo - 1, +dd, +hh, +mi);
}

export default function MergedNotes({ primaryNotes, secondaries, onAppend, busy }) {
  const [draft, setDraft] = useState("");

  const entries = useMemo(() => {
    const out = [];
    const collect = (raw, origin, isPrimary) => {
      for (const e of parseNotes(raw)) out.push({ ...e, origin, isPrimary });
    };
    collect(primaryNotes, t("merged_note_primary"), true);
    for (const sec of secondaries || []) {
      const origin = sourceCampaignLabel(cleanField(sec.source)) || cleanField(sec.source) || "—";
      collect(sec.manual_notes, origin, false);
    }
    // Newest first; stable within equal timestamps.
    return out
      .map((e, i) => ({ e, i, k: stampToMs(e.stamp) }))
      .sort((a, b) => (b.k - a.k) || (a.i - b.i))
      .map((x) => x.e);
  }, [primaryNotes, secondaries]);

  const brand = branding.primaryColor || "#111";
  const addNote = () => {
    if (busy || !draft.trim()) return;
    onAppend(draft);
    setDraft("");
  };

  return (
    <div>
      <p style={label}>{t("merged_notes_title")}</p>

      {/* Add a new note (saved to the primary record) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: entries.length ? 16 : 0 }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("notes_placeholder")} rows={3} style={areaStyle} />
        <button
          type="button"
          onClick={addNote}
          disabled={busy || !draft.trim()}
          style={{
            alignSelf: "flex-start", background: brand, color: "white", border: "none",
            borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600,
            cursor: busy || !draft.trim() ? "not-allowed" : "pointer", opacity: busy || !draft.trim() ? 0.5 : 1,
          }}
        >
          {t("notes_add")}
        </button>
      </div>

      {/* Combined history (newest first), each entry tagged with its origin */}
      {entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e, i) => (
            <div key={`${e.stamp || "nd"}-${i}`} style={{ background: "#F8F7F4", border: "1px solid #F0F0F0", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#888" }}>
                  {e.dated ? formatStampDisplay(e.stamp) : t("notes_no_date")}
                  {e.edited && <span style={{ color: "#AAA" }}> · {t("notes_edited")}</span>}
                </span>
                <span
                  title={e.origin}
                  style={{
                    flexShrink: 0, fontSize: 10, fontWeight: 600, borderRadius: 5, padding: "1px 6px",
                    maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: e.isPrimary ? "#8A6D2F" : "#666",
                    background: e.isPrimary ? "#EFE4C6" : "#ECECEC",
                  }}
                >
                  {e.origin}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#111", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{e.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
