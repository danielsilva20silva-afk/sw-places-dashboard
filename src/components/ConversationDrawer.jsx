import { useRef, useEffect } from "react";
import { GOLD } from "../constants";
import Avatar from "./Avatar";
import AnaToggle from "./AnaToggle";

// Read-only view of a full Ana conversation (user + assistant turns), styled
// like the "Testar Ana" chat. No editing, no replying.

const isSubscriber = (id) => /^\d+$/.test(String(id));

function displayName(c) {
  if (c.name) return c.name;
  if (c.username) return `@${c.username}`;
  return isSubscriber(c.contact_id) ? "Sem nome" : String(c.contact_id);
}

// Absolute timestamp per message, e.g. "9 jul, 14:32"
function msgStamp(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ConversationDrawer({ conversation: c, onClose }) {
  const scrollRef = useRef(null);
  const messages = c.messages || [];

  // Land on the most recent message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [c.contact_id]);

  const name = displayName(c);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "relative", background: "white", width: "100%", maxWidth: 460,
        height: "100vh", boxShadow: "-8px 0 40px rgba(0,0,0,0.1)",
        display: "flex", flexDirection: "column",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F0F0F0", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={onClose} style={{ background: "#F5F5F5", border: "none", borderRadius: 8, width: 28, height: 28, fontSize: 16, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            {c.isLead
              ? <span style={{ fontSize: 11, fontWeight: 600, color: "#15803D", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 20, padding: "3px 10px" }}>✅ Lead</span>
              : <span style={{ fontSize: 11, color: "#AAA", background: "#F5F5F5", borderRadius: 20, padding: "3px 10px" }}>Em curso</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={name} size={44} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</h2>
              <p style={{ fontSize: 11, color: "#AAA", margin: "2px 0 0" }}>ID {c.contact_id}</p>
            </div>
            {isSubscriber(c.contact_id) && <AnaToggle subscriberId={String(c.contact_id)} initialActive={c.active} />}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, background: "#FAFAF9" }}>
          {messages.length === 0 ? (
            <p style={{ textAlign: "center", color: "#BBB", fontSize: 13, margin: "auto 0" }}>Sem mensagens nesta conversa.</p>
          ) : messages.map((m, i) => {
            const isUser = m.role === "user";
            const stamp = msgStamp(m.timestamp);
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%", padding: "10px 14px", fontSize: 14, lineHeight: 1.5,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: isUser ? "#111" : "white",
                  color: isUser ? "white" : "#111",
                  border: isUser ? "none" : "1px solid #EBEBEB",
                }}>{m.message}</div>
                {stamp && <span style={{ fontSize: 10, color: "#BBB", margin: "4px 2px 0" }}>{stamp}</span>}
              </div>
            );
          })}
        </div>

        {/* Read-only footer note */}
        <div style={{ padding: "12px 24px", borderTop: "1px solid #F0F0F0", background: "white", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#999" }}>Vista só de leitura. As respostas são geridas pela Ana no Instagram.</span>
        </div>
      </div>
    </div>
  );
}
