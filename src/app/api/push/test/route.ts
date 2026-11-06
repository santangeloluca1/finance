import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { sendToUser } from "@/lib/push-server";
import { sessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notifica di prova su tutti i dispositivi dell'utente. */
export async function POST(req: Request) {
  if (!pool) return NextResponse.json({ message: "Database non configurato" }, { status: 503 });
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  const sent = await sendToUser(uid, { title: "Notifiche attive", body: "Da ora Basis ti avvisa qui per gli eventi che hai scelto.", url: "/avvisi", tag: "prova" });
  return NextResponse.json({ sent });
}
