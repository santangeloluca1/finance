import { NextResponse } from "next/server";
import { runNotifications } from "@/lib/notify-server";
import { sessionUserId } from "@/lib/session";
import { verifyGithubOidc } from "@/lib/github-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Controllo pianificato degli avvisi. Accetta Authorization: Bearer con
 * $CRON_SECRET (cron di Vercel, servizi esterni) oppure il token OIDC del
 * workflow GitHub di questo repository.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const allowed = (!!secret && bearer === secret) || (bearer.split(".").length === 3 && (await verifyGithubOidc(bearer).catch(() => false)));
  if (!allowed) return NextResponse.json({ message: "Non autorizzato" }, { status: 401 });
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
