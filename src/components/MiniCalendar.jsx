import { useState, useRef, useEffect } from "react";
import { GOLD } from "../constants";

export default function MiniCalendar({ meetings, onDelete }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const start = firstDay === 0 ? 6 : firstDay - 1;

  const [openDay, setOpenDay] = useState(null);
  const calRef = useRef(null);
  useEffect(() => {
    const h = e => { if (calRef.current && !calRef.current.contains(e.target)) setOpenDay(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const days = [];
  for (let i = 0; i < start; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthName = today.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  return (
    <div ref={calRef}>
      <p style={{ fontSize: 12, color: "#888", textTransform: "capitalize", margin: "0 0 12px", fontWeight: 500 }}>{monthName}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 16 }}>
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => (
          <div key={d} style={{ fontSize: 10, color: "#AAA", textAlign: "center", padding: "0 0 4px", fontWeight: 600 }}>{d}</div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isToday = d === today.getDate();
          const dayMeetings = meetings.filter(m => m.date === dateStr);
          const hasMeeting = dayMeetings.length > 0;
          const isOpen = openDay === dateStr;
          return (
            <div key={d}
              onClick={hasMeeting ? (e) => { e.stopPropagation(); setOpenDay(isOpen ? null : dateStr); } : undefined}
              style={{
                aspectRatio: "1", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", borderRadius: 8,
                background: isToday ? "#111" : (isOpen ? "#F0EDE6" : "transparent"),
                position: "relative", cursor: hasMeeting ? "pointer" : "default",
              }}>
              <span style={{ fontSize: 12, color: isToday ? "white" : hasMeeting ? "#111" : "#555", fontWeight: isToday || hasMeeting ? 700 : 400 }}>{d}</span>
              {hasMeeting && !isToday && (
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: GOLD, position: "absolute", bottom: 3 }} />
              )}
              {isOpen && hasMeeting && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
                  zIndex: 50, background: "white", borderRadius: 10, width: 190, cursor: "default",
                  boxShadow: "0 8px 28px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)", padding: 6,
                }}>
                  {dayMeetings.map(m => (
                    <div key={m.id} style={{ padding: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0 }}>{m.name}</p>
                      <p style={{ fontSize: 11, color: "#888", margin: "2px 0 8px" }}>{m.type} · {m.time}</p>
                      <button onClick={() => { onDelete && onDelete(m.id); setOpenDay(null); }} style={{
                        fontSize: 11, color: "white", background: "#DC2626", border: "none",
                        borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 600,
                      }}>Apagar</button>
                    </div>
                  ))}
                </div>
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
