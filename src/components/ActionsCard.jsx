import { groupActions } from "../actions";
import { t } from "../labels";
import DueBadge from "./DueBadge";

// Dashboard "Actions" card: Today / Overdue lists (overdue is visually loud) and
// a count of upcoming actions this week. Each item opens that lead's drawer.
// `items` is a flat [{ action, lead }] of pending actions; grouped here.
function Row({ item, onOpenLead }) {
  const { action, lead } = item;
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
      <span style={{ flexShrink: 0 }}><DueBadge dueISO={action.due_at} size={11} /></span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
        <span style={{ fontWeight: 600, color: "#111" }}>{lead?.name || "—"}</span>
        <span style={{ color: "#888" }}> — {action.title}</span>
      </span>
    </button>
  );
}

function Section({ title, color, dot, items, onOpenLead }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 4px 4px" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color }}>{title}</span>
        <span style={{ fontSize: 11, color: "#BBB" }}>{items.length}</span>
      </div>
      {items.map((it) => <Row key={it.action.id} item={it} onOpenLead={onOpenLead} />)}
    </div>
  );
}

export default function ActionsCard({ items, onOpenLead }) {
  const { overdue, today, week } = groupActions(items);
  const empty = overdue.length === 0 && today.length === 0;

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", marginBottom: 20 }}>
      <div style={{ padding: "16px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{t("na_card_title")}</p>
        {week.length > 0 && (
          <span style={{ fontSize: 12, color: "#888" }}>+{week.length} {t("week_suffix")}</span>
        )}
      </div>
      <div style={{ padding: "0 16px 14px" }}>
        {empty ? (
          <div style={{ padding: "22px 4px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>{t("na_all_clear")}</div>
        ) : (
          <>
            <Section title={t("na_overdue")} color="#B91C1C" dot="#EF4444" items={overdue} onOpenLead={onOpenLead} />
            <Section title={t("na_today")} color="#B45309" dot="#F59E0B" items={today} onOpenLead={onOpenLead} />
          </>
        )}
      </div>
    </div>
  );
}
