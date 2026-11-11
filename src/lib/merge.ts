import type { PortfolioData } from "./store";

/**
 * Unione di due versioni del portafoglio (questo dispositivo e server) e
 * registro delle cancellazioni. Modulo puro, senza React: lo usano la
 * sincronizzazione, l'import dei backup e i test.
 *
 * Le liste si uniscono per id, quindi senza un segno di cancellazione un
 * elemento eliminato su un dispositivo tornerebbe dall'altro al primo
 * conflitto. `deleted` conserva `${lista}:${id}` → quando è stato eliminato;
 * `revived` conserva quando un elemento eliminato è stato ricreato con la
 * stessa chiave (es. lo stesso ISIN), così la cancellazione più vecchia,
 * ancora presente sugli altri dispositivi, non lo fa sparire di nuovo.
 */

/** Liste unite per id, con la chiave usata per ciascuna. */
export const MERGED_LISTS = ["transactions", "instruments", "accounts", "goals", "reminders", "recurring", "alertRules", "aiReports"] as const;
export type ListKind = (typeof MERGED_LISTS)[number];

/** Dopo quanto un segno di cancellazione (o di ripristino) si può dimenticare. */
export const TOMBSTONE_TTL_MS = 180 * 86400_000;

export const tombKey = (kind: ListKind, id: string) => `${kind}:${id}`;

const iso = (now: number) => new Date(now).toISOString();
const ts = (s: string | undefined) => (s ? Date.parse(s) || 0 : 0);

/** Toglie le voci più vecchie del limite (la mappa resta piccola anche senza conflitti). */
function prune(map: Record<string, string> | undefined, now: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map ?? {})) if (now - ts(v) <= TOMBSTONE_TTL_MS) out[k] = v;
  return out;
}

/** Registra la cancellazione degli elementi indicati. */
export function withTombstones(data: PortfolioData, kind: ListKind, ids: string[], now = Date.now()): PortfolioData {
  if (!ids.length) return data;
  const deleted = prune(data.deleted, now);
  const revived = { ...data.revived };
  for (const id of ids) {
    deleted[tombKey(kind, id)] = iso(now);
    delete revived[tombKey(kind, id)];
  }
  return { ...data, deleted, revived: Object.keys(revived).length ? revived : undefined };
}

/**
 * Da chiamare quando un elemento viene aggiunto o salvato: se era stato
 * eliminato, la cancellazione si annulla e si ricorda il ripristino. Se non era
 * eliminato non cambia nulla (nessun dato in più nel documento).
 */
export function withRevived(data: PortfolioData, kind: ListKind, ids: string[], now = Date.now()): PortfolioData {
  const hit = ids.filter((id) => data.deleted?.[tombKey(kind, id)]);
  if (!hit.length) return data;
  const deleted = { ...data.deleted };
  const revived = prune(data.revived, now);
  for (const id of hit) {
    delete deleted[tombKey(kind, id)];
    revived[tombKey(kind, id)] = iso(now);
  }
  return { ...data, deleted: Object.keys(deleted).length ? deleted : undefined, revived };
}

/**
 * Prima di unire un backup importato: tutto quello che c'è nel file torna valido
 * anche se su questo dispositivo era stato eliminato (l'import è una scelta esplicita).
 */
export function reviveFrom(data: PortfolioData, incoming: PortfolioData, now = Date.now()): PortfolioData {
  const ids: Record<ListKind, string[]> = {
    transactions: incoming.transactions.map((t) => t.id),
    instruments: incoming.instruments.map((i) => i.isin),
    accounts: incoming.accounts.map((a) => a.id),
    goals: (incoming.goals ?? []).map((g) => g.id),
    reminders: (incoming.reminders ?? []).map((r) => r.id),
    recurring: (incoming.recurring ?? []).map((r) => r.id),
    alertRules: (incoming.alertRules ?? []).map((r) => r.id),
    aiReports: (incoming.aiReports ?? []).map((r) => r.id),
  };
  return MERGED_LISTS.reduce((d, kind) => withRevived(d, kind, ids[kind], now), data);
}

/** Unione di due mappe di date: per ogni chiave vince la più recente. */
function unionLatest(a: Record<string, string> | undefined, b: Record<string, string> | undefined) {
  const out: Record<string, string> = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) if (!out[k] || ts(v) > ts(out[k])) out[k] = v;
  return out;
}

/**
 * Unisce due versioni: le liste per id (a parità di id vince la versione locale),
 * senza gli elementi eliminati su uno dei due lati; watchlist, avvisi, profilo,
 * piano e allocazione obiettivo valgono per intero e vince quella locale.
 * Uno strumento usato da un movimento rimasto non viene mai tolto.
 */
export function merge(local: PortfolioData, remote: PortfolioData, now = Date.now()): PortfolioData {
  const allDeleted = prune(unionLatest(local.deleted, remote.deleted), now);
  const revived = prune(unionLatest(local.revived, remote.revived), now);
  // Una cancellazione vale solo se è più recente dell'ultimo ripristino della stessa chiave.
  const deleted: Record<string, string> = {};
  for (const [k, v] of Object.entries(allDeleted)) if (!revived[k] || ts(v) > ts(revived[k])) deleted[k] = v;

  const byId = <T,>(kind: ListKind, a: T[], b: T[], key: (x: T) => string) => {
    const map = new Map(b.map((x) => [key(x), x]));
    for (const x of a) map.set(key(x), x);
    return [...map.values()].filter((x) => !deleted[tombKey(kind, key(x))]);
  };

  const transactions = byId("transactions", local.transactions, remote.transactions, (t) => t.id);
  // Gli strumenti si uniscono a parte: quelli ancora usati restano anche se segnati come eliminati.
  const used = new Set(transactions.map((t) => t.isin));
  const instrumentMap = new Map(remote.instruments.map((i) => [i.isin, i]));
  for (const i of local.instruments) instrumentMap.set(i.isin, i);
  const instruments = [...instrumentMap.values()].filter((i) => {
    const k = tombKey("instruments", i.isin);
    if (!deleted[k]) return true;
    if (!used.has(i.isin)) return false;
    delete deleted[k];
    return true;
  });

  return {
    // Campi sconosciuti (versioni più recenti dell'app) passano intatti.
    ...remote,
    ...local,
    accounts: byId("accounts", local.accounts, remote.accounts, (a) => a.id),
    instruments,
    transactions,
    goals: byId("goals", local.goals ?? [], remote.goals ?? [], (g) => g.id),
    reminders: byId("reminders", local.reminders ?? [], remote.reminders ?? [], (r) => r.id),
    recurring: byId("recurring", local.recurring ?? [], remote.recurring ?? [], (r) => r.id),
    alertRules: byId("alertRules", local.alertRules ?? [], remote.alertRules ?? [], (r) => r.id),
    notify: local.notify ?? remote.notify,
    watchlist: local.watchlist ?? remote.watchlist,
    profile: local.profile ?? remote.profile,
    aiReports: byId("aiReports", local.aiReports ?? [], remote.aiReports ?? [], (r) => r.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    recurringSkipped: [...new Set([...(remote.recurringSkipped ?? []), ...(local.recurringSkipped ?? [])])],
    alertsSeen: [...new Set([...(remote.alertsSeen ?? []), ...(local.alertsSeen ?? [])])],
    alertsDismissed: [...new Set([...(remote.alertsDismissed ?? []), ...(local.alertsDismissed ?? [])])],
    plan: local.plan ?? remote.plan,
    targets: local.targets ?? remote.targets,
    deleted: Object.keys(deleted).length ? deleted : undefined,
    revived: Object.keys(revived).length ? revived : undefined,
    isDemo: false,
  };
}
