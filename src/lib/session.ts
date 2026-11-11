import { NextResponse } from "next/server";
import { auth, ensureAuthSchema } from "./auth";
import { pool } from "./db";

/** Id dell'utente collegato, o null (anche senza database configurato). */
export async function sessionUserId(req: Request) {
  if (!pool) return null;
  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

/**
 * Sessione verificata davvero (il middleware guarda solo che il cookie esista):
 * l'id dell'utente, oppure la risposta 401 da restituire. Con la cache della
 * sessione nel cookie firmato di solito non serve interrogare il database.
 */
export async function requireUser(req: Request): Promise<string | NextResponse> {
  const uid = await sessionUserId(req);
  return uid ?? NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
}
