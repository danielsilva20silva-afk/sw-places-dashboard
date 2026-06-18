import { useState, useRef, useEffect } from "react";
import { STATUSES, STATUS_CONFIG, GOLD } from "../constants";
import StatusPill from "./StatusPill";

export default function StatusDropdown({ status, onChange }) {
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
