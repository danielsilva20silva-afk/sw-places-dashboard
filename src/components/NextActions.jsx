import { useState } from "react";
import { t } from "../labels";
import { sortByDue, splitLocal } from "../actions";
import DueBadge from "./DueBadge";
import ActionForm from "./ActionForm";

// "Next action" section for the LeadDrawer. Lists the lead's pending actions
// (complete / edit / delete), a "+ New action" form (with suggestion chips and an
// "Also add to calendar" option on create), and a subtle nudge when there are
// none. Completing an action is handled by the parent (marks done AND appends a
// "✓ {title}" entry to the notes history).

const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 };
const label = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" };

function ActionRow({ action, onComplete, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ActionForm
        initial={{ title: action.title, description: action.description, ...splitLocal(action.due_at) }}
        submitLabel={t("na_save")}
        showChips={false}
        onCancel={() => setEditing(false)}
        onSubmit={async (fields) => {
          const r = await onEdit(action.id, fields);
          if (r?.ok) setEditing(false);
          return r;
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 4, background: "#FAFAF9", border: "1px solid #F0F0F0", borderRadius: 10, padding: "10px 12px" }}>
      {/* Larger tap target on mobile: padding grows the hit area; negative margin
          keeps the visual layout unchanged. */}
      <label title={t("na_complete")} style={{ display: "inline-flex", padding: 8, margin: "-6px 2px -6px -6px", cursor: "pointer", flexShrink: 0 }}>
        <input type="checkbox" checked={false} onChange={() => onComplete(action)} aria-label={t("na_complete")} style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#16A34A" }} />
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, wordBreak: "break-word" }}>
          {action.title}
          {action.calendar_event_id && <span title={t("na_cal_indicator")} aria-label={t("na_cal_indicator")} style={{ marginLeft: 6, fontSize: 11 }}>📅</span>}
        </p>
        <div style={{ marginTop: 2 }}><DueBadge dueISO={action.due_at} /></div>
        {action.description && <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{action.description}</p>}
      </div>
      <span style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button type="button" title={t("na_edit")} aria-label={t("na_edit")} onClick={() => setEditing(true)} style={{ ...linkBtn, color: "#8A6D2F" }}>✏️</button>
        <button type="button" title={t("na_delete")} aria-label={t("na_delete")} onClick={() => onDelete(action.id)} style={{ ...linkBtn, color: "#DC2626" }}>🗑</button>
      </span>
    </div>
  );
}

export default function NextActions({ actions, onCreate, onComplete, onEdit, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(""); // e.g. "saved, but calendar not connected"
  const pending = [...(actions || [])].sort(sortByDue);

  // Wrap create to close the form and surface a non-blocking calendar notice.
  const handleCreate = async (fields) => {
    const r = await onCreate(fields);
    if (r?.ok) { setAdding(false); setNotice(r.calendarFailed ? t("na_cal_failed") : ""); }
    return r;
  };

  return (
    <div>
      <p style={label}>{t("na_title")}</p>

      {notice && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#92400E", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>⚠️ {notice}</span>
          <button type="button" onClick={() => setNotice("")} style={{ ...linkBtn, color: "#92400E" }} aria-label={t("na_cancel")}>×</button>
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {pending.map((a) => (
            <ActionRow key={a.id} action={a} onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}

      {adding ? (
        <ActionForm
          submitLabel={t("na_create")}
          showCalendarOption
          onCancel={() => setAdding(false)}
          onSubmit={handleCreate}
        />
      ) : pending.length > 0 ? (
        <button type="button" onClick={() => setAdding(true)} style={{ ...linkBtn, color: "#8A6D2F", fontSize: 13 }}>{t("na_add")}</button>
      ) : (
        // Subtle nudge when the lead has no pending action.
        <button type="button" onClick={() => setAdding(true)} style={{ width: "100%", textAlign: "left", background: "#FFFBEB", border: "1px dashed #FDE68A", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "#92400E", cursor: "pointer" }}>
          {t("na_none")}
        </button>
      )}
    </div>
  );
}
