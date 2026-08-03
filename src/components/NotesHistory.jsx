import { useMemo, useState } from "react";
import { branding } from "../config";
import { t } from "../labels";
import {
  parseNotes, serializeNotes, appendNote, editEntryAt, deleteEntryAt, formatStampDisplay,
} from "../notesFormat";

// Timestamped, append-only notes history for the LeadDrawer. Reads/writes the
// single `manual_notes` text value via `onChange` (which persists through the
// drawer's existing PATCH flow) — no storage/schema change. Newest entry shows
// first; entries are editable and deletable in place.

const label = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" };
const areaStyle = {
  width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10,
  padding: "10px 12px", fontSize: 13, color: "#111", resize: "none", outline: "none",
  lineHeight: 1.6, fontFamily: "inherit",
};
const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 };

export default function NotesHistory({ value, onChange, busy }) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editDraft, setEditDraft] = useState("");

  // Canonical (chronological) order; displayed newest-first below.
  const entries = useMemo(() => parseNotes(value), [value]);
  const view = useMemo(() => entries.map((e, i) => ({ e, i })).reverse(), [entries]);

  const addNote = () => {
    if (busy || !draft.trim()) return;
    onChange(appendNote(value, draft));
    setDraft("");
  };
  const startEdit = (i) => { setEditingIndex(i); setEditDraft(entries[i].text); };
  const cancelEdit = () => { setEditingIndex(-1); setEditDraft(""); };
  const saveEdit = (i) => {
    if (!editDraft.trim()) return;
    onChange(serializeNotes(editEntryAt(entries, i, editDraft)));
    cancelEdit();
  };
  const removeAt = (i) => {
    if (busy) return;
    if (!window.confirm(t("notes_delete_confirm"))) return;
    if (editingIndex === i) cancelEdit();
    onChange(serializeNotes(deleteEntryAt(entries, i)));
  };

  const brand = branding.primaryColor || "#111";

  return (
    <div>
      <p style={label}>{t("notes_title")}</p>

      {/* Add a new note */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: entries.length ? 16 : 0 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("notes_placeholder")}
          rows={3}
          style={areaStyle}
        />
        <button
          type="button"
          onClick={addNote}
          disabled={busy || !draft.trim()}
          style={{
            alignSelf: "flex-start", background: brand, color: "white", border: "none",
            borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600,
            cursor: busy || !draft.trim() ? "not-allowed" : "pointer",
            opacity: busy || !draft.trim() ? 0.5 : 1,
          }}
        >
          {t("notes_add")}
        </button>
      </div>

      {/* History (newest first) */}
      {view.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {view.map(({ e, i }) => (
            <div key={`${e.stamp || "nd"}-${i}`} style={{ background: "#F8F7F4", border: "1px solid #F0F0F0", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#888" }}>
                  {e.dated ? formatStampDisplay(e.stamp) : t("notes_no_date")}
                  {e.edited && <span style={{ color: "#AAA" }}> · {t("notes_edited")}</span>}
                </span>
                {editingIndex !== i && (
                  <span style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                    <button type="button" title={t("notes_edit")} aria-label={t("notes_edit")} onClick={() => startEdit(i)} style={{ ...linkBtn, color: "#8A6D2F" }}>✏️</button>
                    <button type="button" title={t("notes_delete")} aria-label={t("notes_delete")} onClick={() => removeAt(i)} style={{ ...linkBtn, color: "#DC2626" }}>🗑</button>
                  </span>
                )}
              </div>

              {editingIndex === i ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={editDraft}
                    onChange={(ev) => setEditDraft(ev.target.value)}
                    rows={3}
                    autoFocus
                    style={{ ...areaStyle, background: "white" }}
                  />
                  <div style={{ display: "flex", gap: 16 }}>
                    <button type="button" onClick={() => saveEdit(i)} disabled={!editDraft.trim()} style={{ ...linkBtn, color: "#8A6D2F", opacity: editDraft.trim() ? 1 : 0.5, cursor: editDraft.trim() ? "pointer" : "not-allowed" }}>{t("notes_save")}</button>
                    <button type="button" onClick={cancelEdit} style={{ ...linkBtn, color: "#888" }}>{t("notes_cancel")}</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "#111", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{e.text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
