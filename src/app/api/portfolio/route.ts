import { NextResponse } from "next/server";
import { ensurePortfolioTable, pool } from "@/lib/db";
import { sessionUserId } from "@/lib/session";
import { ensureSnapshotTable, snapshotBeforeWrite } from "@/lib/snapshots";
import { validatePortfolioShape } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userId = sessionUserId;

/** Restituisce il portafoglio salvato dell'utente (o null se non c'è ancora). */
export async function GET(req: Request) {
  if (!pool) return NextResponse.json({ message: "Database non configurato" }, { status: 503 });
  const uid = await userId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  await ensurePortfolioTable();
  const { rows } = await pool.query<{ data: unknown; updated_at: Date }>("select data, updated_at from portfolio where user_id = $1", [uid]);
  if (!rows.length) return NextResponse.json({ data: null, updatedAt: null });
  return NextResponse.json({ data: rows[0].data, updatedAt: rows[0].updated_at.toISOString() });
}

/**
 * Salva il portafoglio. Se il client indica una versione di partenza più vecchia
 * di quella sul server (modifiche da un altro dispositivo) risponde 409 con i dati
 * del server, così il client può unirli prima di riprovare.
 * Prima di sovrascrivere conserva, se serve, la versione precedente (vedi snapshots.ts);
 * `snapshot: true` la conserva sempre (es. prima di un ripristino).
 */
export async function PUT(req: Request) {
  if (!pool) return NextResponse.json({ message: "Database non configurato" }, { status: 503 });
  const uid = await userId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  await ensureSnapshotTable();

  const body = (await req.json().catch(() => null)) as { data?: unknown; baseUpdatedAt?: string | null; snapshot?: boolean } | null;
  const checked = validatePortfolioShape(body?.data);
  if (!checked.ok) return NextResponse.json({ message: `Dati non validi: ${checked.error}` }, { status: 400 });
  const data = checked.data;
  if (JSON.stringify(data).length > 5_000_000) return NextResponse.json({ message: "Dati troppo grandi" }, { status: 413 });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const cur = await client.query<{ data: unknown; updated_at: Date }>("select data, updated_at from portfolio where user_id = $1 for update", [uid]);
    const base = body?.baseUpdatedAt ? new Date(body.baseUpdatedAt).getTime() : 0;
    if (cur.rows.length && cur.rows[0].updated_at.getTime() > base) {
      await client.query("rollback");
      return NextResponse.json({ conflict: true, data: cur.rows[0].data, updatedAt: cur.rows[0].updated_at.toISOString() }, { status: 409 });
    }
    if (cur.rows.length) await snapshotBeforeWrite(client, uid, cur.rows[0].data, data.transactions.length, body?.snapshot === true);
    const { rows } = await client.query<{ updated_at: Date }>(
      `insert into portfolio (user_id, data, updated_at) values ($1, $2, now())
       on conflict (user_id) do update set data = excluded.data, updated_at = now()
       returning updated_at`,
      [uid, JSON.stringify({ ...data, isDemo: false })],
    );
    await client.query("commit");
    return NextResponse.json({ updatedAt: rows[0].updated_at.toISOString() });
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
