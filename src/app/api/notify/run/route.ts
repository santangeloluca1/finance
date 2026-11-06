import { NextResponse } from "next/server";
import { runNotifications } from "@/lib/notify-server";
import { sessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Controllo pianificato degli avvisi (cron di Vercel o servizio esterno):
 * richiede Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ message: "CRON_SECRET non configurata" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ message: "Non autorizzato" }, { status: 401 });
  const reports = await runNotifications();
  return NextResponse.json({ ok: true, reports: reports.map((r) => ({ candidates: r.candidates, sent: r.sent, skipped: r.skipped })) });
}

/** "Controlla adesso" dall'app: solo per l'utente collegato, anche in orario di non disturbo. */
export async function POST(req: Request) {
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  const [report] = await runNotifications({ userId: uid, force: true });
  return NextResponse.json(report);
}
