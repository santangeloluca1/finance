/**
 * Chiamata al modello. Oggi Google Gemini (GEMINI_API_KEY, modello in
 * GEMINI_MODEL); l'interfaccia è indipendente dal servizio, così si può
 * cambiare fornitore senza toccare il resto dell'app.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Messaggi della chat arrivati dal client: null se la forma non è quella attesa. */
export function parseTurns(v: unknown): ChatTurn[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const ok = v.every((t) => t && typeof t === "object" && (t.role === "user" || t.role === "assistant") && typeof t.text === "string");
  return ok ? v.map((t: ChatTurn) => ({ role: t.role, text: t.text })) : null;
}

export class NoKeyError extends Error {}

/**
 * Modelli da provare in ordine: se uno è lento, sovraccarico (503) o esaurito (429) si passa al successivo.
 * I 2.5 sono stati ritirati da Google (404). Misure in produzione, novembre 2026: flash-lite inizia a
 * rispondere in meno di un secondo, flash a volte non risponde entro 20 s.
 * - chat: prima la velocità;
 * - analisi: prima la qualità (l'attesa è accompagnata dai passaggi a schermo).
 */
const CHAT_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];
const ANALYSIS_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

/** Tempo massimo complessivo per i tentativi (la funzione ne ha 300). */
const BUDGET_MS = 200_000;

export class BusyError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chiama Gemini con ripiego tra modelli, entro un tempo massimo:
 * - se la risposta non inizia entro `firstByteMs` si passa subito al modello successivo
 *   (il limite vale solo per l'attesa iniziale: una risposta lunga non viene troncata);
 * - "molto richiesto" (503/500), limite raggiunto (429) o modello inesistente (404): modello successivo;
 * - parametro non accettato (400): stesso modello senza il limite di riflessione.
 * Ogni tentativo lascia nei log modello, esito e tempo, per misurare la lentezza.
 */
async function callGemini(
  method: "generateContent" | "streamGenerateContent?alt=sse",
  payload: Record<string, unknown>,
  key: string,
  opts: { models: string[]; thinking: Record<string, unknown> | null; firstByteMs: number },
): Promise<Response> {
  const preferred = process.env.GEMINI_MODEL;
  const models = preferred ? [preferred, ...opts.models.filter((m) => m !== preferred)] : opts.models;
  const started = Date.now();
  let last: Response | null = null;
  let timedOut = false;
  for (const model of models) {
    let thinking = !!opts.thinking;
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = BUDGET_MS - (Date.now() - started);
      if (left < 5_000) break;
      const body = { ...payload, generationConfig: { ...(payload.generationConfig as object), ...(thinking ? { thinkingConfig: opts.thinking } : {}) } };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(left, opts.firstByteMs));
      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: ctrl.signal,
        });
      } catch {
        clearTimeout(timer);
        console.warn(`gemini ${model}: nessuna risposta in ${Date.now() - t0} ms, provo il successivo`);
        timedOut = true;
        break;
      }
      clearTimeout(timer);
      console.info(`gemini ${model} ${method.split("?")[0]}: HTTP ${res.status} in ${Date.now() - t0} ms`);
      if (res.ok) return res;
      last = res;
      if (res.status === 400 && thinking) {
        thinking = false; // il modello non accetta il limite di riflessione
        continue;
      }
      if ([404, 429, 500, 503].includes(res.status)) break;
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`gemini ${model}: HTTP ${res.status} ${detail}`);
      if (res.status === 401 || res.status === 403) throw new Error("La chiave di Gemini non è valida o è stata bloccata: controllala su Vercel.");
      throw new Error(`Gemini HTTP ${res.status}: ${detail}`);
    }
    if (Date.now() - started > BUDGET_MS - 5_000) break;
  }
  if (last?.status === 429) throw new BusyError("Hai raggiunto il limite gratuito di richieste per ora: riprova tra qualche minuto.");
  if (last?.status === 404) throw new BusyError("I modelli di Gemini configurati non sono più disponibili: va aggiornato l'elenco dei modelli.");
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
  // Analisi: ragionamento leggero (se il modello non lo accetta si riprova senza), risposta tutta insieme.
  const res = await callGemini("generateContent", payload, key, { models: ANALYSIS_MODELS, thinking: { thinkingLevel: "low" }, firstByteMs: 60_000 });
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
  // Chat: modello veloce e nessuna impostazione di ragionamento, così la prima parola arriva subito.
  const res = await callGemini("streamGenerateContent?alt=sse", payload, key, { models: CHAT_MODELS, thinking: null, firstByteMs: 15_000 });
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
