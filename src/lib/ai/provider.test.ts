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
      return calls.length <= 3 ? busy() : ok("ciao");
    }));
    expect(await generate({ system: "s", turns: [{ role: "user", text: "q" }] })).toBe("ciao");
    expect(calls).toEqual(["gemini-flash-latest", "gemini-flash-latest", "gemini-flash-latest", "gemini-2.5-flash"]);
  }, 15_000);

  it("se tutti sono sovraccarichi dà un messaggio chiaro in italiano", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(generate({ system: "s", turns: [{ role: "user", text: "q" }] })).rejects.toBeInstanceOf(BusyError);
  });
});
