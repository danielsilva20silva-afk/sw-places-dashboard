import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { STATUSES, STATUS_CONFIG, GOLD } from "../constants";
import StatusPill from "./StatusPill";

const MENU_WIDTH = 180;
const EST_ROW_H = 37; // approximate height of one option, for flip detection

export default function StatusDropdown({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  // Compute a viewport-fixed position from the trigger's rect, flipping up
  // when there isn't enough room below and clamping inside the viewport.
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuH = STATUSES.length * EST_ROW_H + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < menuH + 8 && rect.top > spaceBelow;
    const top = flipUp ? Math.max(8, rect.top - menuH - 6) : rect.bottom + 6;
    let left = rect.left;
    if (left + MENU_WIDTH > window.innerWidth - 8) left = rect.right - MENU_WIDTH;
    left = Math.max(8, left);
    setCoords({ top, left });
  };

  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    place();
    setOpen(true);
  };

  // Close on outside click, on any scroll, and on resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true); // capture → catches nested scroll containers
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} onClick={toggle} style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        background: "none", border: "none", cursor: "pointer", padding: 0,
      }}>
        <StatusPill status={status} small />
        <span style={{ fontSize: 9, color: "#AAA" }}>▾</span>
      </button>
      {open && coords && createPortal(
        <div ref={menuRef} onClick={e => e.stopPropagation()} style={{
          position: "fixed", top: coords.top, left: coords.left, zIndex: 1000,
          background: "white", borderRadius: 12, width: MENU_WIDTH,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid #F0F0F0",
          overflow: "hidden",
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
        </div>,
        document.body
      )}
    </>
  );
}
