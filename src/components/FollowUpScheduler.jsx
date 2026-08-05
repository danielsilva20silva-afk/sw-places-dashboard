import { useState } from "react";
import { t } from "../labels";
import { branding } from "../config";
import { scheduleFollowUp } from "../api";

const fieldLabel = { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 5px" };
const fieldInput = {
  width: "100%", boxSizing: "border-box", border: "1px solid #E5E5E5", borderRadius: 10,
  padding: "9px 12px", fontSize: 13, color: "#111", background: "white", outline: "none", fontFamily: "inherit",
};

// Default the picker to tomorrow 10:00 (browser-local calendar date; the server
// treats the picked wall-clock as Europe/Lisbon).
function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "Schedule follow-up" — date + time + optional note → a Google Calendar event
// via /api/follow-ups. Self-contained; rendered only when hasFeature("followups").
export default function FollowUpScheduler({ lead, onScheduled }) {
  const [date, setDate] = useState(tomorrowDate());
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [state, setState] = useState("idle"); // idle | saving | done | error
  const [msg, setMsg] = useState("");

  const brand = branding.primaryColor || "#111";
  const busy = state === "saving";

  const submit = async () => {
    if (busy || !date || !time) return;
    setState("saving");
    setMsg("");
    try {
      await scheduleFollowUp({
        leadId: lead.id,
        name: (lead.name || lead.email || "Lead").trim(),
        phone: lead.phone || "",
        email: lead.email || "",
        datetime: `${date}T${time}`,
        note,
      });
      setState("done");
      setMsg(`${t("fu_success_prefix")} ${date} ${time}`);
      setNote("");
      if (onScheduled) onScheduled();
    } catch (e) {
      setState("error");
      setMsg(e?.message || t("fu_error"));
    }
  };

  return (
    <div>
      <p style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>{t("fu_title")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <p style={fieldLabel}>{t("fu_date")}</p>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fieldInput} />
        </div>
        <div>
          <p style={fieldLabel}>{t("fu_time")}</p>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={fieldInput} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <p style={fieldLabel}>{t("fu_note")}</p>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("fu_note_ph")} style={fieldInput} />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy || !date || !time}
        style={{
          background: brand, color: "white", border: "none", borderRadius: 10,
          padding: "10px 16px", fontSize: 13, fontWeight: 600,
          cursor: busy || !date || !time ? "not-allowed" : "pointer",
          opacity: busy || !date || !time ? 0.6 : 1,
        }}
      >
        {busy ? t("fu_scheduling") : t("fu_confirm")}
      </button>
      {msg && (
        <p style={{ margin: "10px 0 0", fontSize: 12, fontWeight: 500, color: state === "error" ? "#BE123C" : "#15803D" }}>
          {state === "error" ? "⚠️ " : "✓ "}{msg}
        </p>
      )}
    </div>
  );
}
