import { useState, useEffect } from "react";
import * as api from "../api";

// Green = Ana ON (responds). Off (grey) = silenced (ManyChat 'Humano' tag).
// If `initialActive` is provided it's used directly; otherwise the state is
// fetched on mount. On a failed toggle the visual state reverts + shows an error.
export default function AnaToggle({ subscriberId, initialActive }) {
  const [active, setActive] = useState(initialActive ?? true);
  const [loading, setLoading] = useState(initialActive === undefined);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (initialActive !== undefined) { setActive(initialActive); return; }
    let alive = true;
    api.getAnaState(subscriberId)
      .then((s) => { if (alive) setActive(!!s.active); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [subscriberId, initialActive]);

  const toggle = async (e) => {
    e?.stopPropagation?.();
    if (loading || pending) return;
    const next = !active;
    setActive(next);
    setPending(true);
    setErr(false);
    try {
      await api.setAnaState(subscriberId, next);
    } catch {
      setActive(!next); // revert
      setErr(true);
      setTimeout(() => setErr(false), 2500);
    } finally {
      setPending(false);
    }
  };

  const on = active;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
      <span style={{ fontSize: 11, color: err ? "#DC2626" : "#888", whiteSpace: "nowrap" }}>
        {err ? "Erro, tenta de novo" : "Ana ativa"}
      </span>
      <button
        onClick={toggle}
        disabled={loading || pending}
        title="Ligar/silenciar a Ana para este contacto"
        style={{
          width: 38, height: 22, borderRadius: 22, border: "none", padding: 0,
          background: loading ? "#E5E5E5" : on ? "#16A34A" : "#CFCFCF",
          position: "relative", flexShrink: 0,
          cursor: loading || pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1, transition: "background 0.15s",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18,
          borderRadius: "50%", background: "white", transition: "left 0.15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }} />
      </button>
    </div>
  );
}
