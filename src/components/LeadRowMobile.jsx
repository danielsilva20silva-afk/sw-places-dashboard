import { GOLD } from "../constants";
import { cleanField } from "../utils";
import Avatar from "./Avatar";
import LeadMeta from "./LeadMeta";
import ClassificationBadge from "./ClassificationBadge";
import DupBadge from "./DupBadge";
import DueBadge from "./DueBadge";
import StatusDropdown from "./StatusDropdown";
import QuickActions from "./QuickActions";

const AV = 40;   // avatar size (also touch-target baseline)
const GAP = 12;  // avatar → text gap; line 2 is indented by AV + GAP to align.

// Stacked lead row for narrow screens (<640px). Shared by the Leads tab and the
// dashboard "Recent leads" list so both get the same treatment.
//   Line 1: avatar + name (+ classification badge, + optional 📝) | status pill
//   Line 2: source/date (LeadMeta) | quick actions
// `style` carries the per-list border/rounding so edges match each card.
export default function LeadRowMobile({ lead, onOpen, onStatusChange, showNotesIcon = false, nextAction = null, style }) {
  const stop = (e) => e.stopPropagation();
  return (
    <div
      onClick={() => onOpen(lead)}
      style={{ padding: "12px 16px", cursor: "pointer", ...style }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Line 1: avatar + name/badge + status pill */}
      <div style={{ display: "flex", alignItems: "center", gap: GAP }}>
        <Avatar name={lead.name} size={AV} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{lead.name}</span>
          <ClassificationBadge value={lead.classification} />
          {showNotesIcon && cleanField(lead.notes) && (
            <span title={cleanField(lead.notes)} style={{ fontSize: 11, color: GOLD, flexShrink: 0 }}>📝</span>
          )}
          <DupBadge lead={lead} />
        </div>
        <div onClick={stop} style={{ flexShrink: 0, maxWidth: "45%" }}>
          <StatusDropdown status={lead.status} onChange={(s) => onStatusChange(lead, s)} compact />
        </div>
      </div>

      {/* Line 2: source/date (left) + quick actions (right) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8, paddingLeft: AV + GAP }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <LeadMeta lead={lead} />
        </div>
        <div onClick={stop} style={{ flexShrink: 0 }}>
          <QuickActions lead={lead} size={40} />
        </div>
      </div>

      {/* Line 3 (only when a pending action exists): next action title + due. */}
      {nextAction && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, paddingLeft: AV + GAP, minWidth: 0 }}>
          <span aria-hidden="true" style={{ fontSize: 11, flexShrink: 0 }}>⏰</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }} title={nextAction.title}>{nextAction.title}</span>
          <DueBadge dueISO={nextAction.due_at} size={11} />
        </div>
      )}
    </div>
  );
}
