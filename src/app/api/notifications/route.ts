import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/push-server";
import { sessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ultime notifiche inviate all'utente. */
export async function GET(req: Request) {
  if (!pool) return NextResponse.json({ items: [] });
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  await ensurePushTables();
  const { rows } = await pool.query<{ alert_id: string; title: string; body: string; href: string; sent_at: Date }>(
    "select alert_id, title, body, href, sent_at from notification_log where user_id = $1 order by sent_at desc limit 40",
    [uid],
  );
  return NextResponse.json({ items: rows.map((r) => ({ id: r.alert_id, title: r.title, body: r.body, href: r.href, sentAt: r.sent_at.toISOString() })) });
}
