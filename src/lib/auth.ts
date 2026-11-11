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

const CLOSED = "Basis è un'app personale: le registrazioni sono chiuse.";

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
  // La sessione viaggia anche in un cookie firmato valido un'ora: le API dei prezzi,
  // chiamate a ogni apertura di pagina, la verificano senza interrogare il database
  // (altrimenti i grafici aspetterebbero il risveglio di Postgres). I dati personali
  // leggono sempre il database (sessionUserId): un'uscita o una revoca lì valgono subito,
  // mentre sulle sole API dei prezzi di un altro dispositivo entro un'ora.
  session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 60 * 60 } },
  // Limiti sui tentativi salvati nel database: in memoria non funzionerebbero su Vercel
  // (ogni istanza ha i suoi contatori). L'IP è quello di x-forwarded-for, che Vercel riscrive.
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },
      "/sign-up/email": { window: 3600, max: 5 },
      // Letta dal client a ogni apertura: con la cache nel cookie non tocca il database, il limite sì.
      "/get-session": false,
    },
  },
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
          if (Number(rows[0].n) > 0) throw new APIError("FORBIDDEN", { message: CLOSED });
        },
        // Il conteggio qui sopra non è atomico: due registrazioni simultanee lo superano
        // entrambe. Dopo il commit si tiene solo l'account più vecchio e si eliminano gli
        // altri appena creati (sessioni e dati seguono per cascata). Chi arriva per ultimo
        // vede tutti gli account, quindi almeno lui fa pulizia.
        after: async (user) => {
          if (allowed.length) return;
          const { rows } = await pool!.query<{ keep: string }>(
            `with keep as (select id from "user" order by "createdAt", id limit 1),
                  gone as (delete from "user" where id <> (select id from keep) and "createdAt" > now() - interval '10 minutes')
             select id as keep from keep`,
          );
          if (rows[0]?.keep !== user.id) throw new APIError("FORBIDDEN", { message: CLOSED });
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
