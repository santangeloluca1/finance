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

/** Gemini vuole turni alterni: messaggi consecutivi dello stesso ruolo vengono uniti. */
function alternate(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.text += `\n\n${t.text}`;
    else out.push({ ...t });
  }
  return out;
}

export async function generate(opts: { system: string; turns: ChatTurn[]; schema?: object; temperature?: number }): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new NoKeyError("GEMINI_API_KEY mancante");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: alternate(opts.turns).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
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

/**
 * Come generate, ma restituisce il testo man mano che il modello lo scrive
 * (Server-Sent Events di Gemini), così la chat mostra la risposta mentre nasce.
 */
export async function generateStream(opts: { system: string; turns: ChatTurn[]; temperature?: number }): Promise<ReadableStream<Uint8Array>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new NoKeyError("GEMINI_API_KEY mancante");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: alternate(opts.turns).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    generationConfig: { temperature: opts.temperature ?? 0.5 },
  });
  const call = (model: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body,
      cache: "no-store",
    });
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let res = await call(model);
  if (res.status === 404 && model !== FALLBACK_MODEL) res = await call(FALLBACK_MODEL);
  if (!res.ok || !res.body) {
    if (res.status === 429) throw new Error("Limite di richieste gratuite raggiunto: riprova tra qualche minuto.");
    throw new Error(`Gemini HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const j = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
          const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
          if (text) controller.enqueue(enc.encode(text));
        } catch {
          /* riga incompleta: si ignora */
        }
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}
