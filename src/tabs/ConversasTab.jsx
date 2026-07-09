import { useState, useEffect } from "react";
import { GOLD } from "../constants";
import * as api from "../api";
import { relTime } from "../utils";
import Avatar from "../components/Avatar";
import AnaToggle from "../components/AnaToggle";
import ConversationDrawer from "../components/ConversationDrawer";

// Date filters (by last activity). Default: last 7 days.
const DATE_FILTERS = [
  ["today", "Hoje"],
  ["yesterday", "Ontem"],
  ["7d", "Últimos 7 dias"],
  ["all", "Tudo"],
];

function inRange(ts, filter) {
  if (filter === "all") return true;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "today") return d >= startToday;
  if (filter === "yesterday") {
    const startYest = new Date(startToday);
    startYest.setDate(startYest.getDate() - 1);
    return d >= startYest && d < startToday;
  }
  if (filter === "7d") {
    const start7 = new Date(startToday);
    start7.setDate(start7.getDate() - 6); // today + previous 6 days
    return d >= start7;
  }
  return true;
}

export default function ConversasTab({ onConvert }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState("7d");
  const [openConv, setOpenConv] = useState(null);
  const [convertingId, setConvertingId] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getConversations()
      .then((d) => { if (alive) setItems(d); })
      .catch(() => { if (alive) setError("Não foi possível carregar as conversas."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Numeric ids are ManyChat subscribers; non-numeric (e.g. "test-web") aren't.
  const isSubscriber = (id) => /^\d+$/.test(String(id));
  // Display: resolved name → @username → "Sem nome" (subscribers) / raw id (test).
  const label = (c) => {
    if (c.name) return c.name;
    if (c.username) return `@${c.username}`;
    return isSubscriber(c.contact_id) ? "Sem nome" : String(c.contact_id);
  };

  const handleConvert = async (c) => {
    if (convertingId) return;
    setConvertingId(c.contact_id);
    const r = await onConvert?.(c);
    setConvertingId(null);
    if (!r?.ok) alert("Não foi possível converter em lead. Tenta novamente.");
    // On success, Dashboard navigates to the Leads tab (this tab unmounts).
  };

  const filtered = items.filter((c) => inRange(c.lastTimestamp, dateFilter));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>Conversas</h2>
          <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>Todas as conversas da Ana. Clica para ler o histórico completo.</p>
        </div>
        {!loading && !error && <span style={{ fontSize: 12, color: "#AAA" }}>{filtered.length} conversa{filtered.length !== 1 ? "s" : ""}</span>}
      </div>

      {/* Date filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {DATE_FILTERS.map(([key, lbl]) => {
          const on = dateFilter === key;
          return (
            <button key={key} onClick={() => setDateFilter(key)} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1.5px solid ${on ? "#111" : "#E5E5E5"}`,
              background: on ? "#111" : "white",
              color: on ? "white" : "#666",
            }}>{lbl}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "#999", fontSize: 14 }}>A carregar…</div>
      ) : error ? (
        <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 12, padding: "12px 16px", fontSize: 13 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", padding: "60px", textAlign: "center", color: "#CCC", fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
          {items.length === 0 ? "Ainda não há conversas." : "Nenhuma conversa neste período."}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB" }}>
          {filtered.map((c, i) => (
            <div key={c.contact_id} onClick={() => setOpenConv(c)} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", cursor: "pointer",
              borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F5" : "none",
              borderRadius: `${i === 0 ? "16px 16px" : "0 0"} ${i === filtered.length - 1 ? "16px 16px" : "0 0"}`,
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Avatar name={label(c)} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`ID: ${c.contact_id}`}>{label(c)}</span>
                  {c.isLead
                    ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: "#15803D", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "1px 8px" }}>✅ Lead</span>
                    : <span style={{ flexShrink: 0, fontSize: 10, color: "#AAA", background: "#F5F5F5", borderRadius: 12, padding: "1px 8px" }}>Em curso</span>}
                </div>
                <div style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{c.lastMessage || "—"}</div>
              </div>
              <span style={{ fontSize: 12, color: "#CCC", flexShrink: 0, whiteSpace: "nowrap" }}>{relTime(c.lastTimestamp)}</span>
              {!c.isLead && isSubscriber(c.contact_id) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleConvert(c); }}
                  disabled={convertingId === c.contact_id}
                  title="Converter esta conversa num lead"
                  style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                    color: convertingId === c.contact_id ? "#AAA" : "#8A6D2F",
                    background: GOLD + "22", border: `1px solid ${GOLD}66`, borderRadius: 8,
                    padding: "5px 10px", cursor: convertingId === c.contact_id ? "default" : "pointer",
                  }}
                >{convertingId === c.contact_id ? "A converter…" : "→ Lead"}</button>
              )}
              {isSubscriber(c.contact_id) && <AnaToggle subscriberId={String(c.contact_id)} initialActive={c.active} />}
            </div>
          ))}
        </div>
      )}

      {openConv && <ConversationDrawer conversation={openConv} onClose={() => setOpenConv(null)} onConvert={onConvert} />}
    </>
  );
}
