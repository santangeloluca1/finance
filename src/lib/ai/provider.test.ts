import { afterEach, describe, expect, it, vi } from "vitest";
import { BusyError, generate } from "./provider";

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
      return calls.length <= 2 ? busy() : ok("ciao");
    }));
    expect(await generate({ system: "s", turns: [{ role: "user", text: "q" }] })).toBe("ciao");
    expect(calls).toEqual(["gemini-2.5-flash", "gemini-2.5-flash", "gemini-flash-latest"]);
  }, 15_000);

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
