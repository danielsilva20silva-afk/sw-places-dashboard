import { useState } from "react";
import { STATUSES, BUDGETS, INTENTIONS, GOLD } from "../constants";
import { cleanField, isValidPhone, isValidEmail, leadTime, isRealLead, normalizeText, sourceCampaignLabel } from "../utils";
import { hasFeature } from "../config";
import { CLASSIFICATION_CONFIG } from "../constants";
import { suggestClassification } from "../suggestClassification";
import { parseBudget, budgetInBucket } from "../budgetMatch";
import { t } from "../labels";
import Avatar from "../components/Avatar";
import StatusDropdown from "../components/StatusDropdown";
import QuickActions from "../components/QuickActions";
import LeadMeta from "../components/LeadMeta";
import LeadFormModal from "../components/LeadFormModal";
import ClassificationBadge from "../components/ClassificationBadge";
import LeadRowMobile from "../components/LeadRowMobile";
import DupBadge from "../components/DupBadge";
import NextActionCell from "../components/NextActionCell";
import useIsMobile from "../useIsMobile";
import { exportLeadsCsv } from "../leadsCsv";

// "Sem classificação" is a sentinel for the classification filter (unset leads).
const NO_CLASSIFICATION = "Sem classificação";

// Shared filter-select style. Native arrow is suppressed (appearance:none +
// vendor prefixes) and replaced with a custom chevron SVG sat 12px from the right;
// padding-right leaves room so the option text never overlaps it. backgroundColor
// is set separately from backgroundImage (a `background` shorthand would wipe the
// image). Cosmetic-only; applies to every toolbar select in both clients.
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";
const selectStyle = {
  border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 34px 9px 12px", fontSize: 13,
  color: "#111", backgroundColor: "white", cursor: "pointer", outline: "none",
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  backgroundImage: CHEVRON, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
};
const exportBtnStyle = { border: "1px solid #E5E5E5", background: "white", color: "#333", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };

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

// Every short source/campaign label of a lead AS DISPLAYED: the primary's plus
// every merged secondary's. Dedupe folds secondaries into the primary, so their
// source would otherwise be invisible to the source filter and its option list —
// this makes both reflect the whole composite (same principle as the text search,
// which already matches secondaries via __dupSearch). With dedupe off (swplaces)
// there are no mergedSecondaries, so this is just the primary's label — unchanged.
function leadSources(lead) {
  const secondaries = Array.isArray(lead.mergedSecondaries)
    ? lead.mergedSecondaries.map((s) => sourceCampaignLabel(cleanField(s.lead && s.lead.source)))
    : [];
  return [sourceCampaignLabel(cleanField(lead.source)), ...secondaries].filter(Boolean);
}

// ── Area filter helpers ──
const AREA_OPEN = "Open to all";
// Title-case for display, keeping PT/EN connectors lowercase so "quinta do lago"
// → "Quinta do Lago" and "open to all" → "Open to all".
const AREA_SMALL = new Set(["do", "da", "de", "dos", "das", "e", "of", "the", "to", "and", "for", "a", "à", "no", "na"]);
function titleCaseArea(str) {
  return String(str).trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && AREA_SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
// Every area STRING of a lead AS DISPLAYED: primary + merged secondaries (same
// composite principle as leadSources). Empty values dropped.
function leadAreaValues(lead) {
  const secs = Array.isArray(lead.mergedSecondaries)
    ? lead.mergedSecondaries.map((s) => cleanField(s.lead && s.lead.area))
    : [];
  return [cleanField(lead.area), ...secs].filter(Boolean);
}
// A single area string split into its tokens (on "/" and ",").
function areaTokens(value) {
  return String(value || "").split(/[/,]+/).map((x) => x.trim()).filter(Boolean);
}
// Distinct area options across all loaded leads (case/accent-insensitive), sorted.
function buildAreaOptions(leads) {
  const seen = new Map(); // normalized key → display
  for (const l of leads) {
    for (const v of leadAreaValues(l)) {
      for (const tok of areaTokens(v)) {
        const key = normalizeText(tok);
        if (key && !seen.has(key)) seen.set(key, titleCaseArea(tok));
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
// A lead matches the selected area: substring (case/accent-insensitive) against any
// of its area strings. An "Open to all" lead matches ANY specific area; selecting
// "Open to all" matches only open-to-all leads.
function matchArea(lead, sel) {
  const selN = normalizeText(sel);
  const openN = normalizeText(AREA_OPEN);
  const vals = leadAreaValues(lead).map(normalizeText);
  if (selN === openN) return vals.some((v) => v.includes(openN));
  return vals.some((v) => v.includes(selN) || v.includes(openN));
}

export default function LeadsTab({ leads: allLeads, onOpenLead, onStatusChange, onCreateLead, actionsView, archiveOn, archivedLeads = [], onUnarchive, onApplyClassifications }) {
  const nextActionFor = (lead) => (actionsView ? (actionsView.get(String(lead.id))?.next || null) : null);
  const suggestOn = hasFeature("classSuggest");
  const suggestFor = (lead) => (suggestOn ? suggestClassification(lead) : null);
  // Contact-less "DM · ANA" entries (reel-flow / logged DMs) aren't leads yet —
  // hide them here (they show in Conversas). They reappear once Ana captures a
  // phone/email. Every other source stays visible, contact or not.
  const leads = allLeads.filter(isRealLead);
  const isMobile = useIsMobile();
  const [showArchived, setShowArchived] = useState(false);
  // Archived rows also drop the contact-less DM entries, for parity with the list.
  const archived = (archivedLeads || []).filter(isRealLead);
  const [filterBudget, setFilterBudget] = useState("Todos");
  const [filterIntention, setFilterIntention] = useState("Todas");
  const [filterArea, setFilterArea] = useState("Todas");
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
  // appear automatically — INCLUDING campaigns whose only lead is folded into a
  // merge as a secondary (leadSources covers the whole composite). The filter
  // matches on this same short label.
  const sources = Array.from(new Set(leads.flatMap(leadSources))).sort();

  // Area filter: options derived from the data; shown only when some lead has an
  // area (keeps swplaces — no area data — visually unchanged, no flag needed).
  const areaOptions = buildAreaOptions(leads);
  const areaFilterVisible = areaOptions.length > 0;

  // Intent options: curated list + any distinct intent values present in the data
  // (Meta timeline answers) that aren't already there, deduped case-insensitively,
  // appended after the curated ones. swplaces data is all curated → no change.
  const intentOptions = (() => {
    const out = [...INTENTIONS];
    const seen = new Set(INTENTIONS.map((x) => x.toLowerCase()));
    for (const l of leads) {
      const v = (l.intention || "").trim();
      if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
    }
    return out;
  })();

  const q = normalizeText(search);
  const filtered = leads.filter(l => {
    // Budget: exact bucket string (landing leads, as before) OR the free-text
    // budget's parsed ceiling falling in the selected bucket (Meta budget column).
    if (filterBudget !== "Todos" && l.budget !== filterBudget && !budgetInBucket(parseBudget(l.budget), filterBudget)) return false;
    if (filterIntention !== "Todas" && l.intention !== filterIntention) return false;
    if (filterArea !== "Todas" && !matchArea(l, filterArea)) return false;
    if (filterStatus !== "Todos" && l.status !== filterStatus) return false;
    if (filterClassification === NO_CLASSIFICATION) { if (l.classification) return false; }
    else if (filterClassification !== "Todas" && l.classification !== filterClassification) return false;
    if (filterSource !== "Todas" && !leadSources(l).includes(filterSource)) return false;
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
        l.__dupSearch, // merged secondaries' data (email/phone/campaign/notes)
      ].filter(Boolean).join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    sortOrder === "recent" ? leadTime(b) - leadTime(a) : leadTime(a) - leadTime(b)
  );

  // Bulk suggested classifications — computed over ALL real leads in the tab (the
  // whole backlog, not just the filtered view). Each entry { id, value }.
  const suggestions = suggestOn
    ? leads.map((l) => ({ id: l.id, value: suggestClassification(l) })).filter((x) => x.value)
    : [];
  const runBulkApply = async () => {
    if (!suggestions.length || !onApplyClassifications) return;
    const counts = suggestions.reduce((m, x) => ((m[x.value] = (m[x.value] || 0) + 1), m), {});
    const breakdown = ["A", "B", "C"].filter((k) => counts[k]).map((k) => `${counts[k]}→${k}`).join(", ");
    if (!window.confirm(`${t("cls_bulk_confirm")}\n\n${breakdown}`)) return;
    const res = await onApplyClassifications(suggestions);
    const applied = res?.applied ?? 0;
    const skipped = res?.skipped ?? 0;
    window.alert(`${applied} ${t("cls_applied")}${skipped ? ` · ${skipped} ${t("cls_skipped_nocol")}` : ""}`);
  };

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
          { label: t("f_intention"), value: filterIntention, set: setFilterIntention, opts: intentOptions },
          // Area filter only appears when the loaded data has areas (data-driven).
          ...(areaFilterVisible ? [{ label: t("f_area"), value: filterArea, set: setFilterArea, opts: ["Todas", ...areaOptions] }] : []),
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
        {/* CSV export — client-side, from the loaded (dedupe-merged) leads. "All"
            exports every displayed lead; "Filtered" exports the current view. */}
        <div>
          <FilterLabel>{t("export_csv")}</FilterLabel>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => exportLeadsCsv(leads)} title={t("export_all_title")} style={exportBtnStyle}>
              ⬇ {t("export_all")} <span style={{ color: "#AAA", fontWeight: 500 }}>({leads.length})</span>
            </button>
            <button onClick={() => exportLeadsCsv(sorted)} title={t("export_filtered_title")} style={exportBtnStyle}>
              {t("export_filtered")} <span style={{ color: "#AAA", fontWeight: 500 }}>({sorted.length})</span>
            </button>
          </div>
        </div>
        <div style={{ alignSelf: "flex-end", paddingBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#AAA" }}>{sorted.length} lead{sorted.length !== 1 ? "s" : ""}</span>
        </div>
        {suggestions.length > 0 && (
          <div style={{ alignSelf: "flex-end" }}>
            <button onClick={runBulkApply} title={t("cls_bulk_confirm")} style={{
              background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A", borderRadius: 10,
              padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}>{t("cls_apply")} {suggestions.length} {t("cls_suggested_plural")}</button>
          </div>
        )}
        <div style={{ alignSelf: "flex-end" }}>
          <button onClick={() => setShowForm(true)} style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{t("new_lead")}</button>
        </div>
      </div>

      {/* Archived toggle — only for clients with the feature, and only once there's
          something archived. Switches the list below to the hidden leads. */}
      {archiveOn && archived.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setShowArchived(v => !v)} style={{
            background: showArchived ? "#F8F7F4" : "none", border: showArchived ? "1px solid #E7E5E4" : "none",
            color: showArchived ? "#111" : "#888", borderRadius: 8, padding: "6px 10px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {showArchived ? `← ${t("arch_back_to_active")}` : `${t("arch_view")} (${archived.length})`}
          </button>
        </div>
      )}

      {showForm && <LeadFormModal onClose={() => setShowForm(false)} onCreate={onCreateLead} />}

      {archiveOn && showArchived ? (
        /* Archived leads — hidden from every other view; each row can be restored. */
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB" }}>
          {archived.length === 0 ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#CCC", fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🗄️</div>{t("arch_empty")}
            </div>
          ) : archived.map((lead, i) => (
            <div key={lead.id} onClick={() => onOpenLead(lead)} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
              borderBottom: i < archived.length - 1 ? "1px solid #F5F5F5" : "none", cursor: "pointer",
              borderRadius: `${i === 0 ? "16px 16px" : "0 0"} ${i === archived.length - 1 ? "16px 16px" : "0 0"}`,
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar name={lead.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</span>
                  <DupBadge lead={lead} />
                </div>
                <LeadMeta lead={lead} />
              </div>
              <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                <button onClick={() => onUnarchive(lead.id)} style={{
                  background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0",
                  borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                }}>{t("arch_unarchive")}</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
      /* No overflow:hidden — it would clip the StatusDropdown menu on the last rows.
         The card look is kept via border + borderRadius; edge rows round their own corners. */
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
              nextAction={nextActionFor(lead)}
              suggested={suggestFor(lead)}
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
                <ClassificationBadge value={lead.classification} suggested={suggestFor(lead)} />
                {cleanField(lead.notes) && <span title={cleanField(lead.notes)} style={{ fontSize: 11, color: GOLD }}>📝</span>}
                <DupBadge lead={lead} />
              </div>
              <LeadMeta lead={lead} />
            </div>
            {actionsView && (
              <div style={{ flexShrink: 0, width: 150 }}>
                <NextActionCell next={nextActionFor(lead)} maxWidth={150} />
              </div>
            )}
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
      )}
    </>
  );
}
