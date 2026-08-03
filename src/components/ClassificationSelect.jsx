import { CLASSIFICATIONS, CLASSIFICATION_CONFIG } from "../constants";

// A/B/C selector for the LeadDrawer, with a Limpar (clear) action. Clicking the
// active option also clears it. `value` is "A" | "B" | "C" | "".
export default function ClassificationSelect({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {CLASSIFICATIONS.map((k) => {
        const c = CLASSIFICATION_CONFIG[k];
        const active = value === k;
        return (
          <button key={k} onClick={() => onChange(active ? "" : k)} style={{
            padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            border: `1.5px solid ${active ? c.dot : "#E5E5E5"}`,
            background: active ? c.bg : "white",
            color: active ? c.text : "#555", cursor: "pointer",
          }}>{c.emoji} {c.label}</button>
        );
      })}
      {value && (
        <button onClick={() => onChange("")} style={{
          padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
          border: "1.5px solid #E5E5E5", background: "white", color: "#888", cursor: "pointer",
        }}>Limpar</button>
      )}
    </div>
  );
}
