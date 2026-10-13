import { useState } from "react";
import { t } from "../labels";
import ClassificationBadge from "./ClassificationBadge";

// Dashboard "Due today" panel (brandon only, gated by the caller on the
// followupCadence flag). Lists leads due today or overdue — derived, never stored.
// `items` is a pre-sorted [{ lead, fu }] (overdue first, then A/B/C, then classify).
// Clicking a row opens the lead drawer. With a large backlog the card stays
// compact: it shows the first PREVIEW rows by default and a count summary in the
// header, expanding to a scrollable full list on demand.
const PREVIEW = 15;

function Row({ item, onOpenLead }) {
  const { lead, fu } = item;
  const label = fu.isOverdue ? `${fu.daysOverdue}d ${t("fu_overdue_suffix")}` : t("fu_today");
  return (
    <button
      type="button"
      onClick={() => onOpenLead(lead)}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        background: "none", border: "none", cursor: "pointer", padding: "9px 4px", borderRadius: 8,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 600, color: "#111" }}>
        {lead.name || "—"}
      </span>
      <ClassificationBadge value={lead.classification} />
      {fu.reason === "classify" && (
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.3px", textTransform: "uppercase", color: "#6B7280", background: "#F3F4F6", borderRadius: 6, padding: "1px 6px" }}>
          {t("fu_classify")}
        </span>
      )}
      <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: fu.isOverdue ? "#DC2626" : "#B45309" }}>
        {label}
      </span>
    </button>
  );
}

export default function DueTodayCard({ items, onOpenLead }) {
  const list = items || [];
  const [expanded, setExpanded] = useState(false); // collapsed on every load
  const overdueCount = list.filter((it) => it.fu.isOverdue).length;
  const todayCount = list.length - overdueCount; // dueToday and overdue are exclusive
  const shown = expanded ? list : list.slice(0, PREVIEW);
  const hasMore = list.length > PREVIEW;

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", marginBottom: 20 }}>
      <div style={{ padding: "16px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{t("fu_due_today_title")}</p>
        {list.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ color: "#DC2626" }}>{overdueCount} {t("fu_overdue_suffix")}</span>
            <span style={{ color: "#CBD5E1" }}>·</span>
            <span style={{ color: "#888" }}>{todayCount} {t("fu_today")}</span>
          </span>
        )}
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        {list.length === 0 ? (
          <div style={{ padding: "16px 4px", color: "#9CA3AF", fontSize: 13 }}>{t("fu_empty")}</div>
        ) : (
          <>
            <div style={expanded ? { maxHeight: "60vh", overflowY: "auto" } : undefined}>
              {shown.map((it) => <Row key={String(it.lead.id)} item={it} onOpenLead={onOpenLead} />)}
            </div>
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{ marginTop: 8, marginLeft: 4, background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#8A6D2F" }}
              >
                {expanded ? t("fu_show_less") : `${t("fu_show_all")} (${list.length})`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
