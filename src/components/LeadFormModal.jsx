import { useState } from "react";

const INTENTION_OPTS = ["", "viver", "investir", "férias", "vender", "terreno", "outro"];

const labelStyle = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", color: "#111", boxSizing: "border-box", fontFamily: "inherit", background: "white" };

// Manual lead creation. onCreate(fields) → { ok, error? }; modal closes on ok.
export default function LeadFormModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", budget: "", intention: "", zone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.name.trim()) { setError("Indica o nome do lead."); return; }
    if (!f.email.trim() && !f.phone.trim()) { setError("Indica pelo menos um contacto (email ou telefone)."); return; }
    setSaving(true);
    const r = await onCreate(f);
    setSaving(false);
    if (r?.ok) onClose();
    else setError("Não foi possível criar o lead. Tenta novamente.");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto", padding: 24, boxShadow: "0 12px 48px rgba(0,0,0,0.18)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: "0 0 18px" }}>Novo lead</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Nome</label>
          <input value={f.name} onChange={set("name")} placeholder="Nome do lead" style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Email</label>
            <input value={f.email} onChange={set("email")} placeholder="email@exemplo.com" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Telefone</label>
            <input value={f.phone} onChange={set("phone")} placeholder="+351 ..." style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Orçamento</label>
            <input value={f.budget} onChange={set("budget")} placeholder="ex. até 300k, 700k-900k" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Intenção</label>
            <select value={f.intention} onChange={set("intention")} style={{ ...inputStyle, cursor: "pointer" }}>
              {INTENTION_OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Zona</label>
          <input value={f.zone} onChange={set("zone")} placeholder="ex. Aljezur, Lagos" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Notas</label>
          <textarea value={f.notes} onChange={set("notes")} placeholder="Contexto útil sobre o lead..." rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        </div>

        {error && (
          <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "9px 12px", fontSize: 12, marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving} style={{ flex: 1, background: saving ? "#888" : "#111", color: "white", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? "A criar…" : "Criar lead"}</button>
          <button type="button" onClick={onClose} style={{ padding: "12px 18px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
