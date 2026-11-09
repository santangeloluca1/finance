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

/** Modelli da provare in ordine: se uno è sovraccarico (503) o esaurito (429) si passa al successivo. */
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"];

/** Tempo massimo complessivo per i tentativi (la funzione ne ha 300). */
const BUDGET_MS = 200_000;

export class BusyError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chiama Gemini con ripetizioni e ripiego, entro un tempo massimo:
 * - "molto richiesto" (503/500): un nuovo tentativo dopo 1,5 s, poi il modello successivo;
 * - limite raggiunto (429) o modello inesistente (404): subito il modello successivo;
 * - parametro non accettato (400): stesso modello senza il limite di riflessione.
 * Ogni richiesta ha un suo tempo massimo, così la funzione non va mai in timeout.
 */
async function callGemini(method: "generateContent" | "streamGenerateContent?alt=sse", payload: Record<string, unknown>, key: string): Promise<Response> {
  const preferred = process.env.GEMINI_MODEL;
  const models = preferred ? [preferred, ...MODELS.filter((m) => m !== preferred)] : MODELS;
  const started = Date.now();
  let last: Response | null = null;
  let timedOut = false;
  for (const model of models) {
    let thinking = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = BUDGET_MS - (Date.now() - started);
      if (left < 5_000) break;
      const body = { ...payload, generationConfig: { ...(payload.generationConfig as object), ...(thinking ? { thinkingConfig: { thinkingBudget: 512 } } : {}) } };
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(Math.min(left, 120_000)),
        });
      } catch {
        timedOut = true;
        break; // troppo lento: modello successivo
      }
      if (res.ok) return res;
      last = res;
      if (res.status === 400 && thinking) {
        thinking = false; // il modello non accetta il limite di riflessione
        continue;
      }
      if ((res.status === 503 || res.status === 500) && attempt === 0) {
        await sleep(1500);
        continue;
      }
      if ([404, 429, 500, 503].includes(res.status)) break;
      throw new Error(`Gemini HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    }
    if (Date.now() - started > BUDGET_MS - 5_000) break;
  }
  if (last?.status === 429) throw new BusyError("Hai raggiunto il limite gratuito di richieste per ora: riprova tra qualche minuto.");
  if (timedOut && !last) throw new BusyError("Basis AI ci sta mettendo troppo a rispondere: riprova tra poco.");
  throw new BusyError("Basis AI ha troppe richieste in questo momento (i server di Google sono sovraccarichi). Riprova tra poco.");
}

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
  const payload = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: alternate(opts.turns).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
    },
  };
  const res = await callGemini("generateContent", payload, key);
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
  const payload = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: alternate(opts.turns).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    generationConfig: { temperature: opts.temperature ?? 0.5 },
  };
  const res = await callGemini("streamGenerateContent?alt=sse", payload, key);
  if (!res.body) throw new BusyError("Risposta vuota dal modello: riprova.");
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
