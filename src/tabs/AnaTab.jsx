import { useState, useRef, useEffect } from "react";
import { GOLD } from "../constants";
import * as api from "../api";

const TEST_CONTACT_ID = "test-web";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function AnaTab() {
  const [messages, setMessages] = useState([]); // { role: "user"|"assistant", text }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);

    const start = Date.now();
    // Fire the real request immediately so it overlaps the artificial delay
    const replyPromise = api.aiReply(TEST_CONTACT_ID, text)
      .then((data) => ({ reply: data.reply || "(sem resposta)" }))
      .catch((err) => ({ error: err.message || "Erro ao contactar a Ana." }));

    // "Noticing" pause before the typing indicator appears
    await sleep(1500);
    setTyping(true);

    const result = await replyPromise;
    const errMsg = result.error || null;
    const reply = result.reply || null;

    // Typing shows ~30ms/char (2–6s). Reveal at whichever is longer:
    // the artificial timeline (1.5s + typing) or the actual network time.
    const typingMs = errMsg ? 0 : Math.min(6000, Math.max(2000, reply.length * 30));
    const remaining = Math.max(0, 1500 + typingMs - (Date.now() - start));
    await sleep(remaining);

    setTyping(false);
    setLoading(false);
    if (errMsg) setError(errMsg);
    else setMessages((m) => [...m, { role: "assistant", text: reply }]);
  };

  const clear = async () => {
    setMessages([]);
    setError("");
    api.clearConversation(TEST_CONTACT_ID).catch(() => {});
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ background: "white", borderRadius: 20, border: "1px solid #EBEBEB", overflow: "hidden", display: "flex", flexDirection: "column", height: "70vh", minHeight: 420 }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 700, fontSize: 15 }}>A</div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#111", margin: 0 }}>Ana</p>
              <p style={{ fontSize: 11, color: "#888", margin: "1px 0 0" }}>Assistente · página de teste interna</p>
            </div>
          </div>
          <button onClick={clear} style={{ fontSize: 12, color: "#888", background: "none", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 500 }}>Limpar conversa</button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10, background: "#FAFAF9" }}>
          {messages.length === 0 && !loading && (
            <p style={{ textAlign: "center", color: "#BBB", fontSize: 13, margin: "auto 0" }}>Escreve uma mensagem para começar a testar a Ana.</p>
          )}
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "78%", padding: "10px 14px", fontSize: 14, lineHeight: 1.5,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: isUser ? "#111" : "white",
                  color: isUser ? "white" : "#111",
                  border: isUser ? "none" : "1px solid #EBEBEB",
                }}>{m.text}</div>
              </div>
            );
          })}
          {typing && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "10px 14px", fontSize: 13, fontStyle: "italic", color: "#999", background: "white", border: "1px solid #EBEBEB", borderRadius: "14px 14px 14px 4px" }}>Ana está a escrever…</div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "8px 24px", background: "#FFF1F2", color: "#BE123C", fontSize: 12, borderTop: "1px solid #FECDD3" }}>{error}</div>
        )}

        {/* Input */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid #F0F0F0", display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Escreve como se fosses um cliente…"
            style={{ flex: 1, border: "1px solid #E5E5E5", borderRadius: 12, padding: "11px 14px", fontSize: 14, outline: "none", color: "#111", background: "white", fontFamily: "inherit" }}
          />
          <button onClick={send} disabled={loading || !input.trim()} style={{
            padding: "11px 22px", borderRadius: 12, border: "none",
            background: (loading || !input.trim()) ? "#E5E5E5" : "#111",
            color: (loading || !input.trim()) ? "#999" : "white",
            fontSize: 14, fontWeight: 600, cursor: (loading || !input.trim()) ? "not-allowed" : "pointer", whiteSpace: "nowrap",
          }}>Enviar</button>
        </div>
      </div>
    </div>
  );
}
