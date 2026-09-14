import DueBadge from "./DueBadge";

// Compact "Next action" cell for the leads list: soonest pending action's title
// (truncated) over its colored due badge; an em-dash when there's none.
export default function NextActionCell({ next, maxWidth = 170 }) {
  if (!next) return <span style={{ color: "#DDD", fontSize: 13 }}>—</span>;
  return (
    <div style={{ minWidth: 0, maxWidth }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={next.title}>
        {next.title}
      </div>
      <DueBadge dueISO={next.due_at} size={11} />
    </div>
  );
}
