import { useState } from "react";
import { GOLD } from "../constants";
import { branding } from "../config";

export default function NewsletterTab({ leads }) {
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
      if (!subject) setSubject(`${branding.name} — ${topic}`);
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
