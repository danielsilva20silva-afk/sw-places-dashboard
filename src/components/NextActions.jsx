import { useState } from "react";
import { t } from "../labels";
import { sortByDue } from "../actions";
import DueBadge from "./DueBadge";

// "Next action" section for the LeadDrawer. Lists the lead's pending actions
// (complete / edit / delete), a "+ New action" form, and a subtle nudge when
// there are none. Completing an action is handled by the parent (marks done AND
// appends a "✓ {title}" entry to the notes history).

const pad = (n) => String(n).padStart(2, "0");
const localDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1); // tomorrow
  return localDateStr(d);
}
function splitLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: defaultDate(), time: "10:00" };
  return { date: localDateStr(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
function buildDueAt(date, time) {
  const d = new Date(`${date}T${time || "10:00"}`);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

const label = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" };
const input = { width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#111", background: "white", outline: "none", fontFamily: "inherit" };
const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 };

function ActionForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [date, setDate] = useState(initial?.date || defaultDate());
  const [time, setTime] = useState(initial?.time || "10:00");
  const [description, setDescription] = useState(initial?.description || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) { setErr(t("na_field_title")); return; }
    const due_at = buildDueAt(date, time);
    if (!due_at) { setErr(t("na_field_date")); return; }
    setBusy(true); setErr("");
    const r = await onSubmit({ title: title.trim(), description: description.trim(), due_at });
    if (!r?.ok) { setBusy(false); setErr(r?.error || t("na_error")); }
    // On success the parent updates its state and this form unmounts.
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#FAFAF9", border: "1px solid #F0F0F0", borderRadius: 10, padding: 12 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("na_title_ph")} autoFocus style={input} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("na_field_date")} style={input} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("na_field_time")} style={input} />
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("na_field_desc")} rows={2} style={{ ...input, resize: "vertical" }} />
      {err && <p style={{ fontSize: 11, color: "#BE123C", margin: 0 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={submit} disabled={busy || !title.trim()} style={{ background: "#111", color: "white", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: busy || !title.trim() ? "not-allowed" : "pointer", opacity: busy || !title.trim() ? 0.5 : 1 }}>
          {busy ? t("na_creating") : submitLabel}
        </button>
        <button type="button" onClick={onCancel} style={{ ...linkBtn, color: "#888", padding: "8px 6px" }}>{t("na_cancel")}</button>
      </div>
    </div>
  );
}

function ActionRow({ action, onComplete, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ActionForm
        initial={{ title: action.title, description: action.description, ...splitLocal(action.due_at) }}
        submitLabel={t("na_save")}
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#FAFAF9", border: "1px solid #F0F0F0", borderRadius: 10, padding: "10px 12px" }}>
      <input type="checkbox" checked={false} onChange={() => onComplete(action)} title={t("na_complete")} aria-label={t("na_complete")} style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", accentColor: "#16A34A", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, wordBreak: "break-word" }}>{action.title}</p>
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
  const pending = [...(actions || [])].sort(sortByDue);

  return (
    <div>
      <p style={label}>{t("na_title")}</p>

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
          onCancel={() => setAdding(false)}
          onSubmit={async (fields) => {
            const r = await onCreate(fields);
            if (r?.ok) setAdding(false);
            return r;
          }}
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
