export default function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", border: "1px solid #EBEBEB", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", fontSize: 13 }}>
      <p style={{ color: "#888", margin: "0 0 4px", fontSize: 11 }}>{label}</p>
      <p style={{ color: "#111", fontWeight: 700, margin: 0 }}>{payload[0].value} lead{payload[0].value !== 1 ? "s" : ""}</p>
    </div>
  );
}
