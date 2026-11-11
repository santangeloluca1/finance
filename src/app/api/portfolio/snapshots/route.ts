import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { sessionUserId } from "@/lib/session";
import { getSnapshot, listSnapshots } from "@/lib/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Versioni precedenti del portafoglio dell'utente.
 * Senza parametri: elenco (dalla più recente) con il numero di movimenti, strumenti e conti.
 * Con ?id=…: i dati di quella versione, solo se è dell'utente collegato.
 */
export async function GET(req: Request) {
  if (!pool) return NextResponse.json({ message: "Database non configurato" }, { status: 503 });
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (id === null) return NextResponse.json({ snapshots: await listSnapshots(uid) }, { headers: { "Cache-Control": "no-store" } });
  const snap = await getSnapshot(uid, id);
  if (!snap) return NextResponse.json({ message: "Versione non trovata" }, { status: 404 });
  return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
}
