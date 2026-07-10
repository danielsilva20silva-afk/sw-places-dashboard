import { useState, useEffect, useRef } from "react";
import { GOLD } from "../constants";
import { ymd, addMonths, startOfWeekMon, addDays, WEEKDAYS_PT, monthTitle, p2 } from "../calendarUtils";

// Custom date (+ optional time) picker, styled to the dashboard. Expands inline
// below its trigger (no native widget, no clipping inside the modal). Value is a
// Date; onChange receives a new Date. withTime=false → date only (all-day).
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

const navBtn = { width: 28, height: 28, border: "1px solid #E5E5E5", background: "white", borderRadius: 8, cursor: "pointer", color: "#555", fontSize: 14, fontWeight: 700, lineHeight: 1 };
const colStyle = { maxHeight: 140, overflowY: "auto", border: "1px solid #F0F0F0", borderRadius: 8, display: "flex", flexDirection: "column", gap: 2, padding: 4 };
const timeCell = (sel) => ({ border: "none", borderRadius: 6, padding: "8px 0", fontSize: 13, cursor: "pointer", background: sel ? GOLD : "transparent", color: sel ? "#000" : "#333", fontWeight: sel ? 700 : 400, flexShrink: 0 });

export default function DateTimePicker({ value, onChange, withTime = true }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const hourRef = useRef(null);

  // Reset the visible month to the value's month whenever we open.
  useEffect(() => { if (open) setCursor(new Date(value.getFullYear(), value.getMonth(), 1)); }, [open]); // eslint-disable-line
  // Scroll the selected hour into view on open so any hour is reachable.
  useEffect(() => {
    if (open && withTime && hourRef.current) {
      const sel = hourRef.current.querySelector('[data-sel="true"]');
      if (sel) sel.scrollIntoView({ block: "center" });
    }
  }, [open, withTime]);

  const label = withTime
    ? `${value.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}, ${p2(value.getHours())}:${p2(value.getMinutes())}`
    : value.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const pickDay = (d) => { const n = new Date(value); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); onChange(n); };
  const setH = (h) => { const n = new Date(value); n.setHours(h); onChange(n); };
  const setM = (m) => { const n = new Date(value); n.setMinutes(m); onChange(n); };

  const gridStart = startOfWeekMon(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const todayKey = ymd(new Date());
  const selKey = ymd(value);

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center",
        border: `1px solid ${open ? GOLD : "#E5E5E5"}`, borderRadius: 10, padding: "10px 12px",
        fontSize: 13, color: "#111", background: "white", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
      }}>
        <span>{label}</span><span style={{ color: "#AAA", fontSize: 11 }}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, border: "1px solid #EBEBEB", borderRadius: 12, padding: 12, background: "white", boxShadow: "0 8px 28px rgba(0,0,0,0.08)" }}>
          {/* Month header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={() => setCursor((c) => addMonths(c, -1))} style={navBtn} aria-label="Mês anterior">‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111", textTransform: "capitalize" }}>{monthTitle(cursor)}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); pickDay(t); }} style={{ ...navBtn, width: "auto", padding: "0 10px", fontSize: 12 }}>Hoje</button>
              <button type="button" onClick={() => setCursor((c) => addMonths(c, 1))} style={navBtn} aria-label="Mês seguinte">›</button>
            </div>
          </div>
          {/* Weekday row (Mon-first) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 2 }}>
            {WEEKDAYS_PT.map((d) => <div key={d} style={{ fontSize: 10, color: "#AAA", fontWeight: 700, textAlign: "center" }}>{d}</div>)}
          </div>
          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              const isSel = key === selKey;
              return (
                <button type="button" key={i} onClick={() => pickDay(d)} style={{
                  aspectRatio: "1", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12,
                  background: isSel ? GOLD : "transparent",
                  color: isSel ? "#000" : inMonth ? "#333" : "#CCC",
                  fontWeight: isSel || isToday ? 700 : 400,
                  outline: isToday && !isSel ? `1.5px solid ${GOLD}` : "none", outlineOffset: -2,
                }}>{d.getDate()}</button>
              );
            })}
          </div>
          {/* Time */}
          {withTime && (
            <div style={{ display: "flex", gap: 10, marginTop: 10, borderTop: "1px solid #F0F0F0", paddingTop: 10 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 9, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px", fontWeight: 700 }}>Hora</p>
                <div ref={hourRef} style={colStyle}>
                  {HOURS.map((h) => <button type="button" key={h} data-sel={h === value.getHours()} onClick={() => setH(h)} style={timeCell(h === value.getHours())}>{p2(h)}</button>)}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 9, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px", fontWeight: 700 }}>Min</p>
                <div style={colStyle}>
                  {MINUTES.map((m) => <button type="button" key={m} onClick={() => setM(m)} style={timeCell(m === value.getMinutes())}>{p2(m)}</button>)}
                </div>
              </div>
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", marginTop: 10, background: "#111", color: "white", border: "none", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>OK</button>
        </div>
      )}
    </div>
  );
}
