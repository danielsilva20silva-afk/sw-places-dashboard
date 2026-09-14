import { useState } from "react";
import { t } from "../labels";

// Reusable create/edit form for lead actions AND general tasks. Shared by the
// LeadDrawer "Next action" section and the dashboard Actions cards so both get the
// same fields, suggestion chips and calendar option.
//
// onSubmit receives { title, description, due_at, datetime, addToCalendar, lead_id? }:
//   • due_at    — UTC ISO instant (what we store on the action row).
//   • datetime  — the raw "YYYY-MM-DDTHH:mm" wall-clock the user picked; passed
//                 straight to the calendar path, which treats it as Europe/Lisbon
//                 (browser TZ = working TZ), avoiding any UTC→Lisbon reconversion.
//   • addToCalendar — only meaningful when showCalendarOption is set (create).
//   • lead_id   — only included when allowLeadPick is set (the "+ Task" form): the
//                 picked lead's id, or null for a general task.

const pad = (n) => String(n).padStart(2, "0");
function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1); // tomorrow
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function buildDueAt(date, time) {
  const d = new Date(`${date}T${time || "10:00"}`);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// Suggestion chips: label key → fills the title. Convenience only; free typing stays.
const CHIPS = ["na_chip_call", "na_chip_viewing", "na_chip_properties", "na_chip_meeting"];

const input = { width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#111", background: "white", outline: "none", fontFamily: "inherit" };
const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 };

// Local, request-free lead search over already-loaded (active) leads by name/email.
function matchLeads(leads, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return (leads || [])
    .filter((l) => `${l.name || ""} ${l.email || ""}`.toLowerCase().includes(q))
    .slice(0, 8);
}

// Optional "Link to lead" search picker (only in the dashboard "+ Task" form).
function LeadPicker({ leads, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = matchLeads(leads, query);

  if (selected) {
    return (
      <div>
        <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 5px" }}>{t("na_link_lead")}</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #E5E5E5", borderRadius: 999, padding: "6px 8px 6px 12px", fontSize: 13, color: "#111" }}>
          <span style={{ fontWeight: 600 }}>{selected.name || selected.email || "—"}</span>
          <button type="button" onClick={() => onSelect(null)} title={t("na_undo")} aria-label={t("na_undo")} style={{ ...linkBtn, color: "#888", fontSize: 15, lineHeight: 1 }}>×</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 5px" }}>{t("na_link_lead")}</p>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t("na_link_ph")}
        style={input}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "white", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
          {matches.map((l) => (
            <button key={l.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(l); setQuery(""); setOpen(false); }} style={{
              display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "9px 12px", fontSize: 13,
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontWeight: 600, color: "#111" }}>{l.name || "—"}</span>
              {l.email && <span style={{ color: "#888" }}> · {l.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActionForm({ initial, onSubmit, onCancel, submitLabel, showChips = true, showCalendarOption = false, allowLeadPick = false, leads }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [date, setDate] = useState(initial?.date || defaultDate());
  const [time, setTime] = useState(initial?.time || "10:00");
  const [description, setDescription] = useState(initial?.description || "");
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [lead, setLead] = useState(null); // picked lead (only when allowLeadPick)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) { setErr(t("na_field_title")); return; }
    const due_at = buildDueAt(date, time);
    if (!due_at) { setErr(t("na_field_date")); return; }
    setBusy(true); setErr("");
    const fields = {
      title: title.trim(),
      description: description.trim(),
      due_at,
      datetime: `${date}T${time || "10:00"}`,
      addToCalendar: showCalendarOption && addToCalendar,
    };
    if (allowLeadPick) fields.lead_id = lead?.id ?? null;
    const r = await onSubmit(fields);
    if (!r?.ok) { setBusy(false); setErr(r?.error || t("na_error")); }
    // On success the parent updates its state and this form unmounts.
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#FAFAF9", border: "1px solid #F0F0F0", borderRadius: 10, padding: 12 }}>
      {showChips && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CHIPS.map((key) => (
            <button key={key} type="button" onClick={() => setTitle(t(key))} style={{
              background: "white", border: "1px solid #E5E5E5", borderRadius: 999,
              padding: "5px 11px", fontSize: 12, color: "#374151", cursor: "pointer", whiteSpace: "nowrap",
            }}>{t(key)}</button>
          ))}
        </div>
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("na_title_ph")} autoFocus style={input} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("na_field_date")} style={input} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("na_field_time")} style={input} />
      </div>
      {allowLeadPick && <LeadPicker leads={leads} selected={lead} onSelect={setLead} />}
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("na_field_desc")} rows={2} style={{ ...input, resize: "vertical" }} />
      {showCalendarOption && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151", cursor: "pointer" }}>
          <input type="checkbox" checked={addToCalendar} onChange={(e) => setAddToCalendar(e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#111" }} />
          {t("na_cal_add")}
        </label>
      )}
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
