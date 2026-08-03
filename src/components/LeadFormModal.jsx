import { useState } from "react";
import { t } from "../labels";

const labelStyle = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, display: "block", marginBottom: 6 };
const inputStyle = { width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", color: "#111", boxSizing: "border-box", fontFamily: "inherit", background: "white" };

// Manual lead creation. onCreate(fields) → { ok, error? }; modal closes on ok.
export default function LeadFormModal({ onClose, onCreate }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", budget: "", intention: "", zone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.name.trim()) { setError(t("nl_err_name")); return; }
    if (!f.email.trim() && !f.phone.trim()) { setError(t("nl_err_contact")); return; }
    setSaving(true);
    const r = await onCreate(f);
    setSaving(false);
    if (r?.ok) onClose();
    else setError(t("nl_err_failed"));
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto", padding: 24, boxShadow: "0 12px 48px rgba(0,0,0,0.18)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: "0 0 18px" }}>{t("nl_title")}</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t("nl_name")}</label>
          <input value={f.name} onChange={set("name")} placeholder={t("nl_name_ph")} style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("nl_email")}</label>
            <input value={f.email} onChange={set("email")} placeholder={t("nl_email_ph")} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("nl_phone")}</label>
            <input value={f.phone} onChange={set("phone")} placeholder={t("nl_phone_ph")} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("nl_budget")}</label>
            <input value={f.budget} onChange={set("budget")} placeholder={t("nl_budget_ph")} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("nl_intention")}</label>
            <select value={f.intention} onChange={set("intention")} style={{ ...inputStyle, cursor: "pointer" }}>
              {t("nl_intention_opts").map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t("nl_zone")}</label>
          <input value={f.zone} onChange={set("zone")} placeholder={t("nl_zone_ph")} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>{t("nl_notes")}</label>
          <textarea value={f.notes} onChange={set("notes")} placeholder={t("nl_notes_ph")} rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        </div>

        {error && (
          <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "9px 12px", fontSize: 12, marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={saving} style={{ flex: 1, background: saving ? "#888" : "#111", color: "white", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>{saving ? t("nl_creating") : t("nl_create")}</button>
          <button type="button" onClick={onClose} style={{ padding: "12px 18px", border: "1px solid #E5E5E5", borderRadius: 12, fontSize: 14, color: "#555", background: "white", cursor: "pointer" }}>{t("nl_cancel")}</button>
        </div>
      </form>
    </div>
  );
}
