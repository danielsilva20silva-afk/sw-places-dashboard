import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GOLD } from "../constants";
import { hasFeature } from "../config";
import * as api from "../api";
import Avatar from "./Avatar";
import AnaToggle from "./AnaToggle";

// Conversation thread from the Conversas tab. Read-only by default, with an
// "Editar" mode to fix the stored history (edit / delete / add messages) so it
// matches what actually happened on Instagram. Edits only change what Ana READS
// as history — nothing is sent to Instagram.

const isSubscriber = (id) => /^\d+$/.test(String(id));

function displayName(c) {
  if (c.name) return c.name;
  if (c.username) return `@${c.username}`;
  return isSubscriber(c.contact_id) ? "Sem nome" : String(c.contact_id);
}

function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return true;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Time only, or "9 jul, 14:32" when the thread spans multiple days.
function stamp(ts, withDate) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const opts = withDate
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" };
  return d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", ...opts });
}

// A Date → "YYYY-MM-DDTHH:MM" in local time (value for <input type=datetime-local>).
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 10px", fontSize: 13, color: "#111", background: "white", outline: "none", fontFamily: "inherit" };
const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600 };

export default function ConversationDrawer({ conversation: c, onClose, onConvert }) {
  const scrollRef = useRef(null);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);

  // Inline edit of one message
  const [editingRow, setEditingRow] = useState(null);
  const [editText, setEditText] = useState("");

  // Add-message form
  const [adding, setAdding] = useState(false);
  const [addRole, setAddRole] = useState("assistant");
  const [addText, setAddText] = useState("");
  const [addNow, setAddNow] = useState(true);
  const [addWhen, setAddWhen] = useState("");

  // Lock background scroll while the drawer is open. In an iOS standalone PWA an
  // unlocked body keeps the page scroller "attached" and steals touches from the
  // fixed overlay, which is what makes the drawer feel frozen. Restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const load = async (scroll = false) => {
    try {
      const m = await api.getConversation(c.contact_id);
      setMsgs(m);
      if (scroll) setTimeout(scrollToBottom, 0);
    } catch { /* keep what we have */ }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getConversation(c.contact_id)
      .then((m) => { if (alive) setMsgs(m); })
      .catch(() => {})
      .finally(() => { if (alive) { setLoading(false); setTimeout(scrollToBottom, 0); } });
    return () => { alive = false; };
  }, [c.contact_id]);

  const name = displayName(c);
  const spanDays = msgs.length > 1 && !sameDay(msgs[0].timestamp, msgs[msgs.length - 1].timestamp);

  const cancelEdit = () => { setEditingRow(null); setEditText(""); };

  const saveEdit = async (m) => {
    if (busy || !editText.trim()) return;
    setBusy(true);
    try {
      await api.editMessage({ contactId: c.contact_id, row: m.row, timestamp: m.timestamp, message: editText });
      cancelEdit();
      await load();
    } catch (e) {
      alert("Não foi possível guardar. " + (e.message || ""));
      await load();
    } finally { setBusy(false); }
  };

  const removeMsg = async (m) => {
    if (busy) return;
    if (!window.confirm("Eliminar esta mensagem do histórico? A Ana deixa de a ver.")) return;
    setBusy(true);
    try {
      await api.deleteMessage({ contactId: c.contact_id, row: m.row, timestamp: m.timestamp });
      await load();
    } catch (e) {
      alert("Não foi possível eliminar. " + (e.message || ""));
      await load();
    } finally { setBusy(false); }
  };

  const submitAdd = async () => {
    if (busy || !addText.trim()) return;
    const ts = addNow
      ? new Date().toISOString()
      : (addWhen ? new Date(addWhen).toISOString() : new Date().toISOString());
    setBusy(true);
    try {
      await api.addMessage({ contactId: c.contact_id, role: addRole, message: addText, timestamp: ts });
      setAddText(""); setAdding(false);
      await load(true);
    } catch (e) {
      alert("Não foi possível adicionar. " + (e.message || ""));
    } finally { setBusy(false); }
  };

  const convert = async () => {
    if (converting) return;
    setConverting(true);
    const r = await onConvert?.(c);
    setConverting(false);
    if (!r?.ok) alert("Não foi possível converter em lead. Tenta novamente.");
  };

  // Portaled to <body> so the fixed overlay escapes the Dashboard root, which has
  // `overflow-x: hidden`. In an iOS standalone PWA a position:fixed descendant of
  // an overflow-clipped ancestor gets detached from the touch layer — the whole
  // drawer (scroll + × button) goes dead — while normal Safari/Chrome composite it
  // fine. Rendering at the body level removes that ancestor entirely.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "relative", background: "white", width: "100%", maxWidth: 460,
        height: "100%", boxShadow: "-8px 0 40px rgba(0,0,0,0.1)",
        display: "flex", flexDirection: "column",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "calc(20px + env(safe-area-inset-top)) 24px 16px", borderBottom: "1px solid #F0F0F0", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={onClose} style={{ background: "#F5F5F5", border: "none", borderRadius: 8, width: 28, height: 28, fontSize: 16, color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            {c.isLead
              ? <span style={{ fontSize: 11, fontWeight: 600, color: "#15803D", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 20, padding: "3px 10px" }}>✅ Lead</span>
              : c.pendingLead
                ? <span title="Veio de um reel / DM registada — ainda sem telefone ou email" style={{ fontSize: 11, fontWeight: 600, color: "#92400E", background: "#FEF3C7", borderRadius: 20, padding: "3px 10px" }}>Aguarda contacto</span>
                : <span style={{ fontSize: 11, color: "#AAA", background: "#F5F5F5", borderRadius: 20, padding: "3px 10px" }}>Em curso</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={name} size={44} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</h2>
              <p style={{ fontSize: 11, color: "#AAA", margin: "2px 0 0" }}>ID {c.contact_id}</p>
            </div>
            {isSubscriber(c.contact_id) && <AnaToggle subscriberId={String(c.contact_id)} initialActive={c.active} />}
          </div>
        </div>

        {/* Toolbar: read-only / edit toggle */}
        <div style={{ padding: "8px 24px", borderBottom: "1px solid #F5F5F5", display: "flex", justifyContent: "space-between", alignItems: "center", background: "white" }}>
          <span style={{ fontSize: 11, color: edit ? "#8A6D2F" : "#999", fontWeight: edit ? 600 : 400 }}>
            {edit ? "Modo edição" : "Só leitura"}
          </span>
          <button
            onClick={() => { setEdit((e) => !e); cancelEdit(); setAdding(false); }}
            style={{
              fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 8, padding: "5px 12px",
              border: `1px solid ${edit ? GOLD : "#E5E5E5"}`,
              background: edit ? GOLD + "22" : "white",
              color: edit ? "#8A6D2F" : "#555",
            }}
          >{edit ? "Concluir" : "Editar"}</button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, background: "#FAFAF9" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#BBB", fontSize: 13, margin: "auto 0" }}>A carregar…</p>
          ) : msgs.length === 0 ? (
            <p style={{ textAlign: "center", color: "#BBB", fontSize: 13, margin: "auto 0" }}>Sem mensagens nesta conversa.</p>
          ) : msgs.map((m, i) => {
            const isUser = m.role === "user";
            const s = stamp(m.timestamp, spanDays);
            const isEditing = editingRow === m.row;
            return (
              <div key={m.row ?? i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                {isEditing ? (
                  <div style={{ width: "100%" }}>
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.45 }} />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                      <button onClick={() => saveEdit(m)} disabled={busy} style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Guardar</button>
                      <button onClick={cancelEdit} style={{ background: "white", color: "#666", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{
                      maxWidth: "85%", padding: "8px 12px", fontSize: 13, lineHeight: 1.45,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                      borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                      background: isUser ? "#111" : "white",
                      color: isUser ? "white" : "#111",
                      border: isUser ? "none" : "1px solid #EBEBEB",
                    }}>{m.message}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "3px 2px 0" }}>
                      {s && <span style={{ fontSize: 9, color: "#BBB" }}>{s}</span>}
                      {edit && (
                        <>
                          <button onClick={() => { setEditingRow(m.row); setEditText(m.message); }} style={{ ...linkBtn, color: "#8A6D2F" }}>Editar</button>
                          <button onClick={() => removeMsg(m)} disabled={busy} style={{ ...linkBtn, color: "#DC2626" }}>Eliminar</button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid #F0F0F0", background: "white", display: "flex", flexDirection: "column", gap: 10 }}>
          {edit && (
            adding ? (
              <div style={{ border: "1px solid #EBEBEB", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["assistant", "Ana / Gustavo"], ["user", "Pessoa"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setAddRole(val)} style={{
                      flex: 1, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 8, padding: "6px 8px",
                      border: `1.5px solid ${addRole === val ? "#111" : "#E5E5E5"}`,
                      background: addRole === val ? "#111" : "white", color: addRole === val ? "white" : "#555",
                    }}>{lbl}</button>
                  ))}
                </div>
                <textarea value={addText} onChange={(e) => setAddText(e.target.value)} rows={2} placeholder="Texto da mensagem…" style={{ ...inputStyle, resize: "vertical" }} />
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#666", cursor: "pointer" }}>
                  <input type="checkbox" checked={addNow} onChange={(e) => setAddNow(e.target.checked)} /> Agora
                </label>
                {!addNow && <input type="datetime-local" value={addWhen} onChange={(e) => setAddWhen(e.target.value)} style={inputStyle} />}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={submitAdd} disabled={busy || !addText.trim()} style={{ flex: 1, background: "#111", color: "white", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: busy || !addText.trim() ? "default" : "pointer", opacity: busy || !addText.trim() ? 0.6 : 1 }}>Adicionar</button>
                  <button onClick={() => { setAdding(false); setAddText(""); }} style={{ background: "white", color: "#666", border: "1px solid #E5E5E5", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAdding(true); setAddNow(true); setAddWhen(toLocalInput(new Date())); }} style={{ background: "white", color: "#555", border: "1px dashed #CCC", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Adicionar mensagem</button>
            )
          )}

          {hasFeature("ana") && !c.isLead && isSubscriber(c.contact_id) && (
            <button onClick={convert} disabled={converting} style={{
              width: "100%", background: "#111", color: "white", border: "none", borderRadius: 12,
              padding: "12px", fontSize: 14, fontWeight: 600, cursor: converting ? "default" : "pointer", opacity: converting ? 0.7 : 1,
            }}>{converting ? "A converter…" : "Converter em lead"}</button>
          )}

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, flexShrink: 0, marginTop: 4 }} />
            <span style={{ fontSize: 11, color: "#999", lineHeight: 1.4 }}>
              {edit
                ? "Editar aqui só altera o histórico que a Ana lê. Não envia nada para o Instagram."
                : "Vista só de leitura. As respostas são geridas pela Ana no Instagram."}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
