import { auth, ensureAuthSchema } from "./auth";

/** Id dell'utente collegato, o null. */
export async function sessionUserId(req: Request) {
  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}
