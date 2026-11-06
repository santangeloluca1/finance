import { describeProfile, type InvestorProfile } from "@/lib/ai/profile";
import { BASE_RULES, CHAT_RULES } from "@/lib/ai/prompts";
import { aiConfigured, generateStream, type ChatTurn } from "@/lib/ai/provider";
import { sessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chat con Minerva: la risposta arriva a pezzi, mentre viene scritta. */
export async function POST(req: Request) {
  if (!(await sessionUserId(req))) return Response.json({ message: "Accesso richiesto" }, { status: 401 });
  if (!aiConfigured()) return Response.json({ status: "nokey" }, { status: 412 });
  const raw = await req.text();
  if (raw.length > 800_000) return Response.json({ message: "Dati troppo grandi" }, { status: 413 });
  const body = JSON.parse(raw) as { messages: ChatTurn[]; context: unknown; profile?: InvestorProfile };
  const data = `PROFILO DELL'INVESTITORE\n${describeProfile(body.profile)}\n\nDATI DEL PORTAFOGLIO (JSON, calcolati da Basis, aggiornati a ora)\n${JSON.stringify(body.context)}`;
  try {
    const stream = await generateStream({
      system: `${BASE_RULES}\n\n${CHAT_RULES}`,
      turns: [{ role: "user", text: data }, { role: "assistant", text: "Ho letto profilo e portafoglio aggiornati." }, ...(body.messages ?? []).slice(-20)],
      temperature: 0.55,
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ status: "error", message: (e as Error).message }, { status: 502 });
  }
}
