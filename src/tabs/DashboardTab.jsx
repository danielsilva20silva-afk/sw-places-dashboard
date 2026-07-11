import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { GOLD, inContactStatuses, statusRoles } from "../constants";
import { hasFeature } from "../config";
import { buildChartData, leadTime } from "../utils";
import Avatar from "../components/Avatar";
import StatusDropdown from "../components/StatusDropdown";
import QuickActions from "../components/QuickActions";
import CustomTooltip from "../components/CustomTooltip";
import CalendarView from "../components/CalendarView";
import LeadMeta from "../components/LeadMeta";

export default function DashboardTab({ leads, onOpenLead, onStatusChange, onViewAllLeads, calRefreshKey, onCalendarChanged }) {
  const chartData = buildChartData(leads);

  // Most recent first, by the normalised lead instant (same key the Leads tab
  // uses, so the two lists agree). Stable sort keeps source order on ties.
  const recentLeads = [...leads]
    .sort((a, b) => leadTime(b) - leadTime(a))
    .slice(0, 10);

  const stats = [
    { label: "Total Leads", value: leads.length, color: "#111", sub: `+${leads.filter(l => { const d = new Date(l.date); const now = new Date(); return (now - d) < 7 * 86400000; }).length} esta semana` },
    { label: "Novos", value: leads.filter(l => l.status === statusRoles.new).length, color: "#2563EB", sub: "por contactar" },
    { label: "Em contacto", value: leads.filter(l => inContactStatuses.includes(l.status)).length, color: "#D97706", sub: "em progresso" },
    { label: "Fechados", value: leads.filter(l => l.status === statusRoles.closed).length, color: "#16A34A", sub: "este mês" },
  ];

  return (
    <>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "white", borderRadius: 16, padding: "20px 20px 16px", border: "1px solid #EBEBEB" }}>
            <p style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px", fontWeight: 600 }}>{s.label}</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: "#111", letterSpacing: "-2px", margin: "0 0 6px", lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 11, color: "#BBB", margin: 0 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Leads chart */}
      <div style={{ background: "white", borderRadius: 16, padding: "22px 24px", border: "1px solid #EBEBEB", display: "flex", flexDirection: "column", height: 280, marginBottom: 20 }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Leads ao longo do tempo</p>
          <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>Últimos 14 dias</p>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fontSize: 11, fill: "#AAA" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#F0F0F0", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="leads" stroke={GOLD} strokeWidth={2.5} dot={{ fill: GOLD, r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: GOLD, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Calendar (Google Calendar) — only for clients with the calendar feature */}
      {hasFeature("calendar") && (
        <div style={{ marginBottom: 20 }}>
          <CalendarView refreshKey={calRefreshKey} onChanged={onCalendarChanged} />
        </div>
      )}

      {/* Recent leads */}
      {/* No overflow:hidden — it would clip the StatusDropdown menu on the last rows.
          The card look is kept via border + borderRadius; edge rows round their own corners. */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Leads recentes</p>
          <button onClick={onViewAllLeads} style={{ fontSize: 12, color: GOLD, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Ver todos →</button>
        </div>
        {recentLeads.map((lead, i, arr) => (
          <div key={lead.id} onClick={() => onOpenLead(lead)} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "12px 20px",
            borderBottom: i < arr.length - 1 ? "1px solid #F5F5F5" : "none", cursor: "pointer",
            borderRadius: i === arr.length - 1 ? "0 0 16px 16px" : 0,
          }}
            onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <Avatar name={lead.name} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</span>
              <LeadMeta lead={lead} />
            </div>
            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <StatusDropdown status={lead.status} onChange={s => onStatusChange(lead, s)} />
            </div>
            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <QuickActions lead={lead} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
