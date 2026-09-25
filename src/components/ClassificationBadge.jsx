import { CLASSIFICATION_CONFIG } from "../constants";
import { t } from "../labels";

// Compact colored A/B/C pill for lead rows. Renders nothing when unset, so it can
// be dropped into a row unconditionally.
//   • confirmed (value set)                    → SOLID pill (filled background).
//   • suggested (no value, `suggested` given)  → HOLLOW/outlined pill (transparent
//     background, dashed border) so a suggestion reads faint vs a confirmed one.
export default function ClassificationBadge({ value, suggested }) {
  const key = value || suggested || null;
  const c = CLASSIFICATION_CONFIG[key];
  if (!c) return null;
  const isSuggest = !value && !!suggested;
  const title = isSuggest ? `${t("cls_suggested")}: ${t("cls_" + key)}` : t("cls_" + key);
  return (
    <span title={title} aria-label={title} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 18, height: 18, padding: "0 5px", borderRadius: 5,
      fontSize: 11, fontWeight: 700, lineHeight: 1,
      background: isSuggest ? "transparent" : c.bg,
      color: c.text,
      border: `1px ${isSuggest ? "dashed" : "solid"} ${c.border}`,
      opacity: isSuggest ? 0.9 : 1,
      flexShrink: 0,
    }}>{key}</span>
  );
}
