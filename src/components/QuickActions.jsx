import { isValidEmail, isValidPhone, emailHref, emailOpensNewTab } from "../utils";
import { t } from "../labels";

// `size` defaults to 32 (desktop, unchanged); mobile rows pass 40 for a larger
// touch target.
export default function QuickActions({ lead, size = 32 }) {
  const phoneOk = isValidPhone(lead.phone);
  const emailOk = isValidEmail(lead.email);
  const btnBase = {
    width: size, height: size, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    textDecoration: "none", fontSize: 14, flexShrink: 0,
  };

  // No valid contact — subtle disabled placeholder, never a broken button
  if (!phoneOk && !emailOk) {
    return <span style={{ fontSize: 12, color: "#CCC" }}>—</span>;
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {phoneOk && (
        <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} title={t("act_call")}
          style={{ ...btnBase, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>📞</a>
      )}
      {phoneOk && (
        <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()} title={t("act_whatsapp")}
          style={{ ...btnBase, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>💬</a>
      )}
      {emailOk && (
        <a href={emailHref(lead.email)} {...(emailOpensNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} onClick={e => e.stopPropagation()} title={t("act_email")}
          style={{ ...btnBase, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>✉️</a>
      )}
    </div>
  );
}
