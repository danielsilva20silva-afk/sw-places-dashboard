import { useState } from "react";
import { STATUSES, BUDGETS, INTENTIONS, GOLD } from "../constants";
import { cleanField, isValidPhone, isValidEmail, leadTime } from "../utils";
import Avatar from "../components/Avatar";
import StatusDropdown from "../components/StatusDropdown";
import QuickActions from "../components/QuickActions";
import LeadMeta from "../components/LeadMeta";
import LeadFormModal from "../components/LeadFormModal";

const selectStyle = { border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 32px 9px 12px", fontSize: 13, color: "#111", background: "white", cursor: "pointer", outline: "none" };

const PERIODS = [["all", "Tudo"], ["today", "Hoje"], ["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"]];
const CONTACTS = [["all", "Todos"], ["phone", "Com telemóvel"], ["email", "Com email"], ["none", "Sem contacto válido"]];
const SORTS = [["recent", "Mais recentes primeiro"], ["old", "Mais antigos primeiro"]];

function FilterLabel({ children }) {
  return (
    <p style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, margin: "0 0 5px" }}>{children}</p>
  );
}

function inPeriod(lead, period) {
  if (period === "all") return true;
  const t = leadTime(lead);
  if (!t) return false;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "today") return t >= startToday;
  if (period === "7d") return t >= startToday - 6 * 86400000;
  if (period === "30d") return t >= startToday - 29 * 86400000;
  return true;
}

function matchContact(lead, mode) {
  const p = isValidPhone(lead.phone), e = isValidEmail(lead.email);
  if (mode === "phone") return p;
  if (mode === "email") return e;
  if (mode === "none") return !p && !e;
  return true;
}

export default function LeadsTab({ leads, onOpenLead, onStatusChange, onCreateLead }) {
  const [filterBudget, setFilterBudget] = useState("Todos");
  const [filterIntention, setFilterIntention] = useState("Todas");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterContact, setFilterContact] = useState("all");
  const [filterSource, setFilterSource] = useState("Todas");
  const [sortOrder, setSortOrder] = useState("recent");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Distinct sources present in the data (e.g. ALGARVE, DM · ANA, Manual…)
  const sources = Array.from(new Set(leads.map(l => cleanField(l.source)).filter(Boolean))).sort();

  const filtered = leads.filter(l => {
    if (filterBudget !== "Todos" && l.budget !== filterBudget) return false;
    if (filterIntention !== "Todas" && l.intention !== filterIntention) return false;
    if (filterStatus !== "Todos" && l.status !== filterStatus) return false;
    if (filterSource !== "Todas" && cleanField(l.source) !== filterSource) return false;
    if (!inPeriod(l, filterPeriod)) return false;
    if (!matchContact(l, filterContact)) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !l.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    sortOrder === "recent" ? leadTime(b) - leadTime(a) : leadTime(a) - leadTime(b)
  );

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FilterLabel>Pesquisar</FilterLabel>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou email..." style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 14px", fontSize: 13, outline: "none", color: "#111", background: "white", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        {/* String-value filters (value === label) */}
        {[
          { label: "Estado", value: filterStatus, set: setFilterStatus, opts: ["Todos", ...STATUSES] },
          { label: "Orçamento", value: filterBudget, set: setFilterBudget, opts: BUDGETS },
          { label: "Intenção", value: filterIntention, set: setFilterIntention, opts: INTENTIONS },
          { label: "Origem", value: filterSource, set: setFilterSource, opts: ["Todas", ...sources] },
        ].map((f, i) => (
          <div key={i}>
            <FilterLabel>{f.label}</FilterLabel>
            <select value={f.value} onChange={e => f.set(e.target.value)} style={selectStyle}>
              {f.opts.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {/* Key/label filters */}
        {[
          { label: "Período", value: filterPeriod, set: setFilterPeriod, opts: PERIODS },
          { label: "Contacto", value: filterContact, set: setFilterContact, opts: CONTACTS },
          { label: "Ordenar", value: sortOrder, set: setSortOrder, opts: SORTS },
        ].map((f, i) => (
          <div key={i}>
            <FilterLabel>{f.label}</FilterLabel>
            <select value={f.value} onChange={e => f.set(e.target.value)} style={selectStyle}>
              {f.opts.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
          </div>
        ))}
        <div style={{ alignSelf: "flex-end", paddingBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#AAA" }}>{sorted.length} lead{sorted.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <button onClick={() => setShowForm(true)} style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Novo lead</button>
        </div>
      </div>

      {showForm && <LeadFormModal onClose={() => setShowForm(false)} onCreate={onCreateLead} />}

      {/* No overflow:hidden — it would clip the StatusDropdown menu on the last rows.
          The card look is kept via border + borderRadius; edge rows round their own corners. */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#CCC", fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>Nenhum lead encontrado.
          </div>
        ) : sorted.map((lead, i) => (
          <div key={lead.id} onClick={() => onOpenLead(lead)} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
            borderBottom: i < sorted.length - 1 ? "1px solid #F5F5F5" : "none", cursor: "pointer",
            borderRadius: `${i === 0 ? "16px 16px" : "0 0"} ${i === sorted.length - 1 ? "16px 16px" : "0 0"}`,
          }}
            onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <Avatar name={lead.name} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</span>
                {cleanField(lead.notes) && <span title={cleanField(lead.notes)} style={{ fontSize: 11, color: GOLD }}>📝</span>}
              </div>
              <LeadMeta lead={lead} />
            </div>
            <div onClick={e => e.stopPropagation()}>
              <StatusDropdown status={lead.status} onChange={s => onStatusChange(lead, s)} />
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
