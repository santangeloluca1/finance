import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensurePushTables } from "@/lib/push-server";
import { sessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; device?: string; endpoint?: string };

/** Iscrive questo dispositivo alle notifiche dell'utente. */
export async function POST(req: Request) {
  if (!pool) return NextResponse.json({ message: "Database non configurato" }, { status: 503 });
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Body | null;
  const s = body?.subscription;
  if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys.auth) {
    return NextResponse.json({ message: "Iscrizione non valida" }, { status: 400 });
  }
  await ensurePushTables();
  await pool.query(
    `insert into push_subscription (endpoint, user_id, p256dh, auth, device) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device`,
    [s.endpoint, uid, s.keys.p256dh, s.keys.auth, (body?.device ?? "").slice(0, 120)],
  );
  const { rows } = await pool.query<{ n: string }>("select count(*) as n from push_subscription where user_id = $1", [uid]);
  return NextResponse.json({ ok: true, devices: Number(rows[0].n) });
}

/** Disiscrive un dispositivo. */
export async function DELETE(req: Request) {
  if (!pool) return NextResponse.json({ message: "Database non configurato" }, { status: 503 });
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.endpoint) return NextResponse.json({ message: "Endpoint mancante" }, { status: 400 });
  await ensurePushTables();
  await pool.query("delete from push_subscription where endpoint = $1 and user_id = $2", [body.endpoint, uid]);
  return NextResponse.json({ ok: true });
}

/** Quanti dispositivi ricevono le notifiche, e se questo è tra loro (?endpoint=…). */
export async function GET(req: Request) {
  if (!pool) return NextResponse.json({ devices: 0, thisDevice: false });
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  await ensurePushTables();
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const { rows } = await pool.query<{ endpoint: string }>("select endpoint from push_subscription where user_id = $1", [uid]);
  return NextResponse.json({ devices: rows.length, thisDevice: !!endpoint && rows.some((r) => r.endpoint === endpoint) });
}
