import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { STATUSES, STATUS_CONFIG, calendarTriggerStatus, statusRoles } from "../constants";
import { branding, hasFeature } from "../config";
import { leadWhen, isValidEmail, isValidPhone, cleanField, waNumber, emailHref, emailOpensNewTab } from "../utils";
import Avatar from "./Avatar";
import AnaToggle from "./AnaToggle";
import LeadConversation from "./LeadConversation";

// Per-client WhatsApp message for the "Sem resposta" button (empty when the
// client hasn't configured one → the button is hidden).
const WA_NO_ANSWER = branding.noAnswerMessage || "";
const TEXT_KEYS = ["name", "email", "phone", "budget", "intention", "manual_notes"];
const SAVE_DEBOUNCE = 900;

const fieldInput = {
  width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10,
  padding: "9px 12px", fontSize: 13, color: "#111", background: "white", outline: "none", fontFamily: "inherit",
};
const fieldLabel = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 5px" };

export default function LeadDrawer({ lead, onClose, onUpdate, onDelete, onRequestMeeting }) {
  const [name, setName] = useState(lead.name || "");
  const [email, setEmail] = useState(lead.email || "");
  const [phone, setPhone] = useState(lead.phone || "");
  const [budget, setBudget] = useState(lead.budget || "");
  const [intention, setIntention] = useState(lead.intention || "");
  const [status, setStatus] = useState(lead.status);
  const [manualNotes, setManualNotes] = useState(lead.manual_notes || "");
  const [deleting, setDeleting] = useState(false);
  const [save, setSave] = useState("idle"); // idle | saving | saved | error

  // Lock background scroll while the drawer is open. In an iOS standalone PWA an
  // unlocked body keeps the page scroller "attached" and steals touches from the
  // fixed overlay, which is what makes the drawer feel frozen. Restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // notes (Ana's auto conversation summary) is READ-ONLY here.
  const summary = (cleanField(lead.notes) || "").trim();

  // Refs so the debounced/close/unmount flush always reads current values.
  const fieldsRef = useRef({ name: lead.name || "", email: lead.email || "", phone: lead.phone || "", budget: lead.budget || "", intention: lead.intention || "", manual_notes: lead.manual_notes || "" });
  const savedRef = useRef({ ...fieldsRef.current });
  const timerRef = useRef(null);
  const fadeRef = useRef(null);
  const aliveRef = useRef(true);
  const lastPatchRef = useRef(null); // for retry after a failed save
  const flushRef = useRef(() => {});

  const phoneOk = isValidPhone(phone);
  const emailOk = isValidEmail(email);
  const igHandle = (cleanField(lead.username) || "").replace(/^@+/, "").trim();
  const igOk = igHandle.length > 0;
  const sourceContent = (cleanField(lead.source_content) || "").trim();
  const sourceOk = /^https?:\/\//i.test(sourceContent);
  const reelUrl = (cleanField(lead.source_url) || "").trim();
  const reelOk = /^https?:\/\//i.test(reelUrl);
  const isAnaSubscriber = hasFeature("ana") && lead.source === "DM · ANA" && /^\d+$/.test(String(lead.id));

  const persist = async (patch) => {
    if (!patch || Object.keys(patch).length === 0) return;
    if (aliveRef.current) setSave("saving");
    const r = await onUpdate(lead.id, patch);
    if (r?.ok) {
      Object.assign(savedRef.current, patch);
      lastPatchRef.current = null;
      if (aliveRef.current) {
        setSave("saved");
        clearTimeout(fadeRef.current);
        fadeRef.current = setTimeout(() => { if (aliveRef.current) setSave("idle"); }, 1600);
      }
    } else {
      lastPatchRef.current = patch; // keep the typed values, allow retry
      if (aliveRef.current) setSave("error");
    }
  };

  // Save any text fields that differ from what's on the server.
  const flushText = () => {
    clearTimeout(timerRef.current);
    const cur = fieldsRef.current;
    const patch = {};
    for (const k of TEXT_KEYS) if (cur[k] !== savedRef.current[k]) patch[k] = cur[k];
    if (Object.keys(patch).length) persist(patch);
  };
  flushRef.current = flushText;

  const scheduleFlush = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), SAVE_DEBOUNCE);
  };

  // Flush a pending debounced save when the drawer unmounts.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimeout(timerRef.current);
      clearTimeout(fadeRef.current);
      flushRef.current();
    };
  }, []);

  // Input binding: local state + ref update + debounced save; flush on blur.
  const bind = (key, val, setter) => ({
    value: val,
    onChange: (e) => { setter(e.target.value); fieldsRef.current[key] = e.target.value; scheduleFlush(); },
    onBlur: () => flushText(),
  });

  const pickStatus = (s) => {
    setStatus(s);
    // When calendar is enabled, selecting the client's meeting status opens the
    // calendar form pre-filled with the lead's current (edited) details; that
    // flow owns persisting the status. Calendar-less clients skip straight to save.
    if (hasFeature("calendar") && s === calendarTriggerStatus && onRequestMeeting) {
      onRequestMeeting({ ...lead, ...fieldsRef.current });
      return;
    }
    persist({ status: s }); // every other status saves immediately
  };

  const handleClose = () => { clearTimeout(timerRef.current); flushText(); onClose(); };

  const retry = () => { if (lastPatchRef.current) persist(lastPatchRef.current); };

  const handleDelete = async () => {
    if (deleting) return;
    if (!window.confirm("Tens a certeza que queres eliminar este lead?")) return;
    setDeleting(true);
    const ok = await onDelete(lead.id);
    if (ok) onClose();
    else { setDeleting(false); alert("Não foi possível eliminar o lead. Tenta novamente."); }
  };

  // Portaled to <body> so the fixed overlay escapes the Dashboard root, which has
  // `overflow-x: hidden`. In an iOS standalone PWA a position:fixed descendant of
  // an overflow-clipped ancestor gets detached from the touch layer — the whole
  // drawer (scroll + × button) goes dead — while normal Safari/Chrome composite it
  // fine. Rendering at the body level removes that ancestor entirely.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }} onClick={handleClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "relative", background: "white", width: "100%", maxWidth: 420,
        height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.1)",
        display: "flex", flexDirection: "column",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "calc(20px + env(safe-area-inset-top)) 24px 16px", borderBottom: "1px solid #F0F0F0", position: "sticky", top: 0, background: "white", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={handleClose} style={{ background: "#F5F5F5", border: "none", borderRadius: 8, width: 28, height: 28, fontSize: 16, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            <span style={{ fontSize: 12, color: "#AAA" }}>{leadWhen(lead)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={name} size={48} />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name || "Sem nome"}</h2>
              <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>{lead.source}</p>
              {reelOk && (
                <a href={reelUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#8A6D2F", fontWeight: 600, textDecoration: "none", margin: "5px 0 0" }}>🎬 Ver reel ↗</a>
              )}
            </div>
          </div>
        </div>
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          {(phoneOk || emailOk || igOk) ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {phoneOk && (
                <a href={`tel:${phone}`} style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#16A34A", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>📞 Ligar</a>
              )}
              {phoneOk && (
                <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>💬 WhatsApp</a>
              )}
              {emailOk && (
                <a href={emailHref(email)} {...(emailOpensNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#2563EB", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>✉️ Email</a>
              )}
              {igOk && (
                <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(45deg, #F58529, #DD2A7B, #8134AF)", color: "white", borderRadius: 12, padding: "12px", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>📷 Instagram</a>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F7F4", color: "#AAA", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 500 }}>Sem contacto válido</div>
          )}
          {isAnaSubscriber && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#F8F7F4", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>Assistente Ana</p>
                <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>Desliga para responderes tu (a Ana fica em silêncio no Instagram).</p>
              </div>
              <AnaToggle subscriberId={String(lead.id)} />
            </div>
          )}
          {/* Editable details (auto-save) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <p style={fieldLabel}>Nome</p>
              <input {...bind("name", name, setName)} placeholder="Nome do lead" style={fieldInput} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <p style={fieldLabel}>Email</p>
                <input {...bind("email", email, setEmail)} placeholder="email@…" style={fieldInput} />
              </div>
              <div>
                <p style={fieldLabel}>Telefone</p>
                <input {...bind("phone", phone, setPhone)} placeholder="+351…" style={fieldInput} />
              </div>
              <div>
                <p style={fieldLabel}>Orçamento</p>
                <input {...bind("budget", budget, setBudget)} placeholder="ex. 300k–500k" style={fieldInput} />
              </div>
              <div>
                <p style={fieldLabel}>Intenção</p>
                <input {...bind("intention", intention, setIntention)} placeholder="ex. investir" style={fieldInput} />
              </div>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>Estado</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STATUSES.map(s => {
                const c = STATUS_CONFIG[s]; const active = status === s;
                return <button key={s} onClick={() => pickStatus(s)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1.5px solid ${active ? c.dot : "#E5E5E5"}`, background: active ? c.bg : "white", color: active ? c.text : "#555", cursor: "pointer" }}>{s}</button>;
              })}
            </div>
            {statusRoles.noAnswer && status === statusRoles.noAnswer && phoneOk && WA_NO_ANSWER && (
              <a href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(WA_NO_ANSWER)}`} target="_blank" rel="noopener noreferrer" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12,
                background: "#25D366", color: "white", borderRadius: 10, padding: "11px", textDecoration: "none",
                fontSize: 13, fontWeight: 600,
              }}>💬 Enviar WhatsApp</a>
            )}
          </div>
          {summary && (
            <div>
              <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" }}>Resumo da conversa</p>
              <div style={{ background: "#FAFAF9", border: "1px solid #F0F0F0", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#666", fontStyle: "italic", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{summary}</div>
            </div>
          )}
          <div>
            <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px" }}>Notas</p>
            <textarea {...bind("manual_notes", manualNotes, setManualNotes)} placeholder="As tuas notas sobre este lead..." rows={4} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#111", resize: "none", outline: "none", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
          {sourceOk && (
            <div>
              <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>Publicação de origem</p>
              <a href={sourceContent} target="_blank" rel="noopener noreferrer" style={{
                display: "flex", alignItems: "center", gap: 8, background: "#F8F7F4", borderRadius: 10,
                padding: "10px 12px", textDecoration: "none", fontSize: 12, color: "#8A6D2F", fontWeight: 600, wordBreak: "break-all",
              }}>📷 Ver publicação partilhada ↗</a>
            </div>
          )}
          {hasFeature("ana") && <LeadConversation lead={lead} />}
          <button onClick={handleDelete} disabled={deleting} style={{
            width: "100%", background: "#FFF1F2", color: "#DC2626",
            border: "1px solid #FECDD3", borderRadius: 10, padding: "11px",
            fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer",
            opacity: deleting ? 0.6 : 1,
          }}>{deleting ? "A eliminar…" : "🗑 Eliminar lead"}</button>
        </div>
        {/* Auto-save indicator (replaces the old Guardar/Cancelar buttons) */}
        <div style={{ padding: "12px 24px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid #F0F0F0", position: "sticky", bottom: 0, background: "white" }}>
          {save === "error" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#BE123C", fontWeight: 500 }}>Não foi possível guardar.</span>
              <button onClick={retry} style={{ fontSize: 12, fontWeight: 600, color: "#111", background: "white", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Tentar de novo</button>
            </div>
          ) : (
            <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: save === "saved" ? "#15803D" : "#AAA", transition: "color 0.2s" }}>
              {save === "saving" ? "A guardar…" : save === "saved" ? "Guardado ✓" : "As alterações guardam-se automaticamente."}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
