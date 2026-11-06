import { NextResponse } from "next/server";
import { describeProfile, type InvestorProfile } from "@/lib/ai/profile";
import { analysisPrompt, ANALYSES, BASE_RULES, CHAT_RULES, REPORT_SCHEMA, type AnalysisId, type Report } from "@/lib/ai/prompts";
import { aiConfigured, generate, NoKeyError, type ChatTurn } from "@/lib/ai/provider";
import { sessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body =
  | { kind: "analysis"; id: AnalysisId; extra?: { title?: string; amount?: number }; context: unknown; profile?: InvestorProfile }
  | { kind: "chat"; messages: ChatTurn[]; context: unknown; profile?: InvestorProfile };

/** Stato della configurazione (chiave presente?). */
export async function GET() {
  return NextResponse.json({ configured: aiConfigured() });
}

/**
 * Analisi pronte e chat del consulente. Il client invia i dati del portafoglio
 * già calcolati (senza nome né email); qui si aggiungono regole e istruzioni.
 */
export async function POST(req: Request) {
  if (!(await sessionUserId(req))) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  if (!aiConfigured()) return NextResponse.json({ status: "nokey" });
  const raw = await req.text();
  if (raw.length > 600_000) return NextResponse.json({ message: "Dati troppo grandi" }, { status: 413 });
  const body = JSON.parse(raw) as Body;
  const data = `PROFILO DELL'INVESTITORE\n${describeProfile(body.profile)}\n\nDATI DEL PORTAFOGLIO (JSON, calcolati da Basis)\n${JSON.stringify(body.context)}`;

  try {
    if (body.kind === "analysis") {
      if (!ANALYSES.some((a) => a.id === body.id)) return NextResponse.json({ message: "Analisi sconosciuta" }, { status: 400 });
      const text = await generate({
        system: `${BASE_RULES}\n\nANALISI RICHIESTA\n${analysisPrompt(body.id, body.extra ?? {})}\n\nRispondi solo con il JSON nel formato richiesto.`,
        turns: [{ role: "user", text: data }],
        schema: REPORT_SCHEMA,
        temperature: 0.35,
      });
      const report = JSON.parse(text) as Report;
      return NextResponse.json({ status: "ok", report });
    }
    const messages = (body.messages ?? []).slice(-12);
    const text = await generate({
      system: `${BASE_RULES}\n\n${CHAT_RULES}`,
      turns: [{ role: "user", text: data }, { role: "assistant", text: "Ho letto profilo e portafoglio. Dimmi pure." }, ...messages],
      temperature: 0.5,
    });
    return NextResponse.json({ status: "ok", answer: text });
  } catch (e) {
    if (e instanceof NoKeyError) return NextResponse.json({ status: "nokey" });
    return NextResponse.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}
