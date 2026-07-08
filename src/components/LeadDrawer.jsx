import { useState } from "react";
import { STATUSES, STATUS_CONFIG } from "../constants";
import { relDate, isValidEmail, isValidPhone } from "../utils";
import Avatar from "./Avatar";
import AnaToggle from "./AnaToggle";

export default function LeadDrawer({ lead, onClose, onUpdate, onDelete }) {
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes || "");
  const [deleting, setDeleting] = useState(false);
  const phoneOk = isValidPhone(lead.phone);
  const emailOk = isValidEmail(lead.email);
  // Ana toggle only for leads that came from Instagram DMs (id is a ManyChat subscriber id)
  const isAnaSubscriber = lead.source === "DM · ANA" && /^\d+$/.test(String(lead.id));

  const handleDelete = async () => {
    if (deleting) return;
    if (!window.confirm("Tens a certeza que queres eliminar este lead?")) return;
    setDeleting(true);
    const ok = await onDelete(lead.id);
    if (ok) {
      onClose();
    } else {
      setDeleting(false);
      alert("Não foi possível eliminar o lead. Tenta novamente.");
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "relative", background: "white", width: "100%", maxWidth: 420,
        height: "100vh", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.1)",
        display: "flex", flexDirection: "column",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F0F0F0", position: "sticky", top: 0, background: "white", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={onClose} style={{ background: "#F5F5F5", border: "none", borderRadius: 8, width: 28, height: 28, fontSize: 16, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            <span style={{ fontSize: 12, color: "#AAA" }}>{relDate(lead.date)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={lead.name} size={48} />
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111", margin: 0 }}>{lead.name}</h2>
              <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>{lead.source}</p>
            </div>
          </div>
        </div>
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          {(phoneOk || emailOk) ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {phoneOk && (
                <a href={`tel:${lead.phone}`} style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#16A34A", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>📞 Ligar</a>
              )}
              {phoneOk && (
                <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>💬 WhatsApp</a>
              )}
              {emailOk && (
                <a href={`mailto:${lead.email}`} style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#2563EB", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>✉️ Email</a>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F7F4", color: "#AAA", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 500 }}>Sem contacto válido</div>
          )}
          {isAnaSubscriber && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#F8F7F4", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>Assistente Ana</p>
                <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>Desliga para responderes tu (a Ana fica em silêncio no Instagram).</p>
              </div>
              <AnaToggle subscriberId={String(lead.id)} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Email", lead.email], ["Telefone", lead.phone], ["Orçamento", lead.budget], ["Intenção", lead.intention]].map(([label, value]) => (
              <div key={label} style={{ background: "#F8F7F4", borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px" }}>{label}</p>
                <p style={{ fontSize: 12, color: "#111", margin: 0, fontWeight: 500, wordBreak: "break-all" }}>{value}</p>
              </div>
            ))}
          </div>
          <div>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>Estado</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STATUSES.map(s => {
                const c = STATUS_CONFIG[s]; const active = status === s;
                return <button key={s} onClick={() => setStatus(s)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1.5px solid ${active ? c.dot : "#E5E5E5"}`, background: active ? c.bg : "white", color: active ? c.text : "#555", cursor: "pointer" }}>{s}</button>;
              })}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" }}>Notas</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas sobre este lead..." rows={4} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#111", resize: "none", outline: "none", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
          <button onClick={handleDelete} disabled={deleting} style={{
            width: "100%", background: "#FFF1F2", color: "#DC2626",
            border: "1px solid #FECDD3", borderRadius: 10, padding: "11px",
            fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer",
            opacity: deleting ? 0.6 : 1,
          }}>{deleting ? "A eliminar…" : "🗑 Eliminar lead"}</button>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #F0F0F0", display: "flex", gap: 10 }}>
          <button onClick={() => { onUpdate(lead.id, status, notes); onClose(); }} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
          <button onClick={onClose} style={{ padding: "13px 18px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
