import { useState } from "react";
import { STATUSES, BUDGETS, INTENTIONS, GOLD } from "../constants";
import { relDate } from "../utils";
import Avatar from "../components/Avatar";
import StatusDropdown from "../components/StatusDropdown";
import QuickActions from "../components/QuickActions";

function FilterLabel({ children }) {
  return (
    <p style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, margin: "0 0 5px" }}>{children}</p>
  );
}

export default function LeadsTab({ leads, onOpenLead, updateStatus }) {
  const [filterBudget, setFilterBudget] = useState("Todos");
  const [filterIntention, setFilterIntention] = useState("Todas");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");

  const filtered = leads.filter(l => {
    if (filterBudget !== "Todos" && l.budget !== filterBudget) return false;
    if (filterIntention !== "Todas" && l.intention !== filterIntention) return false;
    if (filterStatus !== "Todos" && l.status !== filterStatus) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !l.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <FilterLabel>Pesquisar</FilterLabel>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou email..." style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 14px", fontSize: 13, outline: "none", color: "#111", background: "white", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        {[
          { label: "Estado", value: filterStatus, set: setFilterStatus, opts: ["Todos", ...STATUSES] },
          { label: "Orçamento", value: filterBudget, set: setFilterBudget, opts: BUDGETS },
          { label: "Intenção", value: filterIntention, set: setFilterIntention, opts: INTENTIONS },
        ].map((f, i) => (
          <div key={i}>
            <FilterLabel>{f.label}</FilterLabel>
            <select value={f.value} onChange={e => f.set(e.target.value)} style={{ border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 32px 9px 12px", fontSize: 13, color: "#111", background: "white", cursor: "pointer", outline: "none" }}>
              {f.opts.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <div style={{ alignSelf: "flex-end", paddingBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#AAA" }}>{filtered.length} leads</span>
        </div>
      </div>

      {/* No overflow:hidden — it would clip the StatusDropdown menu on the last rows.
          The card look is kept via border + borderRadius; edge rows round their own corners. */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#CCC", fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>Nenhum lead encontrado.
          </div>
        ) : filtered.map((lead, i) => (
          <div key={lead.id} onClick={() => onOpenLead(lead)} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
            borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F5" : "none", cursor: "pointer",
            borderRadius: `${i === 0 ? "16px 16px" : "0 0"} ${i === filtered.length - 1 ? "16px 16px" : "0 0"}`,
          }}
            onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <Avatar name={lead.name} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</span>
                {lead.notes && <span title={lead.notes} style={{ fontSize: 11, color: GOLD }}>📝</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>{lead.budget}</span>
                <span style={{ color: "#DDD", fontSize: 10 }}>•</span>
                <span style={{ fontSize: 12, color: "#888" }}>{lead.intention}</span>
                <span style={{ color: "#DDD", fontSize: 10 }}>•</span>
                <span style={{ fontSize: 12, color: "#CCC" }}>{relDate(lead.date)}</span>
              </div>
            </div>
            <div onClick={e => e.stopPropagation()}>
              <StatusDropdown status={lead.status} onChange={s => updateStatus(lead.id, s)} />
            </div>
            <div onClick={e => e.stopPropagation()}>
              <QuickActions lead={lead} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
