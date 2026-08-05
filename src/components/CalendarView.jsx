import { useState, useEffect, useMemo } from "react";
import { GOLD } from "../constants";
import { t } from "../labels";
import * as api from "../api";
import EventModal from "./EventModal";
import {
  ymd, addDays, addMonths, startOfWeekMon, eventDayKey, timeLabel,
  weekdaysShort, monthTitle, eventTitle,
} from "../calendarUtils";

function useIsMobile(bp = 720) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(`(max-width:${bp}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${bp}px)`);
    const h = (e) => setM(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [bp]);
  return m;
}

const HOUR_START = 7, HOUR_END = 22, HOUR_H = 46;
// Primary calendar keeps the gold accent; secondary (read-only) calendars use a
// muted gray so they're visually distinguishable. Consistent across all views.
const GRAY = "#6B7280";
const chipTimed = { background: GOLD + "22", borderLeft: `3px solid ${GOLD}`, color: "#3a2f16" };
const chipTimedSecondary = { background: "#F3F4F6", borderLeft: `3px solid ${GRAY}`, color: "#4B5563" };
const chipAllDay = { background: "#111", color: "white" };
const chipAllDaySecondary = { background: GRAY, color: "white" };
const chipStyleFor = (ev) => ev.allDay
  ? (ev.readOnly ? chipAllDaySecondary : chipAllDay)
  : (ev.readOnly ? chipTimedSecondary : chipTimed);
const accentFor = (ev) => (ev.readOnly ? GRAY : GOLD);

export default function CalendarView({ refreshKey = 0, onChanged }) {
  const isMobile = useIsMobile();
  const [view, setView] = useState("month"); // month | week (week is desktop-only)
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [calErrors, setCalErrors] = useState([]); // per-calendar failures (multi-calendar)
  const [firstLoad, setFirstLoad] = useState(true); // full loading only on the very first fetch
  const [refreshing, setRefreshing] = useState(false); // subtle indicator on later refetches
  const [error, setError] = useState("");
  const [localReload, setLocalReload] = useState(0); // bumped by this calendar's own edits
  const [modal, setModal] = useState(null); // { event } | { prefillDate } | null
  const [selectedDay, setSelectedDay] = useState(() => ymd(new Date())); // mobile agenda

  const effView = isMobile ? "month" : view;

  const range = useMemo(() => {
    if (effView === "week") {
      const start = startOfWeekMon(anchor);
      return { start, end: addDays(start, 7) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeekMon(first);
    return { start: gridStart, end: addDays(gridStart, 42) };
  }, [effView, anchor]);

  useEffect(() => {
    let alive = true;
    setRefreshing(true); setError("");
    api.getCalendarEvents(range.start.toISOString(), range.end.toISOString())
      .then((data) => { if (alive) { setEvents(data.events); setCalErrors(data.errors || []); } })
      .catch((e) => { if (alive) setError(e.message || t("cal_not_connected")); }) // keep existing events on failure
      .finally(() => { if (alive) { setRefreshing(false); setFirstLoad(false); } });
    return () => { alive = false; };
  }, [range.start, range.end, refreshKey, localReload]);

  const byDay = useMemo(() => {
    const m = {};
    for (const ev of events) { (m[eventDayKey(ev)] ||= []).push(ev); }
    for (const k in m) {
      m[k].sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) ||
        (a.allDay ? 0 : new Date(a.start) - new Date(b.start)));
    }
    return m;
  }, [events]);

  // Any create/update/delete refreshes the grid (localReload) AND notifies the
  // parent (onChanged) so the Dashboard notifications refetch too.
  const refetch = () => { setModal(null); setLocalReload((r) => r + 1); onChanged?.(); };
  const goToday = () => { setAnchor(new Date()); setSelectedDay(ymd(new Date())); };
  const step = (dir) => setAnchor((a) => (effView === "week" ? addDays(startOfWeekMon(a), dir * 7) : addMonths(a, dir)));

  const todayKey = ymd(new Date());

  const title = effView === "week"
    ? (() => { const s = startOfWeekMon(anchor), e = addDays(s, 6);
        return `${s.toLocaleDateString(t("date_locale"), { day: "numeric", month: "short" })} – ${e.toLocaleDateString(t("date_locale"), { day: "numeric", month: "short" })}`; })()
    : monthTitle(anchor);

  const btn = (extra) => ({ border: "1px solid #E5E5E5", background: "white", borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer", color: "#555", ...extra });

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", padding: isMobile ? 14 : 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => step(-1)} style={btn({ fontWeight: 700 })} aria-label={t("cal_prev")}>‹</button>
          <button onClick={() => step(1)} style={btn({ fontWeight: 700 })} aria-label={t("cal_next")}>›</button>
          <button onClick={goToday} style={btn()}>{t("today")}</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111", textTransform: "capitalize", marginLeft: 4 }}>{title}</span>
          {refreshing && !firstLoad && <span style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginLeft: 2 }}>{t("cal_updating")}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isMobile && (
            <div style={{ display: "flex", border: "1px solid #E5E5E5", borderRadius: 8, overflow: "hidden" }}>
              {[["month", t("cal_month")], ["week", t("cal_week")]].map(([v, l]) => (
                <button key={v} onClick={() => setView(v)} style={{ border: "none", padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600, background: view === v ? "#111" : "white", color: view === v ? "white" : "#666" }}>{l}</button>
              ))}
            </div>
          )}
          <button onClick={() => setModal({ prefillDate: effView === "month" ? new Date() : anchor })} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{t("cal_new_event")}</button>
        </div>
      </div>

      {/* Legend — only when there are secondary-calendar events to distinguish
          (single-calendar clients like swplaces never show it). */}
      {events.some((e) => e.readOnly) && (
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, color: "#888" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD }} />{t("cal_legend_primary")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: GRAY }} />{t("cal_legend_secondary")}</span>
        </div>
      )}

      {firstLoad && refreshing ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "#999", fontSize: 14 }}>{t("cal_loading")}</div>
      ) : error && events.length === 0 ? (
        <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 12, padding: "14px 16px", fontSize: 13 }}>
          {t("cal_not_connected")}
        </div>
      ) : (
      <>
        {error && (
          <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 10, padding: "10px 14px", fontSize: 12, marginBottom: 12 }}>
            {t("cal_not_connected")} {t("cal_showing_cached")}
          </div>
        )}
        {calErrors.length > 0 && (
          <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 10, padding: "10px 14px", fontSize: 12, marginBottom: 12 }}>
            ⚠️ {t("cal_partial")} {calErrors.map((e) => e.calendarId).join(", ")}
          </div>
        )}
        {isMobile ? (
        <MobileMonth anchor={anchor} byDay={byDay} todayKey={todayKey} selectedDay={selectedDay} setSelectedDay={setSelectedDay} onEvent={(ev) => setModal({ event: ev })} onCreate={(d) => setModal({ prefillDate: d })} />
      ) : effView === "week" ? (
        <WeekGrid anchor={anchor} byDay={byDay} todayKey={todayKey} onEvent={(ev) => setModal({ event: ev })} onCreate={(d) => setModal({ prefillDate: d })} />
      ) : (
        <MonthGrid anchor={anchor} byDay={byDay} todayKey={todayKey} onEvent={(ev) => setModal({ event: ev })} onCreate={(d) => setModal({ prefillDate: d })} />
      )}
      </>
      )}

      {modal && (
        <EventModal
          event={modal.event}
          prefillDate={modal.prefillDate}
          onClose={() => setModal(null)}
          onSaved={refetch}
          onDeleted={refetch}
        />
      )}
    </div>
  );
}

function EventChip({ ev, onClick, compact }) {
  return (
    <div onClick={(e) => { e.stopPropagation(); onClick(ev); }} title={eventTitle(ev)}
      style={{ ...chipStyleFor(ev), borderRadius: 5, padding: compact ? "1px 5px" : "2px 6px", fontSize: 11, lineHeight: 1.3, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginBottom: 2 }}>
      {!ev.allDay && <b style={{ fontWeight: 700, marginRight: 4 }}>{timeLabel(ev)}</b>}{eventTitle(ev)}
    </div>
  );
}

// ── Desktop month grid ──
function MonthGrid({ anchor, byDay, todayKey, onEvent, onCreate }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeekMon(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = anchor.getMonth();
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
        {weekdaysShort().map((d) => <div key={d} style={{ fontSize: 11, color: "#AAA", fontWeight: 700, textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          const key = ymd(d);
          const evs = byDay[key] || [];
          const inMonth = d.getMonth() === month;
          const isToday = key === todayKey;
          return (
            <div key={i} onClick={() => onCreate(d)} style={{
              minHeight: 96, border: "1px solid #F0F0F0", borderRadius: 8, padding: 5,
              background: inMonth ? "white" : "#FAFAF9", cursor: "pointer", overflow: "hidden",
            }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? "white" : inMonth ? "#333" : "#BBB", background: isToday ? "#111" : "transparent", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>{d.getDate()}</span>
              </div>
              {evs.slice(0, 3).map((ev) => <EventChip key={ev.id} ev={ev} onClick={onEvent} compact />)}
              {evs.length > 3 && <div style={{ fontSize: 10, color: "#888", fontWeight: 600, paddingLeft: 2 }}>+{evs.length - 3} {t("cal_more")}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Side-by-side layout for overlapping timed events. Groups events into clusters
// (maximal runs of mutually-overlapping events), assigns each a column via greedy
// interval-graph coloring, and returns id → { col, cols } so a cluster of N
// concurrent events each takes 1/cols of the width. Non-overlapping events get
// their own single-column cluster (full width). Partial overlaps split too.
function layoutTimed(events) {
  const items = events
    .map((ev) => ({ ev, s: new Date(ev.start).getTime(), e: new Date(ev.end || ev.start).getTime() }))
    .sort((a, b) => a.s - b.s || a.e - b.e);
  const map = new Map();
  let cluster = [], clusterEnd = -Infinity;
  const flush = () => {
    const colEnds = []; // last end time per column
    for (const it of cluster) {
      let placed = -1;
      for (let c = 0; c < colEnds.length; c++) { if (it.s >= colEnds[c]) { colEnds[c] = it.e; placed = c; break; } }
      if (placed < 0) { colEnds.push(it.e); placed = colEnds.length - 1; }
      it.col = placed;
    }
    for (const it of cluster) map.set(it.ev.id, { col: it.col, cols: colEnds.length });
    cluster = []; clusterEnd = -Infinity;
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush(); // gap → new cluster
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return map;
}

// ── Desktop week time-grid ──
function WeekGrid({ anchor, byDay, todayKey, onEvent, onCreate }) {
  const start = startOfWeekMon(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const gridH = hours.length * HOUR_H;

  const pos = (ev) => {
    const s = new Date(ev.start), e = new Date(ev.end || ev.start);
    const sH = s.getHours() + s.getMinutes() / 60, eH = e.getHours() + e.getMinutes() / 60;
    const top = Math.max(0, (sH - HOUR_START) * HOUR_H);
    const height = Math.max(20, Math.min(gridH - top, (eH - sH) * HOUR_H));
    return { top, height };
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 640 }}>
        {/* Day headers + all-day row */}
        <div style={{ display: "grid", gridTemplateColumns: "48px repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
          <div />
          {days.map((d, i) => {
            const key = ymd(d), isToday = key === todayKey;
            const allDayEvs = (byDay[key] || []).filter((e) => e.allDay);
            return (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#AAA", fontWeight: 700 }}>{weekdaysShort()[i]}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? "white" : "#333", background: isToday ? "#111" : "transparent", borderRadius: "50%", width: 24, height: 24, lineHeight: "24px", margin: "2px auto 4px" }}>{d.getDate()}</div>
                {allDayEvs.map((ev) => <EventChip key={ev.id} ev={ev} onClick={onEvent} compact />)}
              </div>
            );
          })}
        </div>
        {/* Time grid */}
        <div style={{ display: "grid", gridTemplateColumns: "48px repeat(7,1fr)", gap: 4 }}>
          <div>
            {hours.map((h) => <div key={h} style={{ height: HOUR_H, fontSize: 10, color: "#BBB", textAlign: "right", paddingRight: 6, transform: "translateY(-6px)" }}>{h}:00</div>)}
          </div>
          {days.map((d, i) => {
            const key = ymd(d);
            const timed = (byDay[key] || []).filter((e) => !e.allDay);
            const layout = layoutTimed(timed); // side-by-side columns for overlaps
            return (
              <div key={i} onClick={() => onCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10))} style={{ position: "relative", height: gridH, border: "1px solid #F0F0F0", borderRadius: 6, background: `repeating-linear-gradient(#fff, #fff ${HOUR_H - 1}px, #F3F3F1 ${HOUR_H - 1}px, #F3F3F1 ${HOUR_H}px)`, cursor: "pointer" }}>
                {timed.map((ev) => {
                  const { top, height } = pos(ev);
                  const { col, cols } = layout.get(ev.id) || { col: 0, cols: 1 };
                  const w = 100 / cols;
                  return (
                    <div key={ev.id} onClick={(e) => { e.stopPropagation(); onEvent(ev); }} title={eventTitle(ev)}
                      style={{ position: "absolute", top, height, left: `calc(${col * w}% + 1px)`, width: `calc(${w}% - 2px)`, ...chipStyleFor(ev), borderRadius: 5, padding: "2px 5px", fontSize: 10, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>
                      <b>{timeLabel(ev)}</b> {eventTitle(ev)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Mobile: compact month grid + agenda for the tapped day ──
function MobileMonth({ anchor, byDay, todayKey, selectedDay, setSelectedDay, onEvent, onCreate }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeekMon(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = anchor.getMonth();
  const dayEvents = byDay[selectedDay] || [];
  const selDate = (() => { const [y, m, d] = selectedDay.split("-").map(Number); return new Date(y, m - 1, d); })();

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
        {weekdaysShort().map((d) => <div key={d} style={{ fontSize: 10, color: "#AAA", fontWeight: 700, textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          const key = ymd(d);
          const evs = byDay[key] || [];
          const inMonth = d.getMonth() === month;
          const isToday = key === todayKey;
          const isSel = key === selectedDay;
          return (
            <div key={i} onClick={() => setSelectedDay(key)} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 8, cursor: "pointer", background: isSel ? "#F0EDE6" : "transparent", position: "relative" }}>
              <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? "white" : inMonth ? "#333" : "#CCC", background: isToday ? "#111" : "transparent", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>{d.getDate()}</span>
              {evs.length > 0 && !isToday && <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, position: "absolute", bottom: 4 }} />}
            </div>
          );
        })}
      </div>

      {/* Agenda for the selected day */}
      <div style={{ marginTop: 16, borderTop: "1px solid #F0F0F0", paddingTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0, textTransform: "capitalize" }}>{selDate.toLocaleDateString(t("date_locale"), { weekday: "long", day: "numeric", month: "long" })}</p>
          <button onClick={() => onCreate(selDate)} style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("cal_new_event_short")}</button>
        </div>
        {dayEvents.length === 0 ? (
          <p style={{ fontSize: 13, color: "#BBB", textAlign: "center", padding: "20px 0", margin: 0 }}>{t("cal_no_events")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dayEvents.map((ev) => (
              <div key={ev.id} onClick={() => onEvent(ev)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "#F8F7F4", border: "1px solid #EBEBEB", borderLeft: `3px solid ${accentFor(ev)}`, borderRadius: 10, cursor: "pointer" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: accentFor(ev), minWidth: 52 }}>{timeLabel(ev)}</span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eventTitle(ev)}</p>
                  {ev.location && <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>📍 {ev.location}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
