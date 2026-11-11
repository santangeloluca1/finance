import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNotifications } from "@/lib/notify-server";
import { sessionUserId } from "@/lib/session";
import { logRun } from "@/lib/push-server";
import { verifyGithubOidc } from "@/lib/github-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Confronto a tempo costante: gli hash hanno sempre la stessa lunghezza, anche se i segreti no. */
function sameSecret(a: string, b: string) {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/**
 * Controllo pianificato degli avvisi. Accetta Authorization: Bearer con
 * $CRON_SECRET (cron di Vercel, servizi esterni) oppure il token OIDC del
 * workflow GitHub di questo repository.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const allowed = (!!secret && sameSecret(bearer, secret)) || (bearer.split(".").length === 3 && (await verifyGithubOidc(bearer).catch(() => false)));
  if (!allowed) return NextResponse.json({ message: "Non autorizzato" }, { status: 401 });
  const source = new URL(req.url).searchParams.get("slot") ?? "cron";
  let reports;
  try {
    reports = await runNotifications();
  } catch (e) {
    await logRun(source, 0, 0, String(e)).catch(() => {});
    throw e;
  }
  const errors = reports.map((r) => r.skipped).filter((s) => s && s !== "non disturbare" && s !== "nessun portafoglio");
  await logRun(source, reports.length, reports.reduce((a, r) => a + r.sent, 0), errors.join("; ").slice(0, 500) || undefined).catch(() => {});
  return NextResponse.json({ ok: true, reports: reports.map((r) => ({ candidates: r.candidates, sent: r.sent, skipped: r.skipped })) });
}

/** "Controlla adesso" dall'app: solo per l'utente collegato, anche in orario di non disturbo. */
export async function POST(req: Request) {
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  const [report] = await runNotifications({ userId: uid, force: true });
  return NextResponse.json(report);
}
