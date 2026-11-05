import { Pool } from "pg";

/** Connessione a Postgres (Neon su Vercel). Undefined se non configurata. */
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export const pool = connectionString
  ? new Pool({ connectionString, max: 3, ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false } })
  : undefined;

let ready: Promise<void> | null = null;

/** Tabella del portafoglio: un documento JSON per utente. */
export function ensurePortfolioTable() {
  if (!pool) return Promise.resolve();
  ready ??= pool
    .query(
      `create table if not exists portfolio (
         user_id text primary key references "user"(id) on delete cascade,
         data jsonb not null,
         updated_at timestamptz not null default now()
       )`,
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}
