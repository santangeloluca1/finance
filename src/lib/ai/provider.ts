/**
 * Chiamata al modello. Oggi Google Gemini (GEMINI_API_KEY, modello in
 * GEMINI_MODEL); l'interfaccia è indipendente dal servizio, così si può
 * cambiare fornitore senza toccare il resto dell'app.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export class NoKeyError extends Error {}

const DEFAULT_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-2.5-flash";

export function aiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

export async function generate(opts: { system: string; turns: ChatTurn[]; schema?: object; temperature?: number }): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new NoKeyError("GEMINI_API_KEY mancante");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
    },
  });
  const call = (model: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      cache: "no-store",
    });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let res = await call(model);
  // Se l'alias del modello non esiste più, si ripiega su un modello noto.
  if (res.status === 404 && model !== FALLBACK_MODEL) res = await call(FALLBACK_MODEL);
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Limite di richieste gratuite raggiunto: riprova tra qualche minuto.");
    throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 300)}`);
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  if (!text) throw new Error(`Risposta vuota (${json.candidates?.[0]?.finishReason ?? "sconosciuto"})`);
  return text;
}
