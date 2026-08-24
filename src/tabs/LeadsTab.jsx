import { useState } from "react";
import { STATUSES, BUDGETS, INTENTIONS, GOLD } from "../constants";
import { cleanField, isValidPhone, isValidEmail, leadTime, isRealLead, normalizeText, sourceCampaignLabel } from "../utils";
import { t } from "../labels";
import Avatar from "../components/Avatar";
import StatusDropdown from "../components/StatusDropdown";
import QuickActions from "../components/QuickActions";
import LeadMeta from "../components/LeadMeta";
import LeadFormModal from "../components/LeadFormModal";
import ClassificationBadge from "../components/ClassificationBadge";
import LeadRowMobile from "../components/LeadRowMobile";
import useIsMobile from "../useIsMobile";

// "Sem classificação" is a sentinel for the classification filter (unset leads).
const NO_CLASSIFICATION = "Sem classificação";

const selectStyle = { border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 32px 9px 12px", fontSize: 13, color: "#111", background: "white", cursor: "pointer", outline: "none" };

// [value, labelKey] — value is the stable internal key, label is translated at
// render time via t() so it follows the client's UI language.
const PERIODS = [["all", "period_all"], ["today", "period_today"], ["7d", "period_7d"], ["30d", "period_30d"]];
const CONTACTS = [["all", "contact_all"], ["phone", "contact_phone"], ["email", "contact_email"], ["none", "contact_none"]];
const SORTS = [["recent", "sort_recent"], ["old", "sort_old"]];

// Display label for a string-value filter option: translate the "all"/unclassified
// sentinels (their VALUE stays PT so the predicate + defaults are unchanged);
// real data values (statuses, budgets, sources) pass through as-is.
function optLabel(o) {
  if (o === "Todos") return t("all_m");
  if (o === "Todas") return t("all_f");
  if (o === NO_CLASSIFICATION) return t("unclassified");
  return o;
}

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

export default function LeadsTab({ leads: allLeads, onOpenLead, onStatusChange, onCreateLead }) {
  // Contact-less "DM · ANA" entries (reel-flow / logged DMs) aren't leads yet —
  // hide them here (they show in Conversas). They reappear once Ana captures a
  // phone/email. Every other source stays visible, contact or not.
  const leads = allLeads.filter(isRealLead);
  const isMobile = useIsMobile();
  const [filterBudget, setFilterBudget] = useState("Todos");
  const [filterIntention, setFilterIntention] = useState("Todas");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterClassification, setFilterClassification] = useState("Todas");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterContact, setFilterContact] = useState("all");
  const [filterSource, setFilterSource] = useState("Todas");
  const [sortOrder, setSortOrder] = useState("recent");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Distinct source options present in the data, each shown in short form (Meta
  // campaign/form values collapse to their middle segment, e.g. "BUYERS REEL";
  // every other source is left as-is). Derived dynamically, so new campaigns
  // appear automatically. The filter matches on this same short label.
  const sources = Array.from(new Set(leads.map(l => sourceCampaignLabel(cleanField(l.source))).filter(Boolean))).sort();

  const q = normalizeText(search);
  const filtered = leads.filter(l => {
    if (filterBudget !== "Todos" && l.budget !== filterBudget) return false;
    if (filterIntention !== "Todas" && l.intention !== filterIntention) return false;
    if (filterStatus !== "Todos" && l.status !== filterStatus) return false;
    if (filterClassification === NO_CLASSIFICATION) { if (l.classification) return false; }
    else if (filterClassification !== "Todas" && l.classification !== filterClassification) return false;
    if (filterSource !== "Todas" && sourceCampaignLabel(cleanField(l.source)) !== filterSource) return false;
    if (!inPeriod(l, filterPeriod)) return false;
    if (!matchContact(l, filterContact)) return false;
    // Search matches ALL displayed lead fields (name/email/phone/budget/intention/
    // source/status/notes/classification), case- and accent-insensitive.
    if (q) {
      const cls = l.classification || "";
      const hay = normalizeText([
        l.name, l.email, l.phone, l.budget, l.intention, cleanField(l.source),
        l.status, cleanField(l.notes), l.manual_notes,
        cls, cls && t("cls_" + cls),
      ].filter(Boolean).join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    sortOrder === "recent" ? leadTime(b) - leadTime(a) : leadTime(a) - leadTime(b)
  );

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FilterLabel>{t("search_label")}</FilterLabel>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("search_ph")} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 14px", fontSize: 13, outline: "none", color: "#111", background: "white", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        {/* String-value filters: option VALUE stays the data/sentinel; the DISPLAY
            is translated via optLabel (sentinels) — data values pass through. */}
        {[
          { label: t("f_status"), value: filterStatus, set: setFilterStatus, opts: ["Todos", ...STATUSES] },
          { label: t("f_classification"), value: filterClassification, set: setFilterClassification, opts: ["Todas", "A", "B", "C", NO_CLASSIFICATION] },
          { label: t("f_budget"), value: filterBudget, set: setFilterBudget, opts: BUDGETS },
          { label: t("f_intention"), value: filterIntention, set: setFilterIntention, opts: INTENTIONS },
          { label: t("f_source"), value: filterSource, set: setFilterSource, opts: ["Todas", ...sources] },
        ].map((f, i) => (
          <div key={i}>
            <FilterLabel>{f.label}</FilterLabel>
            <select value={f.value} onChange={e => f.set(e.target.value)} style={selectStyle}>
              {f.opts.map(o => <option key={o} value={o}>{optLabel(o)}</option>)}
            </select>
          </div>
        ))}
        {/* Key/label filters (label translated from its key) */}
        {[
          { label: t("f_period"), value: filterPeriod, set: setFilterPeriod, opts: PERIODS },
          { label: t("f_contact"), value: filterContact, set: setFilterContact, opts: CONTACTS },
          { label: t("f_sort"), value: sortOrder, set: setSortOrder, opts: SORTS },
        ].map((f, i) => (
          <div key={i}>
            <FilterLabel>{f.label}</FilterLabel>
            <select value={f.value} onChange={e => f.set(e.target.value)} style={selectStyle}>
              {f.opts.map(([v, lbl]) => <option key={v} value={v}>{t(lbl)}</option>)}
            </select>
          </div>
        ))}
        <div style={{ alignSelf: "flex-end", paddingBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#AAA" }}>{sorted.length} lead{sorted.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <button onClick={() => setShowForm(true)} style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{t("new_lead")}</button>
        </div>
      </div>

      {showForm && <LeadFormModal onClose={() => setShowForm(false)} onCreate={onCreateLead} />}

      {/* No overflow:hidden — it would clip the StatusDropdown menu on the last rows.
          The card look is kept via border + borderRadius; edge rows round their own corners. */}
      <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#CCC", fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>{t("empty_leads")}
          </div>
        ) : sorted.map((lead, i) => (
          isMobile ? (
            <LeadRowMobile
              key={lead.id}
              lead={lead}
              onOpen={onOpenLead}
              onStatusChange={onStatusChange}
              showNotesIcon
              style={{
                borderBottom: i < sorted.length - 1 ? "1px solid #F5F5F5" : "none",
                borderRadius: `${i === 0 ? "16px 16px" : "0 0"} ${i === sorted.length - 1 ? "16px 16px" : "0 0"}`,
              }}
            />
          ) : (
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
                <ClassificationBadge value={lead.classification} />
                {cleanField(lead.notes) && <span title={cleanField(lead.notes)} style={{ fontSize: 11, color: GOLD }}>📝</span>}
              </div>
              <LeadMeta lead={lead} />
            </div>
            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <StatusDropdown status={lead.status} onChange={s => onStatusChange(lead, s)} />
            </div>
            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <QuickActions lead={lead} />
            </div>
          </div>
          )
        ))}
      </div>
    </>
  );
}
