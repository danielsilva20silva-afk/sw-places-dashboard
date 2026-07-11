import { useState } from "react";
import { GOLD } from "../constants";
import * as api from "../api";
import { ymd, toLocalInput, p2 } from "../calendarUtils";
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
const REMINDERS = [[-1, "Sem notificação"], [5, "5 min"], [10, "10 min"], [30, "30 min"], [60, "1 hora"], [1440, "1 dia antes"]];
const DEFAULT_REMINDER = 30;
function fmtReminder(m) {
  if (m < 0) return "Sem notificação";
  if (m < 60) return `${m} min`;
  if (m === 60) return "1 hora";
  if (m === 1440) return "1 dia antes";
  if (m % 1440 === 0) return `${m / 1440} dias antes`;
  if (m % 60 === 0) return `${m / 60} horas antes`;
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
  const remOptions = REMINDERS.some(([v]) => v === reminderMinutes) ? REMINDERS : [[reminderMinutes, fmtReminder(reminderMinutes)], ...REMINDERS];
  const endDate = new Date(start.getTime() + duration * 60000);
  const endLabel = ymd(endDate) === ymd(start)
    ? `termina às ${p2(endDate.getHours())}:${p2(endDate.getMinutes())}`
    : `termina ${endDate.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}, ${p2(endDate.getHours())}:${p2(endDate.getMinutes())}`;

  const buildPayload = () => {
    if (allDay) { const d = ymd(start); return { title: title.trim(), description, location, allDay: true, start: d, end: d, reminderMinutes }; }
    return { title: title.trim(), description, location, allDay: false, start: toLocalInput(start), end: toLocalInput(endDate), reminderMinutes };
  };

  const save = async () => {
    setError("");
    if (!title.trim()) { setError("O título é obrigatório."); return; }
    setBusy(true);
    try {
      const payload = buildPayload();
      const saved = event ? await api.updateEvent({ id: event.id, ...payload }) : await api.createEvent(payload);
      onSaved?.(saved);
    } catch (e) {
      setError(e.message || "Não foi possível guardar.");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!event || busy) return;
    if (!window.confirm("Eliminar este evento do calendário?")) return;
    setBusy(true);
    try {
      await api.deleteEvent(event.id);
      onDeleted?.(event.id);
    } catch (e) {
      setError(e.message || "Não foi possível eliminar.");
      setBusy(false);
    }
  };

  // ── VIEW mode ──
  const viewWhen = () => {
    if (!event) return "";
    if (event.allDay) return new Date(event.start + "T00:00").toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }) + " · dia inteiro";
    const s = new Date(event.start), e = new Date(event.end || event.start);
    const day = s.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    const t = (d) => d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${t(s)}–${t(e)}`;
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto", padding: 24, boxShadow: "0 12px 48px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>
            {isNew ? "Novo evento" : editing ? "Editar evento" : "Evento"}
          </h2>
          <button onClick={onClose} style={{ background: "#F5F5F5", border: "none", borderRadius: 8, width: 28, height: 28, fontSize: 16, color: "#888", cursor: "pointer" }}>×</button>
        </div>

        {!editing && event ? (
          <>
            <p style={{ fontSize: 17, fontWeight: 700, color: "#111", margin: "0 0 6px" }}>{event.title}</p>
            <p style={{ fontSize: 13, color: GOLD, fontWeight: 600, textTransform: "capitalize", margin: "0 0 14px" }}>{viewWhen()}</p>
            {event.location && <p style={{ fontSize: 13, color: "#555", margin: "0 0 10px" }}>📍 {event.location}</p>}
            {event.description && <p style={{ fontSize: 13, color: "#555", margin: "0 0 10px", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{event.description}</p>}
            {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: "12px 0" }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setEditing(true)} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Editar</button>
              <button onClick={remove} disabled={busy} style={{ background: "#FFF1F2", color: "#DC2626", border: "1px solid #FECDD3", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>{busy ? "…" : "Eliminar"}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Visita com João" style={input} autoFocus />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", margin: "0 0 14px", cursor: "pointer" }}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Dia inteiro
            </label>
            {allDay ? (
              <div style={{ marginBottom: 14 }}>
                <label style={label}>Data</label>
                <DateTimePicker value={start} onChange={setStart} withTime={false} />
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>Início</label>
                  <DateTimePicker value={start} onChange={setStart} withTime />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>Duração</label>
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
              <label style={label}>Notificação</label>
              <select value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))} style={{ ...input, cursor: "pointer" }}>
                {remOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Localização <span style={{ color: "#BBB", fontWeight: 400 }}>(opcional)</span></label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Escritório, Aljezur" style={input} />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={label}>Descrição <span style={{ color: "#BBB", fontWeight: 400 }}>(opcional)</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...input, resize: "vertical" }} />
            </div>
            {error && <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: "12px 0 0" }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={save} disabled={busy} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>{busy ? "A guardar…" : "Guardar"}</button>
              <button onClick={isNew ? onClose : () => setEditing(false)} disabled={busy} style={{ padding: "12px 18px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
