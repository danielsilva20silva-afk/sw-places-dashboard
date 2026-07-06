import { GOLD } from "../constants";
import { cleanField, relDate } from "../utils";

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
        <span style={{
          fontSize: 10, fontWeight: 600, color: "#8A6D2F", background: GOLD + "22",
          borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap",
        }}>{source}</span>
      )}
      {(meta || source) && <span style={{ color: "#DDD", fontSize: 10 }}>•</span>}
      <span style={{ fontSize: 12, color: "#CCC" }}>{relDate(lead.date)}</span>
    </div>
  );
}
