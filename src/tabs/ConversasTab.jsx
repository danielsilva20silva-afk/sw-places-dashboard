import { useState, useEffect } from "react";
import * as api from "../api";
import { relTime } from "../utils";
import Avatar from "../components/Avatar";
import AnaToggle from "../components/AnaToggle";

export default function ConversasTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  const label = (id) => (isSubscriber(id) ? "Sem nome" : String(id));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>Conversas ativas</h2>
          <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>Pessoas a falar com a Ana que ainda não deixaram contacto.</p>
        </div>
        {!loading && !error && <span style={{ fontSize: 12, color: "#AAA" }}>{items.length} conversa{items.length !== 1 ? "s" : ""}</span>}
      </div>

      {loading ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "#999", fontSize: 14 }}>A carregar…</div>
      ) : error ? (
        <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 12, padding: "12px 16px", fontSize: 13 }}>{error}</div>
      ) : items.length === 0 ? (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", padding: "60px", textAlign: "center", color: "#CCC", fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
          Ainda não há conversas ativas.
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB" }}>
          {items.map((c, i) => (
            <div key={c.contact_id} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
              borderBottom: i < items.length - 1 ? "1px solid #F5F5F5" : "none",
              borderRadius: `${i === 0 ? "16px 16px" : "0 0"} ${i === items.length - 1 ? "16px 16px" : "0 0"}`,
            }}>
              <Avatar name={label(c.contact_id)} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`ID: ${c.contact_id}`}>{label(c.contact_id)}</div>
                <div style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{c.lastMessage || "—"}</div>
              </div>
              <span style={{ fontSize: 12, color: "#CCC", flexShrink: 0, whiteSpace: "nowrap" }}>{relTime(c.lastTimestamp)}</span>
              {isSubscriber(c.contact_id) && <AnaToggle subscriberId={String(c.contact_id)} initialActive={c.active} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
