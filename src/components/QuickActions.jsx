export default function QuickActions({ lead }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} title="Ligar" style={{
        width: 32, height: 32, borderRadius: 8, background: "#F0FDF4",
        display: "flex", alignItems: "center", justifyContent: "center",
        textDecoration: "none", fontSize: 14, border: "1px solid #BBF7D0", flexShrink: 0,
      }}>📞</a>
      <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
        onClick={e => e.stopPropagation()} title="WhatsApp" style={{
          width: 32, height: 32, borderRadius: 8, background: "#F0FDF4",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", fontSize: 14, border: "1px solid #BBF7D0", flexShrink: 0,
        }}>💬</a>
    </div>
  );
}
