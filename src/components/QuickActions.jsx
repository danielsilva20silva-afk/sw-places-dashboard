import { isValidEmail, isValidPhone } from "../utils";

const btnBase = {
  width: 32, height: 32, borderRadius: 8,
  display: "flex", alignItems: "center", justifyContent: "center",
  textDecoration: "none", fontSize: 14, flexShrink: 0,
};

export default function QuickActions({ lead }) {
  const phoneOk = isValidPhone(lead.phone);
  const emailOk = isValidEmail(lead.email);

  // No valid contact — subtle disabled placeholder, never a broken button
  if (!phoneOk && !emailOk) {
    return <span style={{ fontSize: 12, color: "#CCC" }}>—</span>;
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {phoneOk && (
        <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} title="Ligar"
          style={{ ...btnBase, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>📞</a>
      )}
      {phoneOk && (
        <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()} title="WhatsApp"
          style={{ ...btnBase, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>💬</a>
      )}
      {emailOk && (
        <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} title="Email"
          style={{ ...btnBase, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>✉️</a>
      )}
    </div>
  );
}
