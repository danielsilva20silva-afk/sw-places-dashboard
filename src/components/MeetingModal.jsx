import { useState } from "react";

export default function MeetingModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [type, setType] = useState("Videocall");

  const labelStyle = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 };
  const inputStyle = { width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", color: "#111", boxSizing: "border-box", fontFamily: "inherit", background: "white" };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !date) return;
    onCreate({ name: name.trim(), date, time, type });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 360, padding: 24, boxShadow: "0 12px 48px rgba(0,0,0,0.18)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: "0 0 18px" }}>Nova reunião</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Lead</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do lead" required style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Data</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Hora</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option>Videocall</option>
              <option>Presencial</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button type="submit" style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Criar reunião</button>
          <button type="button" onClick={onClose} style={{ padding: "12px 18px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
