import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { GOLD } from "../constants";
import { t } from "../labels";
import * as api from "../api";
import { ymd, toLocalInput, p2, eventTitle } from "../calendarUtils";
import DateTimePicker from "./DateTimePicker";

// One modal for viewing, creating and editing a Google Calendar event.
// - event: an existing event → opens in VIEW mode (with Editar / Eliminar).
// - prefillDate / prefill: seed the CREATE form (day, or title/desc/location/start).
// The end is start + a chosen DURATION, so it can never precede the start.

const label = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 };
const input = { width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", color: "#111", boxSizing: "border-box", fontFamily: "inherit", background: "white" };

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const fmtDur = (m) => { if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}h${p2(r)}` : `${h}h`; };

// Reminder options (minutes before). -1 = no notification. Default: 30 min.
// Labels via t() so they follow the client's language ("min"/"h" are universal).
const DEFAULT_REMINDER = 30;
const reminderOptions = () => [[-1, t("cal_rem_none")], [5, "5 min"], [10, "10 min"], [30, "30 min"], [60, t("cal_rem_hour")], [1440, t("cal_rem_day")]];
function fmtReminder(m) {
  if (m < 0) return t("cal_rem_none");
  if (m < 60) return `${m} min`;
  if (m === 60) return t("cal_rem_hour");
  if (m === 1440) return t("cal_rem_day");
  if (m % 1440 === 0) return `${m / 1440} ${t("cal_rem_days_suffix")}`;
  if (m % 60 === 0) return `${m / 60} ${t("cal_rem_hours_suffix")}`;
  return `${m} min`;
}

// Seed the start Date: existing event, else prefill/prefillDate, else now.
// New events snap to a tidy slot (10:00 if midnight; minutes to the nearest 15).
function seedStart({ event, prefill, prefillDate }) {
  if (event && !event.allDay) return new Date(event.start);
  if (event && event.allDay) return new Date(event.start + "T00:00");
  const d = prefill?.start ? new Date(prefill.start) : prefillDate ? new Date(prefillDate) : new Date();
  if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(10, 0, 0, 0);
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}
function eventDurationMin(event) {
  if (!event || event.allDay) return 60;
  const m = Math.round((new Date(event.end || event.start) - new Date(event.start)) / 60000);
  return m > 0 ? m : 60;
}

export default function EventModal({ event, prefillDate, prefill, onClose, onSaved, onDeleted }) {
  const isNew = !event;

  // Lock background scroll while the modal is open. In an iOS standalone PWA an
  // unlocked body keeps the page scroller "attached" and steals touches from the
  // fixed overlay, which is what makes it feel frozen. Restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [editing, setEditing] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState(event?.title || prefill?.title || "");
  const [description, setDescription] = useState(event?.description || prefill?.description || "");
  const [location, setLocation] = useState(event?.location || prefill?.location || "");
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [start, setStart] = useState(() => seedStart({ event, prefill, prefillDate }));
  const [duration, setDuration] = useState(() => eventDurationMin(event));
  // null/undefined from the API = not determinable → fall back to the default.
  const [reminderMinutes, setReminderMinutes] = useState(() => {
    const v = event?.reminderMinutes;
    return v === null || v === undefined ? DEFAULT_REMINDER : v;
  });

  // Options include the event's own duration if it isn't a standard step.
  const durOptions = [...new Set([duration, ...DURATIONS])].sort((a, b) => a - b);
  // Include the event's current reminder if it isn't one of the presets.
  const REMINDERS = reminderOptions();
  const remOptions = REMINDERS.some(([v]) => v === reminderMinutes) ? REMINDERS : [[reminderMinutes, fmtReminder(reminderMinutes)], ...REMINDERS];
  const endDate = new Date(start.getTime() + duration * 60000);
  const endLabel = ymd(endDate) === ymd(start)
    ? `${t("cal_ends_at_prefix")} ${p2(endDate.getHours())}:${p2(endDate.getMinutes())}`
    : `${t("cal_ends_on_prefix")} ${endDate.toLocaleDateString(t("date_locale"), { day: "numeric", month: "short" })}, ${p2(endDate.getHours())}:${p2(endDate.getMinutes())}`;

  const buildPayload = () => {
    if (allDay) { const d = ymd(start); return { title: title.trim(), description, location, allDay: true, start: d, end: d, reminderMinutes }; }
    return { title: title.trim(), description, location, allDay: false, start: toLocalInput(start), end: toLocalInput(endDate), reminderMinutes };
  };

  const save = async () => {
    setError("");
    if (!title.trim()) { setError(t("cal_title_required")); return; }
    setBusy(true);
    try {
      const payload = buildPayload();
      const saved = event ? await api.updateEvent({ id: event.id, ...payload }) : await api.createEvent(payload);
      onSaved?.(saved);
    } catch (e) {
      setError(e.message || t("save_failed"));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!event || busy) return;
    if (!window.confirm(t("cal_delete_confirm"))) return;
    setBusy(true);
    try {
      await api.deleteEvent(event.id);
      onDeleted?.(event.id);
    } catch (e) {
      setError(e.message || t("cal_delete_failed"));
      setBusy(false);
    }
  };

  // ── VIEW mode ──
  const viewWhen = () => {
    if (!event) return "";
    const loc = t("date_locale");
    if (event.allDay) return new Date(event.start + "T00:00").toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" }) + ` · ${t("cal_all_day_suffix")}`;
    const s = new Date(event.start), e = new Date(event.end || event.start);
    const day = s.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });
    const tm = (d) => d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${tm(s)}–${tm(e)}`;
  };

  // Portaled to <body> so the fixed overlay escapes the Dashboard root, which has
  // `overflow-x: hidden`. In an iOS standalone PWA a position:fixed descendant of
  // an overflow-clipped ancestor gets detached from the touch layer and goes dead,
  // while normal Safari/Chrome composite it fine. Body-level render avoids that.
  // Safe-area insets in the overlay padding keep the centered card clear of the
  // notch / home indicator; the card itself scrolls with momentum.
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", padding: 24, boxShadow: "0 12px 48px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>
            {isNew ? t("cal_new_title") : editing ? t("cal_edit_title") : t("cal_view_title")}
          </h2>
          <button onClick={onClose} style={{ background: "#F5F5F5", border: "none", borderRadius: 8, width: 28, height: 28, fontSize: 16, color: "#888", cursor: "pointer" }}>×</button>
        </div>

        {!editing && event ? (
          <>
            <p style={{ fontSize: 17, fontWeight: 700, color: "#111", margin: "0 0 6px" }}>{eventTitle(event)}</p>
            <p style={{ fontSize: 13, color: GOLD, fontWeight: 600, textTransform: "capitalize", margin: "0 0 14px" }}>{viewWhen()}</p>
            {event.location && <p style={{ fontSize: 13, color: "#555", margin: "0 0 10px" }}>📍 {event.location}</p>}
            {event.description && <p style={{ fontSize: 13, color: "#555", margin: "0 0 10px", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{event.description}</p>}
            {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: "12px 0" }}>{error}</div>}
            {/* Read-only events live on a secondary (display-only) calendar — no
                edit/delete (the dashboard never writes to non-primary calendars). */}
            {event.readOnly ? (
              <p style={{ fontSize: 12, color: "#888", fontStyle: "italic", margin: "18px 0 0" }}>🔒 {t("cal_readonly")}</p>
            ) : (
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button onClick={() => setEditing(true)} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t("cal_edit")}</button>
                <button onClick={remove} disabled={busy} style={{ background: "#FFF1F2", color: "#DC2626", border: "1px solid #FECDD3", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>{busy ? "…" : t("cal_delete")}</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>{t("cal_f_title")}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("cal_title_ph")} style={input} autoFocus />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", margin: "0 0 14px", cursor: "pointer" }}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> {t("cal_all_day")}
            </label>
            {allDay ? (
              <div style={{ marginBottom: 14 }}>
                <label style={label}>{t("cal_date")}</label>
                <DateTimePicker value={start} onChange={setStart} withTime={false} />
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>{t("cal_start")}</label>
                  <DateTimePicker value={start} onChange={setStart} withTime />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>{t("cal_duration")}</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ ...input, width: "auto", cursor: "pointer", paddingRight: 28 }}>
                      {durOptions.map((m) => <option key={m} value={m}>{fmtDur(m)}</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: "#888" }}>{endLabel}</span>
                  </div>
                </div>
              </>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={label}>{t("cal_reminder")}</label>
              <select value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))} style={{ ...input, cursor: "pointer" }}>
                {remOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>{t("cal_location")} <span style={{ color: "#BBB", fontWeight: 400 }}>{t("cal_optional")}</span></label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("cal_location_ph")} style={input} />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={label}>{t("cal_description")} <span style={{ color: "#BBB", fontWeight: 400 }}>{t("cal_optional")}</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} />
            </div>
            {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: "12px 0 0" }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={save} disabled={busy} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>{busy ? t("save_saving") : t("notes_save")}</button>
              <button onClick={isNew ? onClose : () => setEditing(false)} disabled={busy} style={{ padding: "12px 18px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>{t("notes_cancel")}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
