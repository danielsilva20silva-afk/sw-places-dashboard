import { useState } from "react";
import { GOLD } from "../constants";
import * as api from "../api";
import { ymd, toLocalInput } from "../calendarUtils";

// One modal for viewing, creating and editing a Google Calendar event.
// - event: an existing event → opens in VIEW mode (with Editar / Eliminar).
// - prefillDate: a Date → opens the CREATE form seeded to that day.
// onSaved(event) / onDeleted(id) let the parent refetch.

const label = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 };
const input = { width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", color: "#111", boxSizing: "border-box", fontFamily: "inherit", background: "white" };

function defaultTimes(prefillDate) {
  const base = prefillDate ? new Date(prefillDate) : new Date();
  const start = new Date(base); start.setHours(10, 0, 0, 0);
  const end = new Date(base); end.setHours(11, 0, 0, 0);
  return { start, end };
}

export default function EventModal({ event, prefillDate, onClose, onSaved, onDeleted }) {
  const isNew = !event;
  const [editing, setEditing] = useState(isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seed = defaultTimes(prefillDate);
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [location, setLocation] = useState(event?.location || "");
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [dateVal, setDateVal] = useState(event?.allDay ? event.start : (event ? ymd(new Date(event.start)) : ymd(seed.start)));
  const [startVal, setStartVal] = useState(event && !event.allDay ? toLocalInput(new Date(event.start)) : toLocalInput(seed.start));
  const [endVal, setEndVal] = useState(event && !event.allDay ? toLocalInput(new Date(event.end || event.start)) : toLocalInput(seed.end));

  const buildPayload = () => {
    if (allDay) return { title: title.trim(), description, location, allDay: true, start: dateVal, end: dateVal };
    return { title: title.trim(), description, location, allDay: false, start: startVal, end: endVal };
  };

  const save = async () => {
    setError("");
    if (!title.trim()) { setError("O título é obrigatório."); return; }
    if (allDay ? !dateVal : (!startVal || !endVal)) { setError("Preenche a data e as horas."); return; }
    if (!allDay && endVal < startVal) { setError("A hora de fim é anterior à de início."); return; }
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
                <input type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} style={input} />
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>Início</label>
                  <input type="datetime-local" value={startVal} onChange={(e) => setStartVal(e.target.value)} style={input} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={label}>Fim</label>
                  <input type="datetime-local" value={endVal} onChange={(e) => setEndVal(e.target.value)} style={input} />
                </div>
              </div>
            )}
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
