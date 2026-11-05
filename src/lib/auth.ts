import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getMigrations } from "better-auth/db/migration";
import { APIError } from "better-auth/api";
import { pool } from "./db";

/**
 * Account e sessioni con Better Auth su Postgres (Neon via Vercel).
 *
 * App personale: se ALLOWED_EMAILS (separate da virgola) è impostata, solo
 * quelle email possono registrarsi; altrimenti solo il primo account.
 */


const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const staticOrigins = [baseURL, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`].filter(
  (o): o is string => Boolean(o),
);

const allowed = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const authOptions: BetterAuthOptions = {
  appName: "Basis",
  baseURL,
  // Oltre agli indirizzi noti, accetta le richieste che arrivano dallo stesso host
  // su cui gira l'app (dominio di produzione, alias di Vercel, anteprime).
  trustedOrigins: (request) => {
    const host = request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
    const proto = request?.headers.get("x-forwarded-proto") ?? "https";
    return host ? [...staticOrigins, `${proto}://${host}`] : staticOrigins;
  },
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email.toLowerCase();
          if (allowed.length) {
            if (allowed.includes(email)) return;
            throw new APIError("FORBIDDEN", { message: "Basis è un'app personale: questa email non è abilitata." });
          }
          const { rows } = await pool!.query<{ n: string }>('select count(*) as n from "user"');
          if (Number(rows[0].n) > 0) {
            throw new APIError("FORBIDDEN", { message: "Basis è un'app personale: le registrazioni sono chiuse." });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
};

export const auth = betterAuth(authOptions);

export const authConfigured = Boolean(pool && process.env.BETTER_AUTH_SECRET);

/** Crea o aggiorna le tabelle di Better Auth al primo utilizzo (una volta per istanza). */
let migrated: Promise<void> | null = null;
export function ensureAuthSchema() {
  if (!pool) return Promise.resolve();
  migrated ??= getMigrations(authOptions)
    .then(({ runMigrations }) => runMigrations())
    .catch((e) => {
      migrated = null;
      throw e;
    });
  return migrated;
}
