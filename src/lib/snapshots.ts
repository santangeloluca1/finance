import type { PoolClient } from "pg";
import { ensurePortfolioTable, pool } from "./db";

/**
 * Versioni precedenti del portafoglio, sul server. Prima di sovrascrivere il
 * documento se ne conserva una copia (al massimo ogni 6 ore, oppure sempre se
 * spariscono dei movimenti o se il client lo chiede), così un import sbagliato
 * o un errore non cancellano l'unica copia. Si tengono le ultime 30.
 */

export const SNAPSHOT_EVERY_MS = 6 * 3600_000;
export const SNAPSHOT_KEEP = 30;

let ready: Promise<void> | null = null;

/** Tabella delle versioni, creata al primo utilizzo (dopo quella del portafoglio). */
export function ensureSnapshotTable() {
  if (!pool) return Promise.resolve();
  ready ??= ensurePortfolioTable()
    .then(() =>
      pool!.query(
        `create table if not exists portfolio_snapshot (
           id bigserial primary key,
           user_id text not null references "user"(id) on delete cascade,
           data jsonb not null,
           created_at timestamptz not null default now()
         );
         create index if not exists portfolio_snapshot_user_created on portfolio_snapshot (user_id, created_at desc);`,
      ),
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

/** Quando conservare la versione sul server prima di sovrascriverla. */
export function shouldSnapshot(o: { lastAt: Date | null; now: Date; prevTransactions: number; nextTransactions: number; requested: boolean }) {
  if (o.requested) return true;
  if (o.nextTransactions < o.prevTransactions) return true;
  return !o.lastAt || o.now.getTime() - o.lastAt.getTime() >= SNAPSHOT_EVERY_MS;
}

/**
 * Dentro la transazione del salvataggio (riga del portafoglio già bloccata):
 * copia la versione attuale se serve e tiene solo le ultime SNAPSHOT_KEEP.
 */
export async function snapshotBeforeWrite(client: PoolClient, uid: string, prev: unknown, nextTransactions: number, requested: boolean) {
  const last = await client.query<{ created_at: Date; now: Date }>(
    "select created_at, now() as now from portfolio_snapshot where user_id = $1 order by created_at desc limit 1",
    [uid],
  );
  const prevTransactions = Array.isArray((prev as { transactions?: unknown })?.transactions) ? (prev as { transactions: unknown[] }).transactions.length : 0;
  const lastAt = last.rows[0]?.created_at ?? null;
  const now = last.rows[0]?.now ?? new Date();
  if (!shouldSnapshot({ lastAt, now, prevTransactions, nextTransactions, requested })) return;
  // Copia direttamente dalla riga salvata: nessun passaggio del JSON dal server Node.
  await client.query("insert into portfolio_snapshot (user_id, data) select user_id, data from portfolio where user_id = $1", [uid]);
  await client.query(
    `delete from portfolio_snapshot where user_id = $1 and id not in (
       select id from portfolio_snapshot where user_id = $1 order by created_at desc, id desc limit $2
     )`,
    [uid, SNAPSHOT_KEEP],
  );
}

const count = (field: string) => `case when jsonb_typeof(data->'${field}') = 'array' then jsonb_array_length(data->'${field}') else 0 end`;

export interface SnapshotInfo {
  id: string;
  createdAt: string;
  transactions: number;
  instruments: number;
  accounts: number;
}

/** Elenco delle versioni dell'utente, dalla più recente. */
export async function listSnapshots(uid: string): Promise<SnapshotInfo[]> {
  if (!pool) return [];
  await ensureSnapshotTable();
  const { rows } = await pool.query<{ id: string; created_at: Date; transactions: number; instruments: number; accounts: number }>(
    `select id::text as id, created_at, ${count("transactions")} as transactions, ${count("instruments")} as instruments, ${count("accounts")} as accounts
       from portfolio_snapshot where user_id = $1 order by created_at desc, id desc`,
    [uid],
  );
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at.toISOString(), transactions: Number(r.transactions), instruments: Number(r.instruments), accounts: Number(r.accounts) }));
}

/** Dati di una versione, solo se appartiene all'utente. */
export async function getSnapshot(uid: string, id: string): Promise<{ data: unknown; createdAt: string } | null> {
  if (!pool || !/^\d{1,18}$/.test(id)) return null;
  await ensureSnapshotTable();
  const { rows } = await pool.query<{ data: unknown; created_at: Date }>("select data, created_at from portfolio_snapshot where id = $1 and user_id = $2", [id, uid]);
  return rows.length ? { data: rows[0].data, createdAt: rows[0].created_at.toISOString() } : null;
}
