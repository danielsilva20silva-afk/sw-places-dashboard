import { useState } from "react";
import { GOLD } from "../constants";
import * as api from "../api";

// TEMPORARY tab. Recover pre-Ana Instagram DMs: paste the person's handle + the
// message they sent, generate Ana's reply, copy it into Instagram by hand
// (these are outside Meta's 24h window, so nothing is auto-sent), then confirm
// to save both turns to the conversation history — so when the person replies,
// live Ana already has the full context.

const input = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14,
  border: "1px solid #E5E5E5", borderRadius: 10, outline: "none", background: "white", color: "#111",
};
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#555", margin: "0 0 6px" };

// Default text for the "Registar DM enviada" form — the flow's template message,
// editable before sending. Kept between serial registrations of the same post.
const DM_TEMPLATE = "Olá! Obrigado pelo interesse nesta propriedade 🙂\n\nDeixa-me o teu número e envio-te todas as fotos e detalhes por WhatsApp.";

function methodNote(method) {
  if (method === "username") return "Correspondência exata pelo @handle.";
  if (method === "single-result") return "Único resultado para esse handle — confirma que é a pessoa certa.";
  if (method === "subscriber_id") return "Resolvido pelo Subscriber ID.";
  return "";
}

// ── "Registar DM enviada" ──
// The consultant started a conversation by hand on Instagram (a DM that never
// went through ManyChat), so it isn't in Ana's history. This logs that message as
// an assistant turn (via /api/log-flow-message) so Ana has context when the
// person replies. Person-specific fields clear on success; the template message
// and reel source are kept for logging several DMs from the same post in a row.
function RegisterManualDm() {
  const [subscriberId, setSubscriberId] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState(DM_TEMPLATE);
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const sid = subscriberId.trim();
  const sidLooksOff = sid !== "" && !/^\d+$/.test(sid);

  const submit = async () => {
    setError(""); setDone(false);
    if (!sid) { setError("Indica o Subscriber ID do ManyChat."); return; }
    if (!message.trim()) { setError("Escreve a mensagem que enviaste."); return; }
    setBusy(true);
    try {
      await api.logFlowMessage({
        subscriberId: sid,
        message: message.trim(),
        name: name.trim(),
        username: username.trim().replace(/^@+/, ""),
        sourceContent: sourceContent.trim(),
        sourceUrl: sourceUrl.trim(),
      });
      // Keep the template message + reel source for serial registrations of the
      // same post; clear only the person-specific fields.
      setSubscriberId(""); setUsername(""); setName("");
      setDone(true);
    } catch (e) {
      setError(e.message || "Não foi possível registar. Verifica a ligação e tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", padding: 24, maxWidth: 720, marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>Registar DM enviada</h2>
      <p style={{ fontSize: 12, color: "#888", margin: "4px 0 18px", maxWidth: 620 }}>
        Enviaste uma DM manualmente no Instagram (fora do ManyChat)? Regista-a aqui para a Ana ter o contexto quando a pessoa responder.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Subscriber ID</label>
          <input value={subscriberId} onChange={(e) => { setSubscriberId(e.target.value); setDone(false); }} placeholder="ex. 200154251"
            style={{ ...input, borderColor: sidLooksOff ? "#D97706" : "#E5E5E5" }} />
          <p style={{ fontSize: 11, color: sidLooksOff ? "#92400E" : "#AAA", margin: "6px 0 0" }}>
            {sidLooksOff
              ? "Normalmente é só números — confirma o ID (podes registar na mesma)."
              : "ManyChat → Contactos → abre a pessoa → o id está na URL / ficha."}
          </p>
        </div>
        <div>
          <label style={labelStyle}>Username do Instagram <span style={{ color: "#AAA", fontWeight: 400 }}>(opcional)</span></label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@joaosilva" style={input} />
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Nome <span style={{ color: "#AAA", fontWeight: 400 }}>(opcional)</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="João Silva" style={input} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Mensagem enviada</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
          placeholder="A mensagem que enviaste à pessoa…"
          style={{ ...input, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div>
          <label style={labelStyle}>Conteúdo de origem <span style={{ color: "#AAA", fontWeight: 400 }}>(opcional)</span></label>
          <input value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} placeholder="ex. REEL 300K MAR" style={input} />
        </div>
        <div>
          <label style={labelStyle}>Link do reel <span style={{ color: "#AAA", fontWeight: 400 }}>(opcional)</span></label>
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://instagram.com/reel/…" style={input} />
        </div>
      </div>

      <button onClick={submit} disabled={busy} style={{
        background: "#111", color: "white", border: "none", borderRadius: 10,
        padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      }}>{busy ? "A registar…" : "Registar"}</button>

      {done && (
        <div style={{ marginTop: 14, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
          ✓ Registado — quando a pessoa responder, a Ana continua a conversa. Podes registar já a próxima (mensagem e origem ficaram preenchidas).
        </div>
      )}
      {error && (
        <div style={{ marginTop: 14, background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}

export default function RecuperarTab() {
  const [handle, setHandle] = useState("");
  const [subscriberId, setSubscriberId] = useState("");
  const [message, setMessage] = useState("");

  const [phase, setPhase] = useState("input"); // input | result | saved
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needSid, setNeedSid] = useState(false);

  const [result, setResult] = useState(null); // { subscriber_id, name, username, method }
  const [reply, setReply] = useState("");       // editable — reflects what will be saved
  const [copied, setCopied] = useState(false);

  const displayName = result
    ? (result.name || (result.username ? `@${result.username}` : `ID ${result.subscriber_id}`))
    : "";

  const generate = async () => {
    setError("");
    if (!message.trim()) { setError("Cola a mensagem que a pessoa enviou."); return; }
    if (!handle.trim() && !subscriberId.trim()) { setError("Indica o handle do Instagram ou o Subscriber ID."); return; }
    setBusy(true);
    try {
      const data = await api.recoverGenerate({
        handle: handle.trim(), subscriberId: subscriberId.trim(), message: message.trim(),
      });
      setResult(data);
      setReply(data.reply || "");
      setNeedSid(false);
      setPhase("result");
    } catch (e) {
      setError(e.message || "Erro ao gerar a resposta.");
      if (e.needSubscriberId) setNeedSid(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — Gustavo can select manually */ }
  };

  const save = async () => {
    setError("");
    if (!reply.trim()) { setError("A resposta está vazia."); return; }
    setBusy(true);
    try {
      await api.recoverSave({
        subscriberId: result.subscriber_id,
        message: message.trim(),
        reply: reply.trim(),
        name: result.name || "",
        username: result.username || "",
      });
      setPhase("saved");
    } catch (e) {
      setError(e.message || "Erro ao guardar no histórico.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setHandle(""); setSubscriberId(""); setMessage("");
    setResult(null); setReply(""); setError(""); setNeedSid(false);
    setPhase("input");
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>Recuperar conversas</h2>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FEF3C7", borderRadius: 6, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Temporário</span>
        </div>
        <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0", maxWidth: 620 }}>
          Para DMs anteriores à Ana (fora da janela de 24h do Instagram). Gera a resposta, copia para o Instagram à mão e guarda no histórico — assim a Ana continua a conversa quando a pessoa responder.
        </p>
      </div>

      <div style={{ background: "white", borderRadius: 16, border: "1px solid #EBEBEB", padding: 24, maxWidth: 720 }}>
        {/* ── Inputs ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Handle do Instagram</label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@joaosilva"
              disabled={phase !== "input"} style={{ ...input, opacity: phase !== "input" ? 0.6 : 1 }} />
          </div>
          <div>
            <label style={labelStyle}>Subscriber ID <span style={{ color: "#AAA", fontWeight: 400 }}>(opcional)</span></label>
            <input value={subscriberId} onChange={(e) => setSubscriberId(e.target.value)} placeholder="ex. 200154251"
              disabled={phase !== "input"}
              style={{ ...input, opacity: phase !== "input" ? 0.6 : 1, borderColor: needSid ? "#D97706" : "#E5E5E5" }} />
          </div>
        </div>
        {needSid && (
          <p style={{ fontSize: 12, color: "#92400E", margin: "-6px 0 14px" }}>
            Não deu para encontrar pelo handle. Abre a conversa no ManyChat, copia o Subscriber ID e cola-o acima.
          </p>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Mensagem que a pessoa enviou</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
            placeholder="Cola aqui a mensagem original da pessoa…"
            disabled={phase !== "input"}
            style={{ ...input, resize: "vertical", fontFamily: "inherit", opacity: phase !== "input" ? 0.6 : 1 }} />
        </div>

        {phase === "input" && (
          <button onClick={generate} disabled={busy} style={{
            background: "#111", color: "white", border: "none", borderRadius: 10,
            padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}>{busy ? "A gerar…" : "Gerar resposta da Ana"}</button>
        )}

        {error && (
          <div style={{ marginTop: 14, background: "#FFF1F2", border: "1px solid #FECDD3", color: "#BE123C", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>{error}</div>
        )}

        {/* ── Result ── */}
        {(phase === "result" || phase === "saved") && result && (
          <div style={{ marginTop: 20, borderTop: "1px solid #F0F0F0", paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0 }}>Para: {displayName}</p>
                <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>
                  Subscriber ID {result.subscriber_id}{result.method ? ` · ${methodNote(result.method)}` : ""}
                </p>
              </div>
              <button onClick={copy} style={{
                background: copied ? "#16A34A" : GOLD, color: copied ? "white" : "#000", border: "none", borderRadius: 8,
                padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}>{copied ? "Copiado ✓" : "Copiar"}</button>
            </div>

            <label style={labelStyle}>Resposta da Ana <span style={{ color: "#AAA", fontWeight: 400 }}>(podes editar antes de enviar)</span></label>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={7}
              disabled={phase === "saved"}
              style={{ ...input, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, background: phase === "saved" ? "#FAFAFA" : "white" }} />

            {phase === "result" && (
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <button onClick={save} disabled={busy} style={{
                  background: "#111", color: "white", border: "none", borderRadius: 10,
                  padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}>{busy ? "A guardar…" : "Já enviei — guardar no histórico"}</button>
                <button onClick={reset} disabled={busy} style={{
                  background: "transparent", color: "#888", border: "1px solid #E5E5E5", borderRadius: 10,
                  padding: "11px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer",
                }}>Cancelar</button>
              </div>
            )}

            {phase === "saved" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
                  ✓ Guardado no histórico. Quando esta pessoa responder, a Ana continua a conversa com todo o contexto.
                </div>
                <button onClick={reset} style={{
                  background: "#111", color: "white", border: "none", borderRadius: 10,
                  padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>Recuperar outra conversa</button>
              </div>
            )}
          </div>
        )}
      </div>

      <RegisterManualDm />
    </>
  );
}
