import { useState, useRef, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const MOCK_LEADS = [
  { id: 1, name: "João Silva", email: "joao@email.com", phone: "+351912345678", budget: "300k–500k", intention: "Habitação própria", source: "V23 — Algarve", date: "2026-06-17", status: "Novo", notes: "" },
  { id: 2, name: "Ana Martins", email: "ana@email.com", phone: "+351963111222", budget: "+500k", intention: "Investimento", source: "V5 — Comunidade", date: "2026-06-16", status: "Contactado", notes: "Interessada em Fix & Flip" },
  { id: 3, name: "Michael Brown", email: "michael@email.com", phone: "+447911123456", budget: "+1M", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-15", status: "Reunião agendada", notes: "Call marcada 20 jun" },
  { id: 4, name: "Sara Costa", email: "sara@email.com", phone: "+351934567890", budget: "Até 300k", intention: "Casa de férias", source: "V1 — Lisboa vs CV", date: "2026-06-14", status: "Fechado", notes: "" },
  { id: 5, name: "Thomas Müller", email: "thomas@email.com", phone: "+4915123456789", budget: "300k–500k", intention: "Casa de férias", source: "V12 — Foreigners", date: "2026-06-13", status: "Perdido", notes: "Decidiu outro país" },
  { id: 6, name: "Catarina Lopes", email: "cat@email.com", phone: "+351965432109", budget: "300k–500k", intention: "Habitação própria", source: "V23 — Algarve", date: "2026-06-12", status: "Novo", notes: "" },
  { id: 7, name: "James Wilson", email: "james@email.com", phone: "+14155550123", budget: "+1M", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-11", status: "Contactado", notes: "" },
  { id: 8, name: "Beatriz Fonseca", email: "bea@email.com", phone: "+351912000111", budget: "300k–500k", intention: "Habitação própria", source: "V7 — 3 Razões", date: "2026-06-10", status: "Novo", notes: "" },
  { id: 9, name: "Lena Fischer", email: "lena@email.com", phone: "+4917612345678", budget: "+500k", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-08", status: "Novo", notes: "" },
  { id: 10, name: "Ricardo Sousa", email: "ricardo@email.com", phone: "+351961234567", budget: "300k–500k", intention: "Habitação própria", source: "V1 — Lisboa vs CV", date: "2026-06-05", status: "Contactado", notes: "" },
  { id: 11, name: "Sophie Martin", email: "sophie@email.com", phone: "+33612345678", budget: "+1M", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-03", status: "Reunião agendada", notes: "Videocall 25 jun 15h" },
  { id: 12, name: "Paulo Ferreira", email: "paulo@email.com", phone: "+351934111222", budget: "Até 300k", intention: "Habitação própria", source: "V23 — Algarve", date: "2026-05-28", status: "Fechado", notes: "" },
];

const MEETINGS = [
  { id: 3, name: "Michael Brown", date: "2026-06-20", time: "14:00", type: "Videocall" },
  { id: 11, name: "Sophie Martin", date: "2026-06-25", time: "15:00", type: "Videocall" },
  { id: 7, name: "James Wilson", date: "2026-06-28", time: "10:00", type: "Presencial" },
];

// Chart data — leads per day last 14 days
const chartData = (() => {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const count = MOCK_LEADS.filter(l => l.date === dateStr).length;
    days.push({
      day: d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }),
      leads: count,
    });
  }
  return days;
})();

const STATUS_CONFIG = {
  "Novo":             { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6", border: "#BFDBFE" },
  "Contactado":       { bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B", border: "#FDE68A" },
  "Reunião agendada": { bg: "#F5F3FF", text: "#5B21B6", dot: "#8B5CF6", border: "#DDD6FE" },
  "Fechado":          { bg: "#F0FDF4", text: "#14532D", dot: "#22C55E", border: "#BBF7D0" },
  "Perdido":          { bg: "#FFF1F2", text: "#881337", dot: "#F43F5E", border: "#FECDD3" },
};
const STATUSES = ["Novo", "Contactado", "Reunião agendada", "Fechado", "Perdido"];
const BUDGETS = ["Todos", "Até 300k", "300k–500k", "+500k", "+1M"];
const INTENTIONS = ["Todas", "Habitação própria", "Casa de férias", "Investimento"];
const GOLD = "#C9A96E";

function relDate(dateStr) {
  const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 7) return `${diff}d atrás`;
  return new Date(dateStr).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

function Avatar({ name, size = 36 }) {
  const palette = ["#C9A96E", "#4F7CAC", "#8B5CF6", "#E67E5A", "#2D9E6B", "#E91E8C"];
  const color = palette[name.charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3),
      background: color + "18", color, fontWeight: 700,
      fontSize: Math.round(size * 0.38), display: "flex",
      alignItems: "center", justifyContent: "center", flexShrink: 0,
      border: `1.5px solid ${color}30`,
    }}>{name.charAt(0)}</div>
  );
}

function StatusPill({ status, small }) {
  const c = STATUS_CONFIG[status] || { bg: "#F3F4F6", text: "#6B7280", dot: "#9CA3AF", border: "#E5E7EB" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: small ? "2px 8px" : "4px 10px", borderRadius: 20,
      fontSize: small ? 11 : 12, fontWeight: 600,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function StatusDropdown({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={e => { e.stopPropagation(); setOpen(!open); }} style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "none", border: "none", cursor: "pointer", padding: 0,
      }}>
        <StatusPill status={status} small />
        <span style={{ fontSize: 9, color: "#AAA" }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
          background: "white", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid #F0F0F0",
          overflow: "hidden", minWidth: 180,
        }}>
          {STATUSES.map(s => (
            <button key={s} onClick={e => { e.stopPropagation(); onChange(s); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "9px 14px", border: "none",
              background: s === status ? "#F8F7F4" : "white",
              cursor: "pointer", textAlign: "left", fontSize: 13,
              fontWeight: s === status ? 600 : 400, color: "#111",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#F8F7F4"}
              onMouseLeave={e => e.currentTarget.style.background = s === status ? "#F8F7F4" : "white"}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_CONFIG[s]?.dot || "#999", flexShrink: 0 }} />
              {s}
              {s === status && <span style={{ marginLeft: "auto", fontSize: 12, color: GOLD }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickActions({ lead }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} title="Ligar" style={{
        width: 32, height: 32, borderRadius: 8, background: "#F0FDF4",
        display: "flex", alignItems: "center", justifyContent: "center",
        textDecoration: "none", fontSize: 14, border: "1px solid #BBF7D0", flexShrink: 0,
      }}>📞</a>
      <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
        onClick={e => e.stopPropagation()} title="WhatsApp" style={{
          width: 32, height: 32, borderRadius: 8, background: "#F0FDF4",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", fontSize: 14, border: "1px solid #BBF7D0", flexShrink: 0,
        }}>💬</a>
    </div>
  );
}

function LeadDrawer({ lead, onClose, onUpdate }) {
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes || "");
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
          <div style={{ display: "flex", gap: 10 }}>
            <a href={`tel:${lead.phone}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#16A34A", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>📞 Ligar</a>
            <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>💬 WhatsApp</a>
          </div>
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
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #F0F0F0", display: "flex", gap: 10 }}>
          <button onClick={() => { onUpdate(lead.id, status, notes); onClose(); }} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
          <button onClick={onClose} style={{ padding: "13px 18px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", border: "1px solid #EBEBEB", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: 13 }}>
      <p style={{ color: "#888", margin: "0 0 4px", fontSize: 11 }}>{label}</p>
      <p style={{ color: "#111", fontWeight: 700, margin: 0 }}>{payload[0].value} lead{payload[0].value !== 1 ? "s" : ""}</p>
    </div>
  );
}

function MiniCalendar({ meetings }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const start = firstDay === 0 ? 6 : firstDay - 1;

  const meetingDates = meetings.map(m => m.date);

  const days = [];
  for (let i = 0; i < start; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthName = today.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  return (
    <div>
      <p style={{ fontSize: 12, color: "#888", textTransform: "capitalize", margin: "0 0 12px", fontWeight: 500 }}>{monthName}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 16 }}>
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => (
          <div key={d} style={{ fontSize: 10, color: "#AAA", textAlign: "center", padding: "0 0 4px", fontWeight: 600 }}>{d}</div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = d === today.getDate();
          const hasMeeting = meetingDates.includes(dateStr);
          return (
            <div key={d} style={{
              aspectRatio: "1", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", borderRadius: 8,
              background: isToday ? "#111" : "transparent",
              position: "relative", cursor: hasMeeting ? "pointer" : "default",
            }}>
              <span style={{ fontSize: 12, color: isToday ? "white" : hasMeeting ? "#111" : "#555", fontWeight: isToday || hasMeeting ? 700 : 400 }}>{d}</span>
              {hasMeeting && !isToday && (
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: GOLD, position: "absolute", bottom: 3 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Upcoming meetings */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {meetings.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F8F7F4", borderRadius: 10, border: "1px solid #EBEBEB" }}>
            <div style={{ width: 36, height: 36, background: GOLD + "20", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{new Date(m.date).getDate()}</span>
              <span style={{ fontSize: 9, color: GOLD, textTransform: "uppercase" }}>{new Date(m.date).toLocaleDateString("pt-PT", { month: "short" })}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
              <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>{m.type} · {m.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsletterTab({ leads }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [sent, setSent] = useState(false);
  const allSegments = ["Investimento", "Habitação própria", "Casa de férias", "Até 300k", "300k–500k", "+500k", "+1M"];
  const toggle = s => setSegments(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const count = segments.length === 0 ? leads.length : leads.filter(l => segments.some(s => l.intention === s || l.budget === s)).length;

  const generate = async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const seg = segments.length > 0 ? segments.join(", ") : "todos os leads";
      const res = await fetch("/api/generate-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, segment: seg }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBody(data.text || "");
      if (!subject) setSubject(`SW Places — ${topic}`);
    } catch { setBody("Erro ao gerar. Tenta novamente."); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ background: "white", borderRadius: 20, border: "1px solid #EBEBEB" }}>
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #F0F0F0" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>Nova Newsletter</h2>
          <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>{count} lead{count !== 1 ? "s" : ""} vão receber</p>
        </div>
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>Enviar para {segments.length === 0 ? "(todos)" : ""}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allSegments.map(s => (
                <button key={s} onClick={() => toggle(s)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1.5px solid ${segments.includes(s) ? GOLD : "#E5E5E5"}`, background: segments.includes(s) ? "#FDF8F0" : "white", color: segments.includes(s) ? "#92400E" : "#555", cursor: "pointer" }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ background: "#F8F7F4", borderRadius: 14, padding: "16px 18px" }}>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>✨ Gerar com IA</p>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && generate()} placeholder="Ex: nova propriedade off-market..." style={{ flex: 1, border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none", color: "#111", background: "white", fontFamily: "inherit" }} />
              <button onClick={generate} disabled={loading || !topic} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: topic && !loading ? GOLD : "#E5E5E5", color: topic && !loading ? "white" : "#999", fontSize: 13, fontWeight: 700, cursor: topic && !loading ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>{loading ? "A gerar..." : "Gerar"}</button>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" }}>Assunto</p>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Nova oportunidade off-market — Junho 2026" style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 14px", fontSize: 13, outline: "none", color: "#111", boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
          <div>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" }}>Mensagem</p>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Escreve aqui ou gera com IA acima..." rows={10} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "12px 14px", fontSize: 13, outline: "none", color: "#111", resize: "vertical", lineHeight: 1.7, boxSizing: "border-box", fontFamily: "inherit" }} />
            {body && <p style={{ fontSize: 11, color: "#AAA", margin: "4px 0 0", textAlign: "right" }}>{body.split(" ").filter(Boolean).length} palavras</p>}
          </div>
          {sent && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#15803D", fontWeight: 500 }}>✅ Newsletter enviada!</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setSent(true); setTimeout(() => setSent(false), 3000); }} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Enviar Newsletter</button>
            <button style={{ padding: "13px 20px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>Guardar rascunho</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [leads, setLeads] = useState(MOCK_LEADS);
  const [drawerLead, setDrawerLead] = useState(null);
  const [filterBudget, setFilterBudget] = useState("Todos");
  const [filterIntention, setFilterIntention] = useState("Todas");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  useEffect(() => {
    const h = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const updateLead = (id, status, notes) => setLeads(leads.map(l => l.id === id ? { ...l, status, notes } : l));
  const updateStatus = (id, status) => setLeads(leads.map(l => l.id === id ? { ...l, status } : l));

  const newLeads = leads.filter(l => l.status === "Novo");
  const upcomingMeetings = MEETINGS.filter(m => new Date(m.date) >= new Date()).slice(0, 3);
  const notContacted = leads.filter(l => {
    const diff = Math.floor((new Date() - new Date(l.date)) / 86400000);
    return l.status === "Novo" && diff >= 2;
  });

  const filtered = leads.filter(l => {
    if (filterBudget !== "Todos" && l.budget !== filterBudget) return false;
    if (filterIntention !== "Todas" && l.intention !== filterIntention) return false;
    if (filterStatus !== "Todos" && l.status !== filterStatus) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !l.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = [
    { label: "Total Leads", value: leads.length, color: "#111", sub: `+${leads.filter(l => { const d = new Date(l.date); const now = new Date(); return (now - d) < 7 * 86400000; }).length} esta semana` },
    { label: "Novos", value: leads.filter(l => l.status === "Novo").length, color: "#2563EB", sub: "por contactar" },
    { label: "Em contacto", value: leads.filter(l => l.status === "Contactado" || l.status === "Reunião agendada").length, color: "#D97706", sub: "em progresso" },
    { label: "Fechados", value: leads.filter(l => l.status === "Fechado").length, color: "#16A34A", sub: "este mês" },
  ];

  const FilterLabel = ({ children }) => (
    <p style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, margin: "0 0 5px" }}>{children}</p>
  );

  const tabs = [["dashboard", "Dashboard"], ["leads", "Leads"], ["newsletter", "Newsletter"]];

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#F4F4F2", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: "#111", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: GOLD, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#000" }}>S</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "white", letterSpacing: "-0.3px" }}>SW Places</span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {tabs.map(([tab, label]) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
                background: activeTab === tab ? "rgba(255,255,255,0.12)" : "transparent",
                color: activeTab === tab ? "white" : "rgba(255,255,255,0.4)",
              }}>{label}</button>
            ))}
          </div>
          <div ref={notifRef} style={{ position: "relative" }}>
            <button onClick={() => setNotifOpen(!notifOpen)} style={{
              display: "flex", alignItems: "center", gap: 6,
              border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 8,
              background: notifOpen ? "rgba(255,255,255,0.1)" : "transparent",
            }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              {newLeads.length > 0 && (
                <span style={{
                  background: GOLD, color: "#000", borderRadius: 20,
                  fontSize: 11, fontWeight: 700, padding: "1px 7px", lineHeight: "18px",
                }}>
                  {newLeads.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 200,
                background: "white", borderRadius: 16, width: 320,
                boxShadow: "0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}>
                <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Notificações</p>
                  <span style={{ fontSize: 11, color: "#888" }}>{newLeads.length + upcomingMeetings.length} novas</span>
                </div>

                {/* New leads */}
                {newLeads.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, padding: "12px 18px 6px", margin: 0 }}>Novos leads</p>
                    {newLeads.slice(0, 3).map(lead => (
                      <div key={lead.id} onClick={() => { setDrawerLead(lead); setNotifOpen(false); }} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
                        cursor: "pointer", transition: "background 0.1s",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <Avatar name={lead.name} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>{lead.name}</p>
                          <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>{lead.budget} · {lead.intention}</p>
                        </div>
                        <span style={{ fontSize: 11, color: "#CCC", flexShrink: 0 }}>{relDate(lead.date)}</span>
                      </div>
                    ))}
                    {newLeads.length > 3 && (
                      <p onClick={() => { setActiveTab("leads"); setNotifOpen(false); }} style={{ fontSize: 12, color: GOLD, padding: "4px 18px 10px", margin: 0, cursor: "pointer", fontWeight: 600 }}>
                        +{newLeads.length - 3} mais →
                      </p>
                    )}
                  </div>
                )}

                {/* Upcoming meetings */}
                {upcomingMeetings.length > 0 && (
                  <div style={{ borderTop: newLeads.length > 0 ? "1px solid #F5F5F5" : "none" }}>
                    <p style={{ fontSize: 10, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, padding: "12px 18px 6px", margin: 0 }}>Próximas reuniões</p>
                    {upcomingMeetings.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px" }}>
                        <div style={{ width: 32, height: 32, background: GOLD + "20", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{new Date(m.date).getDate()}</span>
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>{m.name}</p>
                          <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>{m.type} · {m.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Not contacted warning */}
                {notContacted.length > 0 && (
                  <div style={{ borderTop: "1px solid #F5F5F5", padding: "12px 18px", background: "#FFFBEB" }}>
                    <p style={{ fontSize: 12, color: "#92400E", margin: 0, fontWeight: 500 }}>
                      ⚠️ {notContacted.length} lead{notContacted.length > 1 ? "s" : ""} sem contacto há mais de 2 dias
                    </p>
                  </div>
                )}

                <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F0F0" }}>
                  <button onClick={() => { setActiveTab("leads"); setNotifOpen(false); }} style={{
                    width: "100%", background: "#111", color: "white", border: "none",
                    borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>Ver todos os leads</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 48px" }}>

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
              {stats.map(s => (
                <div key={s.label} style={{ background: "white", borderRadius: 16, padding: "20px 20px 16px", border: "1px solid #EBEBEB" }}>
                  <p style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px", fontWeight: 600 }}>{s.label}</p>
                  <p style={{ fontSize: 36, fontWeight: 700, color: "#111", letterSpacing: "-2px", margin: "0 0 6px", lineHeight: 1 }}>{s.value}</p>
                  <p style={{ fontSize: 11, color: "#BBB", margin: 0 }}>{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Chart + Calendar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 20, alignItems: "stretch" }}>
              {/* Chart */}
              <div style={{ background: "white", borderRadius: 16, padding: "22px 24px", border: "1px solid #EBEBEB", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Leads ao longo do tempo</p>
                    <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>Últimos 14 dias</p>
                  </div>
                  <div style={{ background: "#F8F7F4", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#888" }}>Jun 2026</div>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} interval={2} />
                      <YAxis tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#F0F0F0", strokeWidth: 2 }} />
                      <Line type="monotone" dataKey="leads" stroke={GOLD} strokeWidth={2.5} dot={{ fill: GOLD, r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: GOLD, strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Calendar */}
              <div style={{ background: "white", borderRadius: 16, padding: "22px 20px", border: "1px solid #EBEBEB" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Reuniões</p>
                  <span style={{ background: "#F8F7F4", borderRadius: 20, padding: "2px 10px", fontSize: 12, color: "#888" }}>{MEETINGS.length} agendadas</span>
                </div>
                <MiniCalendar meetings={MEETINGS} />
              </div>
            </div>

            {/* Recent leads */}
            <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Leads recentes</p>
                <button onClick={() => setActiveTab("leads")} style={{ fontSize: 12, color: GOLD, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Ver todos →</button>
              </div>
              {leads.slice(0, 5).map((lead, i) => (
                <div key={lead.id} onClick={() => setDrawerLead(lead)} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 20px",
                  borderBottom: i < 4 ? "1px solid #F5F5F5" : "none", cursor: "pointer",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Avatar name={lead.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{lead.name}</span>
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: "#888" }}>{lead.budget}</span>
                      <span style={{ fontSize: 11, color: "#CCC" }}>·</span>
                      <span style={{ fontSize: 11, color: "#AAA" }}>{relDate(lead.date)}</span>
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <StatusDropdown status={lead.status} onChange={s => updateStatus(lead.id, s)} />
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <QuickActions lead={lead} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── LEADS TAB ── */}
        {activeTab === "leads" && (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <FilterLabel>Pesquisar</FilterLabel>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou email..." style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 14px", fontSize: 13, outline: "none", color: "#111", background: "white", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              {[
                { label: "Estado", value: filterStatus, set: setFilterStatus, opts: ["Todos", ...STATUSES] },
                { label: "Orçamento", value: filterBudget, set: setFilterBudget, opts: BUDGETS },
                { label: "Intenção", value: filterIntention, set: setFilterIntention, opts: INTENTIONS },
              ].map((f, i) => (
                <div key={i}>
                  <FilterLabel>{f.label}</FilterLabel>
                  <select value={f.value} onChange={e => f.set(e.target.value)} style={{ border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 32px 9px 12px", fontSize: 13, color: "#111", background: "white", cursor: "pointer", outline: "none" }}>
                    {f.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ alignSelf: "flex-end", paddingBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#AAA" }}>{filtered.length} leads</span>
              </div>
            </div>

            <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", overflow: "hidden" }}>
              {filtered.length === 0 ? (
                <div style={{ padding: "60px", textAlign: "center", color: "#CCC", fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>Nenhum lead encontrado.
                </div>
              ) : filtered.map((lead, i) => (
                <div key={lead.id} onClick={() => setDrawerLead(lead)} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F5" : "none", cursor: "pointer",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Avatar name={lead.name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</span>
                      {lead.notes && <span title={lead.notes} style={{ fontSize: 11, color: GOLD }}>📝</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "#888" }}>{lead.budget}</span>
                      <span style={{ color: "#DDD", fontSize: 10 }}>•</span>
                      <span style={{ fontSize: 12, color: "#888" }}>{lead.intention}</span>
                      <span style={{ color: "#DDD", fontSize: 10 }}>•</span>
                      <span style={{ fontSize: 12, color: "#CCC" }}>{relDate(lead.date)}</span>
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <StatusDropdown status={lead.status} onChange={s => updateStatus(lead.id, s)} />
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <QuickActions lead={lead} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "newsletter" && <NewsletterTab leads={leads} />}
      </div>

      {drawerLead && <LeadDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} onUpdate={updateLead} />}
    </div>
  );
}
