import { useState } from "react";
import { createPortal } from "react-dom";
import { groupActions, splitLocal } from "../actions";
import { t } from "../labels";
import DueBadge from "./DueBadge";
import ActionForm from "./ActionForm";

// Dashboard "Actions" card: Today / Overdue lists (overdue is visually loud) and
// a count of upcoming actions this week. Lead actions open that lead's drawer;
// general tasks (no lead) open an edit/complete popover. `items` is a flat
// [{ action, lead }] of pending actions (lead null = general task); grouped here.

const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 };

// Subtle "Task" tag shown instead of a lead name for general (lead-less) tasks.
function TaskTag() {
  return (
    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.3px", textTransform: "uppercase", color: "#6B7280", background: "#F3F4F6", borderRadius: 6, padding: "1px 6px" }}>
      {t("na_task_tag")}
    </span>
  );
}

function Row({ item, onOpenLead, onOpenTask }) {
  const { action, lead } = item;
  const isTask = !lead;
  return (
    <button
      type="button"
      onClick={() => (isTask ? onOpenTask(action) : onOpenLead(lead))}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
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

// Edit / complete / delete popover for a general task (portaled to <body>).
function TaskPopover({ action, onComplete, onEdit, onDelete, onClose }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", background: "white", borderRadius: 16, width: "100%", maxWidth: 380, boxShadow: "0 12px 48px rgba(0,0,0,0.2)", padding: 16 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <TaskTag />
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

export default function ActionsCard({ items, onOpenLead, onCreateTask, onComplete, onEdit, onDelete }) {
  const { overdue, today, week } = groupActions(items);
  const empty = overdue.length === 0 && today.length === 0;
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [openTask, setOpenTask] = useState(null);

  const handleCreate = async (fields) => {
    const r = await onCreateTask(fields);
    if (r?.ok) { setAdding(false); setNotice(r.calendarFailed ? t("na_cal_failed") : ""); }
    return r;
  };
  // Completing/deleting from the popover: close it once the parent confirms.
  const completeFromPopover = async (a) => { const r = await onComplete(a.id); if (r?.ok !== false) setOpenTask(null); return r; };
  const deleteFromPopover = async (id) => { const r = await onDelete(id); if (r?.ok) setOpenTask(null); return r; };

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", marginBottom: 20 }}>
      <div style={{ padding: "16px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{t("na_card_title")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {week.length > 0 && <span style={{ fontSize: 12, color: "#888" }}>+{week.length} {t("week_suffix")}</span>}
          <button type="button" onClick={() => setAdding((v) => !v)} style={{ ...linkBtn, color: "#8A6D2F", fontSize: 13 }}>{t("na_add_task")}</button>
        </div>
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
            <ActionForm submitLabel={t("na_task_new")} showCalendarOption onCancel={() => setAdding(false)} onSubmit={handleCreate} />
          </div>
        )}
        {empty ? (
          !adding && <div style={{ padding: "22px 4px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>{t("na_all_clear")}</div>
        ) : (
          <>
            <Section title={t("na_overdue")} color="#B91C1C" dot="#EF4444" items={overdue} onOpenLead={onOpenLead} onOpenTask={setOpenTask} />
            <Section title={t("na_today")} color="#B45309" dot="#F59E0B" items={today} onOpenLead={onOpenLead} onOpenTask={setOpenTask} />
          </>
        )}
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
