import { NextResponse } from "next/server";
import { auth, ensureAuthSchema } from "./auth";
import { pool } from "./db";

/**
 * Id dell'utente collegato, o null (anche senza database configurato).
 * Per i dati personali (portafoglio, Basis AI, notifiche): legge sempre la sessione
 * dal database, così un'uscita o una revoca valgono subito.
 */
export async function sessionUserId(req: Request) {
  if (!pool) return null;
  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: req.headers, query: { disableCookieCache: true } });
  return session?.user.id ?? null;
}

/**
 * Sessione verificata per le rotte dei dati di mercato (il middleware guarda solo che
 * il cookie esista): l'id dell'utente, oppure la risposta 401 da restituire.
 * Sono chiamate spesso e in parallelo a ogni apertura di pagina, quindi usano la copia
 * firmata della sessione nel cookie e non toccano il database (né il controllo delle
 * tabelle): altrimenti grafici e quotazioni aspetterebbero il risveglio di Postgres.
 */
export async function requireUser(req: Request): Promise<string | NextResponse> {
  if (!pool) return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  let session;
  try {
    session = await auth.api.getSession({ headers: req.headers });
  } catch {
    // Tabelle non ancora create (primo avvio): si creano e si riprova.
    await ensureAuthSchema();
    session = await auth.api.getSession({ headers: req.headers });
  }
  return session?.user.id ?? NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
}
