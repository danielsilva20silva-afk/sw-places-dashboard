import { useState, useEffect, useRef } from "react";
import * as api from "../api";

// Read-only Instagram thread for a lead, shown inside the LeadDrawer.
// Only renders for Ana/Instagram leads (source "DM · ANA" + numeric subscriber
// id, which is the contact_id in Conversations). Renders nothing for other
// leads (Manual, ALGARVE, …) or when there are no messages.

const isSubscriber = (id) => /^\d+$/.test(String(id));

function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return true;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Time only, or "9 jul, 14:32" when the thread spans multiple days.
function stamp(ts, withDate) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const opts = withDate
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", ...opts });
}

export default function LeadConversation({ lead }) {
  const enabled = lead.source === "DM · ANA" && isSubscriber(lead.id);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    api.getConversation(lead.id)
      .then((m) => { if (alive) setMsgs(m); })
      .catch(() => { if (alive) setMsgs([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [enabled, lead.id]);

  // Land on the most recent message.
  useEffect(() => {
    if (!collapsed && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, collapsed]);

  if (!enabled) return null;
  if (!loading && msgs.length === 0) return null;

  const spanDays = msgs.length > 1 && !sameDay(msgs[0].timestamp, msgs[msgs.length - 1].timestamp);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 10px" }}>
        <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>Conversa</p>
        {!loading && msgs.length > 0 && (
          <button onClick={() => setCollapsed((c) => !c)} style={{ fontSize: 11, color: "#888", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
            {collapsed ? `Mostrar (${msgs.length})` : "Ocultar"}
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "#AAA", fontSize: 12 }}>A carregar conversa…</div>
      ) : !collapsed && (
        <div ref={scrollRef} style={{ maxHeight: 320, overflowY: "auto", background: "#FAFAF9", border: "1px solid #F0F0F0", borderRadius: 12, padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.map((m, i) => {
            const isUser = m.role === "user";
            const s = stamp(m.timestamp, spanDays);
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "8px 12px", fontSize: 13, lineHeight: 1.45,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  background: isUser ? "#111" : "white",
                  color: isUser ? "white" : "#111",
                  border: isUser ? "none" : "1px solid #EBEBEB",
                }}>{m.message}</div>
                {s && <span style={{ fontSize: 9, color: "#BBB", margin: "3px 2px 0" }}>{s}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
