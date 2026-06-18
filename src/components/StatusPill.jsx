import { STATUS_CONFIG } from "../constants";

export default function StatusPill({ status, small }) {
  const c = STATUS_CONFIG[status] || { bg: "#F3F4F6", text: "#6B7280", dot: "#9CA3AF", border: "#E5E7EB" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: small ? "2px 8px" : "4px 10px", borderRadius: 20,
      fontSize: small ? 11 : 12, fontWeight: 600,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}
