import { buildPortfolio } from "./engine/portfolio";
import type { AssetClass, TransactionType } from "./engine/types";
import type { PortfolioData } from "./store";

/**
 * Controllo dei dati che arrivano da fuori (backup importati, salvataggi sul
 * server). Verifica la forma del documento e, per l'import, che i movimenti
 * stiano in piedi ricalcolando il portafoglio. Il primo problema trovato
 * diventa un messaggio leggibile ("Movimento 12: manca la data").
 *
 * I campi sconosciuti restano: un backup di una versione più recente non va
 * rifiutato. Un campo facoltativo a null vale come assente.
 */

export type ValidationResult = { ok: true; data: PortfolioData } | { ok: false; error: string };

const TX_TYPES: TransactionType[] = ["buy", "sell", "dividend", "split", "cash", "deposit", "withdrawal", "transfer"];
const ASSET_CLASSES: AssetClass[] = ["etf_azionario", "etf_obbligazionario", "azione", "obbligazione", "certificato", "etc", "crypto"];

class Invalid extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const absent = (v: unknown) => v === undefined || v === null;

/** Data YYYY-MM-DD esistente nel calendario. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Controlli sui campi di un elemento; `where` è il prefisso del messaggio ("Movimento 3"). */
function fields(o: Obj, where: string) {
  const fail = (msg: string): never => {
    throw new Invalid(`${where}: ${msg}`);
  };
  return {
    str(key: string, label: string, opts: { optional?: boolean; nonEmpty?: boolean } = {}) {
      const v = o[key];
      if (absent(v)) return opts.optional ? undefined : fail(`manca ${label}`);
      if (typeof v !== "string") fail(`${label} non è un testo`);
      if (opts.nonEmpty && !(v as string).trim()) fail(`manca ${label}`);
    },
    num(key: string, label: string, opts: { optional?: boolean } = {}) {
      const v = o[key];
      if (absent(v)) return opts.optional ? undefined : fail(`manca ${label}`);
      if (typeof v !== "number" || !Number.isFinite(v)) fail(`${label} non è un numero valido`);
    },
    bool(key: string, label: string, opts: { optional?: boolean } = {}) {
      const v = o[key];
      if (absent(v)) return opts.optional ? undefined : fail(`manca ${label}`);
      if (typeof v !== "boolean") fail(`${label} non è vero/falso`);
    },
    date(key: string, label: string, opts: { optional?: boolean } = {}) {
      const v = o[key];
      if (absent(v)) return opts.optional ? undefined : fail(`manca ${label}`);
      if (!isIsoDate(v)) fail(`${label} non valida (${JSON.stringify(v)}), serve AAAA-MM-GG`);
    },
    oneOf(key: string, label: string, values: readonly string[], opts: { optional?: boolean } = {}) {
      const v = o[key];
      if (absent(v)) return opts.optional ? undefined : fail(`manca ${label}`);
      if (typeof v !== "string" || !values.includes(v)) fail(`${label} sconosciuto (${JSON.stringify(v)})`);
    },
    obj(key: string, label: string, opts: { optional?: boolean } = {}) {
      const v = o[key];
      if (absent(v)) return opts.optional ? undefined : fail(`manca ${label}`);
      if (!isObj(v)) fail(`${label} non valido`);
    },
  };
}

/** Lista obbligatoria o facoltativa; ogni elemento deve essere un oggetto. */
function list(doc: Obj, key: string, label: string, item: string, check: (o: Obj, where: string) => void, optional = true) {
  const v = doc[key];
  if (absent(v)) {
    if (optional) return;
    throw new Invalid(`manca l'elenco ${label}`);
  }
  if (!Array.isArray(v)) throw new Invalid(`l'elenco ${label} non è una lista`);
  v.forEach((x, i) => {
    const where = `${item} ${i + 1}`;
    if (!isObj(x)) throw new Invalid(`${where}: non è un elemento valido`);
    check(x, where);
  });
}

function stringList(doc: Obj, key: string, label: string) {
  const v = doc[key];
  if (absent(v)) return;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Invalid(`l'elenco ${label} non è valido`);
}

function dateMap(doc: Obj, key: string, label: string) {
  const v = doc[key];
  if (absent(v)) return;
  if (!isObj(v) || Object.values(v).some((x) => typeof x !== "string")) throw new Invalid(`il registro ${label} non è valido`);
}

function checkTransaction(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("id", "l'identificativo", { nonEmpty: true });
  f.date("date", "la data");
  f.str("account", "il conto", { nonEmpty: true });
  f.oneOf("type", "il tipo", TX_TYPES);
  // Vuoto per saldi, versamenti, prelievi e bonifici.
  f.str("isin", "l'ISIN");
  for (const [k, label] of [
    ["quantity", "la quantità"],
    ["price", "il prezzo"],
    ["fxRate", "il cambio"],
    ["fees", "le commissioni"],
    ["amount", "l'importo"],
    ["taxWithheld", "la tassa trattenuta"],
    ["splitRatio", "il rapporto di split"],
  ] as const)
    f.num(k, label, { optional: true });
  f.str("note", "la nota", { optional: true });
  f.str("toAccount", "il conto di destinazione", { optional: true });
  f.str("plan", "il piano ricorrente", { optional: true });
}

function checkInstrument(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("isin", "l'ISIN", { nonEmpty: true });
  f.str("name", "il nome");
  f.str("shortName", "il nome breve", { optional: true });
  f.str("ticker", "il ticker");
  f.str("currency", "la valuta", { nonEmpty: true });
  f.oneOf("assetClass", "il tipo di strumento", ASSET_CLASSES);
  f.num("govBondShare", "la quota di titoli di Stato", { optional: true });
  f.num("ter", "il TER", { optional: true });
}

function checkAccount(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("id", "l'identificativo", { nonEmpty: true });
  f.str("name", "il nome");
  f.str("color", "il colore");
}

function checkGoal(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("id", "l'identificativo", { nonEmpty: true });
  f.str("name", "il nome");
  f.num("target", "il traguardo");
  f.date("date", "la scadenza");
  f.str("scope", "l'ambito");
}

function checkReminder(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("id", "l'identificativo", { nonEmpty: true });
  f.str("title", "il titolo");
  f.date("date", "la data");
  f.oneOf("repeat", "la ripetizione", ["none", "monthly", "yearly"]);
}

function checkRecurring(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("id", "l'identificativo", { nonEmpty: true });
  f.oneOf("kind", "il tipo", ["deposit", "transfer", "pac"]);
  f.str("label", "il nome");
  f.num("day", "il giorno del mese");
  f.oneOf("holiday", "la regola per i festivi", ["same", "next", "previous"]);
  f.str("account", "il conto", { nonEmpty: true });
  f.str("toAccount", "il conto di destinazione", { optional: true });
  f.num("amount", "l'importo", { optional: true });
  f.str("isin", "l'ISIN", { optional: true });
  f.num("budget", "l'importo per rata", { optional: true });
  f.date("since", "la prima scadenza");
  f.bool("active", "lo stato");
  f.oneOf("mode", "la modalità", ["confirm", "auto"], { optional: true });
}

function checkRule(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("id", "l'identificativo", { nonEmpty: true });
  f.oneOf("kind", "il tipo", ["price", "dayMove", "gain", "value", "weight"]);
  f.str("target", "il titolo");
  f.oneOf("op", "il verso", ["above", "below"]);
  f.num("threshold", "la soglia");
  f.oneOf("repeat", "la ripetizione", ["once", "daily"]);
  f.bool("enabled", "lo stato");
  f.str("note", "la nota", { optional: true });
}

function checkReport(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("id", "l'identificativo", { nonEmpty: true });
  f.str("analysis", "il tipo di analisi");
  f.str("title", "il titolo");
  f.str("date", "la data");
  f.obj("report", "il contenuto");
}

function checkWatch(o: Obj, where: string) {
  const f = fields(o, where);
  f.str("ticker", "il ticker", { nonEmpty: true });
  f.str("name", "il nome");
  f.str("currency", "la valuta");
  f.str("isin", "l'ISIN", { optional: true });
}

function checkShape(input: unknown): PortfolioData {
  if (!isObj(input)) throw new Invalid("il file non è un backup di Basis");
  if (!Array.isArray(input.transactions) || !Array.isArray(input.instruments) || !Array.isArray(input.accounts)) throw new Invalid("il file non è un backup di Basis");
  list(input, "accounts", "dei conti", "Conto", checkAccount, false);
  list(input, "instruments", "degli strumenti", "Strumento", checkInstrument, false);
  list(input, "transactions", "dei movimenti", "Movimento", checkTransaction, false);
  list(input, "goals", "degli obiettivi", "Obiettivo", checkGoal);
  list(input, "reminders", "dei promemoria", "Promemoria", checkReminder);
  list(input, "recurring", "delle operazioni ricorrenti", "Operazione ricorrente", checkRecurring);
  list(input, "alertRules", "delle regole di notifica", "Regola di notifica", checkRule);
  list(input, "aiReports", "delle analisi", "Analisi", checkReport);
  list(input, "watchlist", "dei titoli osservati", "Titolo osservato", checkWatch);
  stringList(input, "recurringSkipped", "delle rate saltate");
  stringList(input, "alertsSeen", "degli avvisi visti");
  stringList(input, "alertsDismissed", "degli avvisi archiviati");
  dateMap(input, "deleted", "delle cancellazioni");
  dateMap(input, "revived", "dei ripristini");
  if (!absent(input.plan)) {
    if (!isObj(input.plan)) throw new Invalid("il piano di accumulo non è valido");
    const f = fields(input.plan, "Piano");
    f.num("monthly", "il versamento mensile");
    f.num("expectedReturn", "il rendimento atteso");
    f.num("years", "gli anni");
  }
  if (!absent(input.targets) && (!isObj(input.targets) || Object.values(input.targets).some((v) => typeof v !== "number" || !Number.isFinite(v))))
    throw new Invalid("l'allocazione obiettivo non è valida");
  if (!absent(input.notify) && !isObj(input.notify)) throw new Invalid("le impostazioni delle notifiche non sono valide");
  if (!absent(input.profile) && !isObj(input.profile)) throw new Invalid("il profilo non è valido");
  if (!absent(input.isDemo) && typeof input.isDemo !== "boolean") throw new Invalid("il campo isDemo non è vero/falso");
  return { ...(input as unknown as PortfolioData), isDemo: input.isDemo === true };
}

/** Solo la forma del documento (usato dal server a ogni salvataggio). */
export function validatePortfolioShape(input: unknown): ValidationResult {
  try {
    return { ok: true, data: checkShape(input) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

/** Forma del documento e coerenza dei movimenti (usato all'import di un backup). */
export function validatePortfolioData(input: unknown): ValidationResult {
  const shape = validatePortfolioShape(input);
  if (!shape.ok) return shape;
  const { transactions, instruments } = shape.data;
  // Id duplicati renderebbero ambigue modifiche, cancellazioni e unione tra dispositivi.
  // (Solo all'import: sul server non si blocca la sincronizzazione di dati già salvati.)
  const ids = new Set<string>();
  for (const [i, t] of transactions.entries()) {
    if (ids.has(t.id)) return { ok: false, error: `Movimento ${i + 1}: identificativo ripetuto (${t.id})` };
    ids.add(t.id);
  }
  const known = new Set(instruments.map((i) => i.isin));
  const needsInstrument = new Set<TransactionType>(["buy", "sell", "dividend", "split"]);
  const orphan = transactions.findIndex((t) => needsInstrument.has(t.type) && !known.has(t.isin));
  if (orphan >= 0) return { ok: false, error: `Movimento ${orphan + 1}: lo strumento ${transactions[orphan].isin || "(ISIN vuoto)"} non è nell'elenco degli strumenti` };
  try {
    buildPortfolio(transactions, instruments);
  } catch (e) {
    return { ok: false, error: engineError((e as Error).message, transactions) };
  }
  return shape;
}

const ENGINE_FIELDS: Record<string, string> = { quantity: "la quantità", price: "il prezzo", amount: "l'importo", splitRatio: "il rapporto di split" };

/** Il motore cita l'id del movimento (o vendita, conto e data): lo traduco nella posizione nel file. */
function engineError(msg: string, transactions: PortfolioData["transactions"]): string {
  const byId = /^(?:Transazione|Bonifico) (.+?)(?::| senza) ?(.*)$/.exec(msg);
  if (byId) {
    const i = transactions.findIndex((t) => t.id === byId[1]);
    if (i >= 0) {
      const detail = msg.startsWith("Bonifico") ? "bonifico senza conto di destinazione" : byId[2].replace(/"(\w+)"/g, (_, k: string) => ENGINE_FIELDS[k] ?? k);
      return `Movimento ${i + 1}: ${detail}`;
    }
  }
  const sell = /^Vendita di \S+ (\S+) su (.+) il (\d{4}-\d{2}-\d{2}): quantità disponibile (.+)$/.exec(msg);
  if (sell) {
    const i = transactions.findIndex((t) => t.type === "sell" && t.isin === sell[1] && t.account === sell[2] && t.date === sell[3]);
    if (i >= 0) return `Movimento ${i + 1}: vende più quote di quelle possedute a quella data (disponibili ${sell[4]})`;
  }
  return `movimenti incoerenti: ${msg}`;
}
