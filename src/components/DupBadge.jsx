import { GOLD } from "../constants";
import { t } from "../labels";

// Discreet row indicator for the dedupe feature. Renders nothing unless the
// (enriched) lead carries a dedupe flag, so rows for clients without the feature
// — or leads with no duplicate — are untouched.
//   • merged primary  → 🔗 gold, tooltip "Merged (N)"  (N = total records)
//   • possible dupe    → ⧉ amber, tooltip "Possible duplicate"
export default function DupBadge({ lead }) {
  if (lead && lead.__mergedCount) {
    return (
      <span
        title={`${t("merged_badge")} (${lead.__mergedCount + 1})`}
        aria-label={t("merged_badge")}
        style={{ fontSize: 11, color: GOLD, flexShrink: 0 }}
      >
        🔗
      </span>
    );
  }
  if (lead && lead.__dupCandidate) {
    return (
      <span
        title={t("dup_badge")}
        aria-label={t("dup_badge")}
        style={{ fontSize: 12, color: "#C2871F", fontWeight: 700, flexShrink: 0, lineHeight: 1 }}
      >
        ⧉
      </span>
    );
  }
  return null;
}
