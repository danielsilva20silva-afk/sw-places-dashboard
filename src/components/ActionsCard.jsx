import { useState } from "react";
import { createPortal } from "react-dom";
import { partitionActions, byCalendarDay, splitLocal } from "../actions";
import { t } from "../labels";
import DueBadge from "./DueBadge";
import ActionForm from "./ActionForm";

// Dashboard "what's next" surface: two side-by-side cards (stacked on mobile).
//   • Today    — Overdue (loud red, on top) + due today.
//   • Upcoming — pending due after today, grouped by day, capped with "+N more".
// Lead actions open that lead's drawer; general tasks (no lead) open an edit/
// complete popover. `items` is a flat [{ action, lead }] (lead null = task).

const UPCOMING_CAP = 10;
const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 };

function TaskTag() {
  return (
    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.3px", textTransform: "uppercase", color: "#6B7280", background: "#F3F4F6", borderRadius: 6, padding: "1px 6px" }}>
      {t("na_task_tag")}
    </span>
  );
}

// Small "created a calendar event for this" indicator. Not a live-sync signal —
// see the v1 limitation note in the branch (event deleted in Google → indicator
// stays, nothing breaks).
function CalIndicator({ action }) {
  if (!action.calendar_event_id) return null;
  return <span title={t("na_cal_indicator")} aria-label={t("na_cal_indicator")} style={{ flexShrink: 0, fontSize: 11 }}>📅</span>;
}

function Row({ item, onOpenLead, onOpenTask }) {
  const { action, lead } = item;
  const isTask = !lead;
  return (
    <button
      type="button"
      onClick={() => (isTask ? onOpenTask(action) : onOpenLead(lead))}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
        background: "none", border: "none", cursor: "pointer", padding: "9px 4px", borderRadius: 8,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      <span style={{ flexShrink: 0 }}><DueBadge dueISO={action.due_at} size={11} /></span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
        {isTask ? (
          <span style={{ color: "#111", fontWeight: 600 }}>{action.title}</span>
        ) : (
          <>
            <span style={{ fontWeight: 600, color: "#111" }}>{lead?.name || "—"}</span>
            <span style={{ color: "#888" }}> — {action.title}</span>
          </>
        )}
      </span>
      <CalIndicator action={action} />
      {isTask && <TaskTag />}
    </button>
  );
}

function Section({ title, color, dot, items, onOpenLead, onOpenTask }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 4px 4px" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color }}>{title}</span>
        <span style={{ fontSize: 11, color: "#BBB" }}>{items.length}</span>
      </div>
      {items.map((it) => <Row key={it.action.id} item={it} onOpenLead={onOpenLead} onOpenTask={onOpenTask} />)}
    </div>
  );
}

// Human day heading for the Upcoming card: "Tomorrow" then a formatted date.
function dayLabel(dayStart) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  if (dayStart === t0.getTime() + 86400000) return t("na_tomorrow");
  return new Date(dayStart).toLocaleDateString(t("date_locale"), { weekday: "short", day: "numeric", month: "short" });
}

const cardStyle = { flex: "1 1 280px", minWidth: 0, background: "white", borderRadius: 16, border: "1px solid #EBEBEB", display: "flex", flexDirection: "column" };
const cardTitle = { fontSize: 14, fontWeight: 700, color: "#111", margin: 0 };

// Edit / complete / delete popover for a general task (portaled to <body>).
function TaskPopover({ action, onComplete, onEdit, onDelete, onClose }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", background: "white", borderRadius: 16, width: "100%", maxWidth: 380, boxShadow: "0 12px 48px rgba(0,0,0,0.2)", padding: 16 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <TaskTag />
            <CalIndicator action={action} />
            <button type="button" onClick={() => onComplete(action)} style={{ ...linkBtn, color: "#15803D", fontSize: 13 }}>✓ {t("na_complete")}</button>
          </div>
          <button type="button" onClick={onClose} style={{ background: "#F5F5F5", border: "none", borderRadius: 8, width: 26, height: 26, fontSize: 15, color: "#888", cursor: "pointer" }} aria-label={t("na_cancel")}>×</button>
        </div>
        <ActionForm
          initial={{ title: action.title, description: action.description, ...splitLocal(action.due_at) }}
          submitLabel={t("na_save")}
          showChips={false}
          onCancel={onClose}
          onSubmit={async (fields) => {
            const r = await onEdit(action.id, fields);
            if (r?.ok) onClose();
            return r;
          }}
        />
        <button type="button" onClick={() => onDelete(action.id)} style={{ ...linkBtn, color: "#DC2626", marginTop: 12 }}>🗑 {t("na_delete")}</button>
      </div>
    </div>,
    document.body
  );
}

export default function ActionsCard({ items, leads, onOpenLead, onCreateTask, onComplete, onEdit, onDelete }) {
  const { overdue, today, upcoming } = partitionActions(items);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [openTask, setOpenTask] = useState(null);

  const handleCreate = async (fields) => {
    const r = await onCreateTask(fields);
    if (r?.ok) { setAdding(false); setNotice(r.calendarFailed ? t("na_cal_failed") : ""); }
    return r;
  };
  const completeFromPopover = async (a) => { const r = await onComplete(a.id); if (r?.ok !== false) setOpenTask(null); return r; };
  const deleteFromPopover = async (id) => { const r = await onDelete(id); if (r?.ok) setOpenTask(null); return r; };

  const todayEmpty = overdue.length === 0 && today.length === 0;
  const shown = upcoming.slice(0, UPCOMING_CAP);
  const groups = byCalendarDay(shown);
  const moreCount = upcoming.length - shown.length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20, alignItems: "flex-start" }}>
      {/* ── Today ── (Overdue loud on top, then due today) */}
      <div style={cardStyle}>
        <div style={{ padding: "16px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <p style={cardTitle}>{t("na_today")}</p>
          <button type="button" onClick={() => setAdding((v) => !v)} style={{ ...linkBtn, color: "#8A6D2F", fontSize: 13 }}>{t("na_add_task")}</button>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          {notice && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#92400E", margin: "4px 4px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>⚠️ {notice}</span>
              <button type="button" onClick={() => setNotice("")} style={{ ...linkBtn, color: "#92400E" }} aria-label={t("na_cancel")}>×</button>
            </div>
          )}
          {adding && (
            <div style={{ margin: "4px 4px 12px" }}>
              <ActionForm submitLabel={t("na_task_new")} showCalendarOption allowLeadPick leads={leads} onCancel={() => setAdding(false)} onSubmit={handleCreate} />
            </div>
          )}
          {todayEmpty ? (
            !adding && <div style={{ padding: "22px 4px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>{t("na_all_clear")}</div>
          ) : (
            <>
              <Section title={t("na_overdue")} color="#B91C1C" dot="#EF4444" items={overdue} onOpenLead={onOpenLead} onOpenTask={setOpenTask} />
              <Section title={t("na_today")} color="#B45309" dot="#F59E0B" items={today} onOpenLead={onOpenLead} onOpenTask={setOpenTask} />
            </>
          )}
        </div>
      </div>

      {/* ── Upcoming ── (after today, grouped by day, capped) */}
      <div style={cardStyle}>
        <div style={{ padding: "16px 20px 8px" }}>
          <p style={cardTitle}>{t("na_upcoming")}</p>
        </div>
        <div style={{ padding: "0 16px 14px" }}>
          {upcoming.length === 0 ? (
            <div style={{ padding: "22px 4px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>{t("na_upcoming_empty")}</div>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.dayStart}>
                  <div style={{ padding: "10px 4px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "#6B7280" }}>{dayLabel(g.dayStart)}</div>
                  {g.items.map((it) => <Row key={it.action.id} item={it} onOpenLead={onOpenLead} onOpenTask={setOpenTask} />)}
                </div>
              ))}
              {moreCount > 0 && (
                <div style={{ padding: "10px 4px 2px", fontSize: 12, color: "#9CA3AF" }}>+{moreCount} {t("na_more_suffix")}</div>
              )}
            </>
          )}
        </div>
      </div>

      {openTask && (
        <TaskPopover
          action={openTask}
          onComplete={completeFromPopover}
          onEdit={onEdit}
          onDelete={deleteFromPopover}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  );
}
