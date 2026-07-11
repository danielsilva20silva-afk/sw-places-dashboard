import { GOLD } from "../constants";
import { cleanField, leadWhen } from "../utils";

// Subtitle line for a lead: valid budget/intention fields, then the source as a
// small origin tag, then the date. Empty or "{{...}}" placeholder values are
// dropped, so raw placeholders are never shown.
export default function LeadMeta({ lead }) {
  const meta = [cleanField(lead.budget), cleanField(lead.intention)].filter(Boolean).join(" · ");
  const source = cleanField(lead.source);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
      {meta && <span style={{ fontSize: 12, color: "#888" }}>{meta}</span>}
      {source && (
        <span title={source} style={{
          fontSize: 10, fontWeight: 600, color: "#8A6D2F", background: GOLD + "22",
          borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
          // Long sources (e.g. "Meta Ads · …") truncate instead of overflowing
          // the row and colliding with the status badge / action buttons.
          // minWidth:0 defeats the flex-item min-width:auto that would otherwise
          // keep the nowrap text at full width and break the ellipsis.
          minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box",
        }}>{source}</span>
      )}
      {(meta || source) && <span style={{ color: "#DDD", fontSize: 10 }}>•</span>}
      <span style={{ fontSize: 12, color: "#CCC" }}>{leadWhen(lead)}</span>
    </div>
  );
}
