import config, { CLIENT } from "./_config.js";

// New-lead email notifications via Resend. Not a route (leading underscore).
// Gated by the per-client `notifications` flag (api/_config.js) and by env:
//   RESEND_API_KEY      Resend API key (server only)
//   NOTIFY_EMAILS       comma-separated recipient list
//   NOTIFY_FROM_EMAIL   sender, e.g. "SW Places Leads <leads@teu-dominio.com>"
//                       (optional; defaults to Resend's test sender)
//   NOTIFY_DASHBOARD_URL  dashboard base URL for the link (optional; per-client default)
// Every send is best-effort: notifyNewLead never throws, so a failed email can
// never break the lead flow. Call it inside the caller's waitUntil (fire-and-forget).

// ── Contact validation (same semantics as the frontend isRealLead / utils.js) ──
function isPlaceholder(v) {
  if (typeof v !== "string") return true;
  const s = v.trim();
  return s === "" || s.startsWith("{{");
}
function hasValidEmail(v) {
  if (isPlaceholder(v)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function hasValidPhone(v) {
  if (isPlaceholder(v)) return false;
  return v.replace(/[^0-9]/g, "").length >= 7;
}
// A lead is notifiable once it has a reachable CONTACT (phone or email). This is
// the "tem telefone ou email" half of isRealLead — a name-only or contact-less
// row is not notified.
export function hasContact(lead) {
  return hasValidPhone(lead?.phone) || hasValidEmail(lead?.email);
}

// Dedup: only notify when a lead BECOMES contactable — it had no contact before
// and has one now. On creation pass before=null (notify iff the new lead has a
// contact); on an update pass the prior row (so a lead that already had a contact
// is never notified twice).
export function becameContactable(before, after) {
  const had = before ? hasContact(before) : false;
  return hasContact(after) && !had;
}

// Map a Leads sheet row (A..O) to the minimal lead shape the notifier reads.
// Used by the ai-reply.js upsertLead hook (which works with row arrays).
export function leadFromSheetRow(r) {
  if (!r) return null;
  return {
    id: r[0] ?? "",
    name: r[1] ?? "",
    email: r[2] ?? "",
    phone: r[3] ?? "",
    budget: r[4] ?? "",
    intention: r[5] ?? "",
    source: r[6] ?? "",
    notes: r[9] ?? "",
    source_content: r[12] ?? "",
    source_url: r[14] ?? "",
  };
}

// ── Email building ──
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clean = (v) => (isPlaceholder(v) ? "" : String(v).trim());

// wa.me digits: strip non-digits; a bare 9-digit PT number gets the 351 prefix.
function waDigits(phone) {
  const d = String(phone || "").replace(/[^0-9]/g, "");
  if (d.length === 9 && /^[239]/.test(d)) return "351" + d;
  return d;
}

function dashboardUrl() {
  if (process.env.NOTIFY_DASHBOARD_URL) return process.env.NOTIFY_DASHBOARD_URL.replace(/\/+$/, "");
  return CLIENT === "brandon"
    ? "https://brandon-dashboard-one.vercel.app"
    : "https://sw-places-dashboard.vercel.app";
}

function displayName(lead) {
  return clean(lead.name) || clean(lead.email) || clean(lead.phone) || "Sem nome";
}

// Gently humanize an origin label: an all-caps tag ("REEL 300K MAR") becomes
// title case ("Reel 300k Mar"); a label the person already wrote in mixed case
// ("Reel Carrascalinho") is left as-is.
function humanizeSource(s) {
  const t = String(s || "").trim();
  if (!t || t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(/\s+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

// "18 ago, 14:32" in Europe/Lisbon. Uses the lead's created_at when present,
// otherwise now (the moment the lead came in / the email is built).
function lisbonWhen(lead) {
  const raw = clean(lead.created_at);
  const d = raw ? new Date(raw) : new Date();
  const when = isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(when);
}

export function buildEmail(lead) {
  const name = displayName(lead);
  const sourceContent = clean(lead.source_content);
  const source = clean(lead.source);
  const phone = clean(lead.phone);
  const email = clean(lead.email);
  const budget = clean(lead.budget);
  const intention = clean(lead.intention);
  const notes = clean(lead.notes);
  const sourceUrl = clean(lead.source_url);
  const wa = phone ? waDigits(phone) : "";
  const when = lisbonWhen(lead);
  const dash = dashboardUrl();

  const tag = sourceContent || source;
  const subject = `Novo lead 🏡 ${name}${tag ? ` · ${tag}` : ""}`;

  // "Veio de": humanized content (linked to the reel), else a friendly label.
  let veioDe = sourceContent ? humanizeSource(sourceContent) : (source === "DM · ANA" ? "Mensagem direta no Instagram" : source);
  const veioDeHtml = sourceUrl && veioDe
    ? `<a href="${esc(sourceUrl)}" style="color:#8A6D2F;font-weight:600;text-decoration:none">${esc(veioDe)} ↗</a>`
    : esc(veioDe);

  // Primary CTA: WhatsApp if there's a phone, else email.
  const primary = phone && wa
    ? `<a href="https://wa.me/${esc(wa)}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 26px;font-size:16px;font-weight:700">📞 Abrir WhatsApp</a>
        <div style="font-size:13px;color:#999;margin-top:8px">${esc(phone)}</div>`
    : email
      ? `<a href="mailto:${esc(email)}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 26px;font-size:16px;font-weight:700">✉️ Enviar email</a>`
      : "";

  const subtitle = intention ? `${esc(intention)} · entrou ${esc(when)}` : `entrou ${esc(when)}`;
  const budgetLine = budget ? `<div style="font-size:13px;color:#999;margin-top:6px">Orçamento · ${esc(budget)}</div>` : "";
  // Show the email as a discreet line only when it isn't already the primary CTA.
  const emailLine = phone && email ? `<div style="font-size:13px;color:#999;margin-top:2px">${esc(email)}</div>` : "";
  const label = (t) => `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#B0A99B;font-weight:700">${t}</div>`;
  const pad = "padding:0 32px";

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0EEEA;margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #ECE9E3;border-radius:14px">
      <tr><td style="${pad};padding-top:28px"><div style="font-size:13px;font-weight:700;letter-spacing:3px;color:#C9A96E">SW PLACES</div></td></tr>
      <tr><td style="${pad};padding-top:18px">
        <div style="font-size:26px;line-height:1.2;font-weight:700;color:#1a1a1a">${esc(name)}</div>
        <div style="font-size:14px;color:#888;margin-top:6px">${subtitle}</div>
        ${budgetLine}${emailLine}
      </td></tr>
      ${primary ? `<tr><td style="${pad};padding-top:22px">${primary}</td></tr>` : ""}
      ${veioDe ? `<tr><td style="${pad};padding-top:26px">${label("Veio de")}<div style="font-size:15px;color:#1a1a1a;margin-top:5px">${veioDeHtml}</div></td></tr>` : ""}
      ${notes ? `<tr><td style="${pad};padding-top:26px">${label("O que disse à Ana")}<div style="background:#F7F5F2;border-left:3px solid #C9A96E;border-radius:0 8px 8px 0;padding:14px 16px;margin-top:8px;font-size:14px;color:#4a4a4a;line-height:1.55;white-space:pre-wrap">${esc(notes)}</div></td></tr>` : ""}
      <tr><td style="${pad};padding-top:26px"><a href="${esc(dash)}" style="display:inline-block;border:1px solid #C9A96E;color:#8A6D2F;text-decoration:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:600">Ver no dashboard →</a></td></tr>
      <tr><td style="${pad};padding-top:26px;padding-bottom:28px"><div style="border-top:1px solid #F0EEEA;padding-top:14px;font-size:12px;color:#B0A99B">Notificação automática · SW Places Leads</div></td></tr>
    </table>
  </td></tr>
</table>`;

  // Plain-text alternative for clients without HTML.
  const t = [];
  t.push("SW PLACES — Novo lead", "", name, intention ? `${intention} · entrou ${when}` : `entrou ${when}`);
  if (budget) t.push(`Orçamento: ${budget}`);
  if (phone && wa) t.push("", `WhatsApp: https://wa.me/${wa} (${phone})`);
  else if (email) t.push("", `Email: ${email}`);
  if (phone && email) t.push(`Email: ${email}`);
  if (veioDe) t.push("", `Veio de: ${veioDe}${sourceUrl ? ` (${sourceUrl})` : ""}`);
  if (notes) t.push("", "O que disse à Ana:", notes);
  t.push("", `Ver no dashboard: ${dash}`, "", "Notificação automática · SW Places Leads");
  const text = t.join("\n");

  return { subject, html, text };
}

// Send a new-lead notification. Best-effort: never throws, never blocks the flow.
export async function notifyNewLead(lead) {
  try {
    if (!config.notifications) return; // feature off for this client
    if (!lead || !hasContact(lead)) return; // only contactable leads
    const apiKey = process.env.RESEND_API_KEY;
    const to = (process.env.NOTIFY_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!apiKey || to.length === 0) {
      console.warn("[notify] skipped: RESEND_API_KEY or NOTIFY_EMAILS not set");
      return;
    }
    const from = process.env.NOTIFY_FROM_EMAIL || "SW Places Leads <onboarding@resend.dev>";
    const { subject, html, text } = buildEmail(lead);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[notify] Resend HTTP ${res.status}: ${body}`);
      return;
    }
    console.log(`[notify] new-lead email sent for ${lead.id ?? "?"} to ${to.join(", ")}`);
  } catch (e) {
    console.error("[notify] notifyNewLead failed:", e?.message);
  }
}

// Convenience for callers: notify only if the lead just became contactable.
// Returns a promise safe to hand to waitUntil (never rejects).
export function notifyOnNewContact(before, after) {
  if (!becameContactable(before, after)) return Promise.resolve();
  return notifyNewLead(after);
}
