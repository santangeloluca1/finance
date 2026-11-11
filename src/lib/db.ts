import { Pool, type PoolConfig } from "pg";

/** Connessione a Postgres (Neon su Vercel). Undefined se non configurata. */
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

/**
 * Fuori da localhost sempre TLS con certificato verificato (Neon ha un certificato pubblico).
 * Lo sslmode dell'URL si toglie: pg lo farebbe prevalere sull'opzione ssl qui sotto
 * (e per "require" stampa un avviso di deprecazione). sslmode=disable resta rispettato.
 * DATABASE_SSL_INSECURE=1 accetta qualsiasi certificato: solo per server con certificato
 * autofirmato su una rete fidata, perché espone a intercettazioni (man in the middle).
 */
function poolConfig(url: string): PoolConfig {
  if (/localhost|127\.0\.0\.1/.test(url)) return { connectionString: url, max: 3 };
  let cs = url;
  try {
    const u = new URL(url);
    if (u.searchParams.get("sslmode") === "disable") return { connectionString: url, max: 3 };
    u.searchParams.delete("sslmode");
    u.searchParams.delete("uselibpqcompat");
    cs = u.toString();
  } catch {
    // URL non standard (es. più host): lo si passa com'è.
  }
  return { connectionString: cs, max: 3, ssl: process.env.DATABASE_SSL_INSECURE === "1" ? { rejectUnauthorized: false } : { rejectUnauthorized: true } };
}

export const pool = connectionString ? new Pool(poolConfig(connectionString)) : undefined;

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
