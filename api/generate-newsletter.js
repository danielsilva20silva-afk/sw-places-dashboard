import Anthropic from "@anthropic-ai/sdk";

// Vercel serverless function (Node runtime). Generates SW Places newsletter
// copy server-side so the Anthropic API key never reaches the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada no servidor." });
  }

  // Vercel parses JSON bodies automatically for Node functions.
  const { topic, segment } = req.body ?? {};
  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return res.status(400).json({ error: "Campo 'topic' em falta." });
  }
  const seg = segment && String(segment).trim() ? String(segment) : "todos os leads";

  const prompt = `Escreve uma newsletter imobiliária para Gustavo Miguel, consultor SW Places na Costa Vicentina, Portugal.

Tema: ${topic}
Segmento: ${seg}

Regras:
- Tom pessoal, direto
- Frases curtas
- Máximo 180 palavras
- Começa com frase de impacto
- Termina com CTA simples
- Português de Portugal

Apenas o corpo, sem assunto.`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return res.status(200).json({ text });
  } catch (err) {
    console.error("generate-newsletter error:", err);
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ error: "Falha ao gerar a newsletter." });
  }
}
