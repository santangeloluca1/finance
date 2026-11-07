import { after, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { deliver } from "@/lib/push-server";
import { sessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Notifica di prova su tutti i dispositivi dell'utente.
 * Con { delay: secondi } risponde subito e la invia dopo l'attesa: serve a
 * provarla ad app chiusa.
 */
export async function POST(req: Request) {
  if (!pool) return NextResponse.json({ message: "Database non configurato" }, { status: 503 });
  const uid = await sessionUserId(req);
  if (!uid) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { delay?: number } | null;
  const delay = Math.min(40, Math.max(0, Math.round(body?.delay ?? 0)));

  if (delay > 0) {
    after(async () => {
      await new Promise((r) => setTimeout(r, delay * 1000));
      const r = await deliver(uid, { title: "Funziona anche ad app chiusa", body: "Questa notifica è partita dal server mentre Basis era chiusa.", url: "/avvisi/notifiche", tag: "prova-chiusa" });
      if (r.errors.length) console.error("prova ad app chiusa", r.errors.join(" · "));
    });
    return NextResponse.json({ scheduled: delay });
  }

  const r = await deliver(uid, { title: "Notifiche attive", body: "Da ora Basis ti avvisa qui per gli eventi che hai scelto.", url: "/avvisi", tag: "prova" });
  return NextResponse.json(r);
}
