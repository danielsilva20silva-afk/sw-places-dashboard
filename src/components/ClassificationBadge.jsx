import { CLASSIFICATION_CONFIG } from "../constants";
import { t } from "../labels";

// Compact colored A/B/C pill for lead rows. Renders nothing when unset, so it can
// be dropped into a row unconditionally.
export default function ClassificationBadge({ value }) {
  const c = CLASSIFICATION_CONFIG[value];
  if (!c) return null;
  return (
    <span title={t("cls_" + value)} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 18, height: 18, padding: "0 5px", borderRadius: 5,
      fontSize: 11, fontWeight: 700, lineHeight: 1,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, flexShrink: 0,
    }}>{value}</span>
  );
}
