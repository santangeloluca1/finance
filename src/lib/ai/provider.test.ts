import { afterEach, describe, expect, it, vi } from "vitest";
import { BusyError, generate, generateStream } from "./provider";

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const busy = () => new Response(JSON.stringify({ error: { code: 503 } }), { status: 503 });

describe("chiamata al modello con ripiego", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("se il primo modello resta sovraccarico, risponde il successivo", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url.split("/models/")[1].split(":")[0]);
      return calls.length === 1 ? busy() : ok("ciao");
    }));
    expect(await generate({ system: "s", turns: [{ role: "user", text: "q" }] })).toBe("ciao");
    // Niente attesa e secondo tentativo sullo stesso modello: si passa subito al successivo.
    expect(calls).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest"]);
  });

  it("se un modello non inizia a rispondere in tempo, passa al successivo", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
      calls.push(url.split("/models/")[1].split(":")[0]);
      if (calls.length > 1) return Promise.resolve(ok("eccomi"));
      // Il primo modello resta muto finché la richiesta non viene annullata.
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("abort"))));
    }));
    const p = generate({ system: "s", turns: [{ role: "user", text: "q" }] });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await p).toBe("eccomi");
    expect(calls).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest"]);
    vi.useRealTimers();
  });

  it("la chat usa prima il modello veloce, senza impostazioni di ragionamento", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    let body: { generationConfig: { thinkingConfig?: unknown } } | null = null;
    let model = "";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      model = url.split("/models/")[1].split(":")[0];
      body = JSON.parse(String(init.body));
      return new Response('data: {"candidates":[{"content":{"parts":[{"text":"ciao"}]}}]}\n\n', { status: 200 });
    }));
    const stream = await generateStream({ system: "s", turns: [{ role: "user", text: "q" }] });
    expect(await new Response(stream).text()).toBe("ciao");
    expect(model).toBe("gemini-flash-lite-latest");
    expect(body!.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("se il modello non accetta il limite di riflessione, riprova senza", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    const bodies: { generationConfig: { thinkingConfig?: unknown } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return bodies.length === 1 ? new Response("{}", { status: 400 }) : ok("ok");
    }));
    expect(await generate({ system: "s", turns: [{ role: "user", text: "q" }] })).toBe("ok");
    expect(bodies[0].generationConfig.thinkingConfig).toBeDefined();
    expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined();
  });

  it("se tutti sono sovraccarichi dà un messaggio chiaro in italiano", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(generate({ system: "s", turns: [{ role: "user", text: "q" }] })).rejects.toBeInstanceOf(BusyError);
  });
});
