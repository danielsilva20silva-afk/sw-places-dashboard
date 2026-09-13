import { dueState, DUE_COLORS } from "../actions";
import { relDate } from "../utils";
import { t } from "../labels";

// Colored due label for an action: "Hoje, 10:00" / "14 set, 10:00", tinted by
// due state (overdue red · today amber · future neutral).
export default function DueBadge({ dueISO, size = 12 }) {
  const color = DUE_COLORS[dueState(dueISO)];
  const d = new Date(dueISO);
  const time = isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(t("date_locale"), { hour: "2-digit", minute: "2-digit" });
  const day = relDate(dueISO);
  return (
    <span style={{ color, fontWeight: 600, fontSize: size, whiteSpace: "nowrap" }}>
      {day}{time ? `, ${time}` : ""}
    </span>
  );
}
