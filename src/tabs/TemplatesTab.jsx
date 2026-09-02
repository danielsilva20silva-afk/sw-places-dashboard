import { useState, useEffect, useMemo } from "react";
import { GOLD } from "../constants";
import { t } from "../labels";
import { cleanField, sourceCampaignLabel } from "../utils";
import * as api from "../api";
import { renderTemplate, keyMatchesAny, keyMatchesCampaign, AUDIENCE_ORDER } from "../templatesUtils";

// WhatsApp message template manager. Groups templates by campaign match_key
// (buyers reel is split by audience), with per-template editing, active toggle,
// delete, ordering, add-variant / add-group, campaign-awareness indicators, a
// placeholder-filled live preview, and a "campaigns using default" list.
// Feature-flagged ("templates"); brandon only.

const card = { background: "white", borderRadius: 16, border: "1px solid #EBEBEB" };
const heading = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 };
const areaStyle = {
  width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10,
  padding: "10px 12px", fontSize: 13, color: "#111", resize: "vertical", outline: "none",
  lineHeight: 1.6, fontFamily: "inherit", minHeight: 78,
};
const btnPrimary = (disabled) => ({
  background: "#111", color: "white", border: "none", borderRadius: 9, padding: "8px 16px",
  fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
});
const btnGhost = { background: "white", color: "#555", border: "1px solid #E5E5E5", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
// Campaign selector pill (on = currently shown group).
const pill = (on) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
  border: `1.5px solid ${on ? "#111" : "#E5E5E5"}`,
  background: on ? "#111" : "white", color: on ? "white" : "#555",
  cursor: "pointer", whiteSpace: "nowrap",
});

// Unique client-side id for an unsaved draft row (replaced by the server uuid on
// save). No ref needed — a timestamp + random suffix is unique enough.
const newDraftId = () => "new-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function audienceLabel(aud) {
  if (aud === "specific_area") return t("tpl_audience_specific_area");
  if (aud === "open") return t("tpl_audience_open");
  return "";
}

// One editable template. Holds local draft state; persists via the parent's
// callbacks (create for drafts, patch for saved rows).
function TemplateCard({ row, sampleCampaign, onSave, onToggle, onDelete }) {
  const isDraft = String(row.id).startsWith("new-");
  const [body, setBody] = useState(row.body || "");
  const [sort, setSort] = useState(Number.isFinite(+row.sort) ? String(row.sort) : "0");
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const [errMsg, setErrMsg] = useState("");
  // No prop→state resync needed: the card is keyed by row.id, so a draft becoming
  // a saved row (id change) remounts it and re-reads body/sort from the new row.

  const emptyBody = !body.trim();
  const warnArea = row.audience === "specific_area" && !body.includes("{area}");
  const dirty = isDraft || body !== (row.body || "") || String(sort) !== String(row.sort ?? "0");

  const save = async () => {
    if (emptyBody || state === "saving") return;
    setState("saving"); setErrMsg("");
    const r = await onSave(row, { body, sort: parseInt(sort, 10) || 0 });
    if (r?.ok) { setState("saved"); setTimeout(() => setState("idle"), 1600); }
    else { setState("error"); setErrMsg(r?.error || t("tpl_save_failed")); }
  };

  const preview = renderTemplate(body, {
    greeting: t("tpl_sample_greeting"), name: t("tpl_sample_name"),
    area: t("tpl_sample_area"), campaign: sampleCampaign || "",
  });

  return (
    <div style={{ border: "1px solid #EEE", borderRadius: 12, padding: 14, background: row.active ? "white" : "#FAFAFA", opacity: row.active ? 1 : 0.85 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: row.active ? "#15803D" : "#999" }}>
          <input type="checkbox" checked={!!row.active} onChange={() => onToggle(row)} style={{ accentColor: GOLD, width: 15, height: 15 }} />
          {row.active ? t("tpl_active") : t("tpl_inactive")}
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#888" }}>
            {t("tpl_sort")}
            <input type="number" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 52, border: "1px solid #E5E5E5", borderRadius: 8, padding: "4px 6px", fontSize: 12, color: "#111", outline: "none" }} />
          </label>
          <button type="button" onClick={() => onDelete(row)} title={t("tpl_delete")} aria-label={t("tpl_delete")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#DC2626" }}>🗑</button>
        </div>
      </div>

      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("tpl_body_label")} style={areaStyle} />

      {warnArea && <p style={{ fontSize: 11, color: "#B45309", margin: "6px 0 0" }}>⚠️ {t("tpl_warn_area")}</p>}
      {emptyBody && <p style={{ fontSize: 11, color: "#BE123C", margin: "6px 0 0" }}>{t("tpl_empty_body")}</p>}

      {/* Live preview */}
      {body.trim() && (
        <div style={{ marginTop: 8 }}>
          <p style={{ ...heading, margin: "0 0 4px" }}>{t("tpl_preview")}</p>
          <div style={{ background: "#F0FBF3", border: "1px solid #CDECD6", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#14532D", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{preview}</div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <button type="button" onClick={save} disabled={emptyBody || state === "saving" || (!dirty && state !== "error")} style={btnPrimary(emptyBody || state === "saving" || (!dirty && state !== "error"))}>
          {state === "saving" ? t("tpl_saving") : t("tpl_save")}
        </button>
        {state === "saved" && <span style={{ fontSize: 12, color: "#15803D" }}>{t("tpl_saved")}</span>}
        {state === "error" && <span style={{ fontSize: 12, color: "#BE123C" }}>{errMsg}</span>}
      </div>
    </div>
  );
}

function PlaceholderHelp() {
  const rows = ["tpl_ph_greeting", "tpl_ph_name", "tpl_ph_area", "tpl_ph_campaign"];
  return (
    <div style={{ ...card, padding: "14px 18px", marginBottom: 16 }}>
      <p style={{ ...heading, margin: "0 0 8px" }}>{t("tpl_placeholders_title")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
        {rows.map((k) => <span key={k} style={{ fontSize: 12, color: "#666" }}>{t(k)}</span>)}
      </div>
    </div>
  );
}

export default function TemplatesTab({ leads = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupKey, setNewGroupKey] = useState("");
  const [selectedKey, setSelectedKey] = useState(null); // which campaign group is shown

  useEffect(() => {
    let active = true;
    api.getWaTemplates()
      .then((data) => { if (active) setRows(data); })
      .catch((e) => { if (active) setLoadError(e?.message || t("tpl_load_failed")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Known campaigns = the distinct short campaign labels present in the leads
  // (same source as the Leads source filter).
  const knownCampaigns = useMemo(
    () => Array.from(new Set(leads.map((l) => sourceCampaignLabel(cleanField(l.source))).filter(Boolean))).sort(),
    [leads]
  );

  // Group rows by match_key → then by audience. "default" group sorts last.
  const groups = useMemo(() => {
    const byKey = new Map();
    for (const r of rows) {
      const key = r.match_key || "default";
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    }
    const keys = Array.from(byKey.keys()).sort((a, b) => {
      if (a === "default") return 1;
      if (b === "default") return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => {
      const items = byKey.get(key);
      const auds = Array.from(new Set(items.map((i) => i.audience || "any")))
        .sort((a, b) => AUDIENCE_ORDER.indexOf(a) - AUDIENCE_ORDER.indexOf(b));
      return { key, auds, items };
    });
  }, [rows]);

  // Campaigns not matched by ANY non-default group → they fall back to default.
  const definedKeys = useMemo(
    () => Array.from(new Set(rows.map((r) => r.match_key).filter((k) => k && k !== "default"))),
    [rows]
  );
  const unmatchedCampaigns = useMemo(
    () => knownCampaigns.filter((c) => !definedKeys.some((k) => keyMatchesCampaign(k, c))),
    [knownCampaigns, definedKeys]
  );

  const addVariant = (matchKey, audience) => {
    const id = newDraftId();
    const maxSort = rows.filter((r) => r.match_key === matchKey && (r.audience || "any") === audience)
      .reduce((m, r) => Math.max(m, +r.sort || 0), -1);
    setRows((rs) => [...rs, { id, match_key: matchKey, audience, body: "", active: true, sort: maxSort + 1 }]);
  };

  const addGroup = (key) => {
    const k = String(key || "").trim().toLowerCase();
    if (!k) return;
    const id = newDraftId();
    setRows((rs) => [...rs, { id, match_key: k, audience: "any", body: "", active: true, sort: 0 }]);
    setSelectedKey(k); // jump to the group we just created
    setNewGroupOpen(false);
    setNewGroupKey("");
  };

  const saveRow = async (row, { body, sort }) => {
    try {
      if (String(row.id).startsWith("new-")) {
        const created = await api.createWaTemplate({ match_key: row.match_key, audience: row.audience, body, active: row.active, sort });
        setRows((rs) => rs.map((r) => (r.id === row.id ? created : r)));
      } else {
        const updated = await api.updateWaTemplate(row.id, { body, sort });
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || t("tpl_save_failed") };
    }
  };

  const toggleActive = async (row) => {
    if (String(row.id).startsWith("new-")) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)));
      return;
    }
    const next = !row.active;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, active: next } : r))); // optimistic
    try {
      const updated = await api.updateWaTemplate(row.id, { active: next });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
    } catch {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, active: !next } : r))); // revert
    }
  };

  const deleteRow = async (row) => {
    if (String(row.id).startsWith("new-")) {
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      return;
    }
    if (!window.confirm(t("tpl_delete_confirm"))) return;
    try {
      await api.deleteWaTemplate(row.id);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
    } catch {
      alert(t("tpl_delete_failed"));
    }
  };

  if (loading) return <div style={{ padding: "60px 0", textAlign: "center", color: "#999", fontSize: 14 }}>{t("tpl_loading")}</div>;
  if (loadError) return <div style={{ padding: "60px 0", textAlign: "center", color: "#BE123C", fontSize: 14 }}>{t("tpl_load_failed")}</div>;

  // Selected group, defaulting to the first when the stored selection is gone
  // (e.g. its last variant was deleted). Derived — no effect needed.
  const groupKeys = groups.map((g) => g.key);
  const effectiveKey = groupKeys.includes(selectedKey) ? selectedKey : (groupKeys[0] || null);
  const activeGroup = groups.find((g) => g.key === effectiveKey) || null;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>{t("tpl_title")}</p>
        <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>{t("tpl_subtitle")}</p>
      </div>

      <PlaceholderHelp />

      {/* Campaign selector: one pill per group (name · ✓/— · active count) + add-group */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: newGroupOpen ? 12 : 16 }}>
        {groups.map((g) => {
          const isDefault = g.key === "default";
          const matched = !isDefault && keyMatchesAny(g.key, knownCampaigns);
          const activeCount = g.items.filter((i) => i.active).length;
          const on = g.key === effectiveKey;
          return (
            <button key={g.key} type="button" onClick={() => setSelectedKey(g.key)} style={pill(on)}>
              <span>{isDefault ? t("tpl_default_group") : g.key}</span>
              {!isDefault && (
                <span title={matched ? t("tpl_matches") : t("tpl_no_match")} style={{ fontWeight: 700, color: on ? (matched ? "#4ADE80" : "rgba(255,255,255,0.55)") : (matched ? "#15803D" : "#BBB") }}>
                  {matched ? "✓" : "—"}
                </span>
              )}
              <span style={{ color: on ? "rgba(255,255,255,0.6)" : "#AAA" }}>· {activeCount}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setNewGroupOpen((o) => !o)} style={pill(newGroupOpen)}>{t("tpl_add_group")}</button>
      </div>

      {/* Add campaign group input (opened from the pill) */}
      {newGroupOpen && (
        <div style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={newGroupKey}
              onChange={(e) => setNewGroupKey(e.target.value)}
              placeholder={t("tpl_new_group_key_ph")}
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#111", outline: "none" }}
            />
            <p style={{ fontSize: 11, color: "#888", margin: 0 }}>{t("tpl_new_group_help")}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => addGroup(newGroupKey)} disabled={!newGroupKey.trim()} style={btnPrimary(!newGroupKey.trim())}>{t("tpl_new_group_create")}</button>
              <button type="button" onClick={() => { setNewGroupOpen(false); setNewGroupKey(""); }} style={btnGhost}>{t("tpl_new_group_cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 && !newGroupOpen && (
        <div style={{ ...card, padding: "40px", textAlign: "center", color: "#CCC", fontSize: 14, marginBottom: 16 }}>{t("tpl_empty")}</div>
      )}

      {/* Selected group only */}
      {activeGroup && (() => {
        const g = activeGroup;
        const isDefault = g.key === "default";
        const matched = !isDefault && keyMatchesAny(g.key, knownCampaigns);
        const sampleCampaign = knownCampaigns.find((c) => keyMatchesCampaign(g.key, c)) || g.key;
        return (
          <div style={{ ...card, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>
                  {isDefault ? t("tpl_default_group") : g.key}
                </span>
                {!isDefault && (
                  <span title={matched ? t("tpl_matches") : t("tpl_no_match")} style={{ fontSize: 12, fontWeight: 700, color: matched ? "#15803D" : "#BBB" }}>
                    {matched ? "✓" : "—"}
                  </span>
                )}
              </div>
            </div>
            {isDefault && <p style={{ fontSize: 12, color: "#888", margin: "-6px 0 12px" }}>{t("tpl_default_hint")}</p>}

            {g.auds.map((aud) => {
              const items = g.items
                .filter((i) => (i.audience || "any") === aud)
                .sort((a, b) => (+a.sort || 0) - (+b.sort || 0));
              const audLabel = audienceLabel(aud);
              return (
                <div key={aud} style={{ marginBottom: 12 }}>
                  {audLabel && <p style={{ ...heading, margin: "0 0 8px", color: "#8A6D2F" }}>{audLabel}</p>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {items.map((row) => (
                      <TemplateCard key={row.id} row={row} sampleCampaign={sampleCampaign} onSave={saveRow} onToggle={toggleActive} onDelete={deleteRow} />
                    ))}
                  </div>
                  <button type="button" onClick={() => addVariant(g.key, aud)} style={{ ...btnGhost, marginTop: 10 }}>{t("tpl_add_variant")}</button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Campaigns using the default templates */}
      {unmatchedCampaigns.length > 0 && (
        <div style={{ ...card, padding: "16px 18px" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{t("tpl_unmatched_title")}</p>
          <p style={{ fontSize: 12, color: "#888", margin: "3px 0 12px" }}>{t("tpl_unmatched_hint")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unmatchedCampaigns.map((c) => (
              <div key={c} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #F5F5F5" }}>
                <span style={{ fontSize: 13, color: "#111" }}>{c}</span>
                <button type="button" onClick={() => addGroup(c)} style={btnGhost}>{t("tpl_create_group_for")}</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
