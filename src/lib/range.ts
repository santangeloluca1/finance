import { cutoffDate } from "./analytics";

/** Periodi dei grafici: stesso insieme e stesso ordine in tutta l'app. */
export type Range = "1G" | "1S" | "1M" | "6M" | "YTD" | "1A" | "MAX";
export const RANGES: Range[] = ["1G", "1S", "1M", "6M", "YTD", "1A", "MAX"];

const DAYS: Record<Exclude<Range, "YTD" | "MAX">, number> = { "1G": 1, "1S": 7, "1M": 31, "6M": 183, "1A": 366 };

/** Nome per esteso, per i menu. */
export const RANGE_LABEL: Record<Range, string> = {
  "1G": "Oggi",
  "1S": "1 settimana",
  "1M": "1 mese",
  "6M": "6 mesi",
  YTD: "Da inizio anno",
  "1A": "1 anno",
  MAX: "Dall'inizio",
};

/** "nell'ultimo mese", per le frasi sotto i totali. */
export const RANGE_PHRASE: Record<Range, string> = {
  "1G": "oggi",
  "1S": "nell'ultima settimana",
  "1M": "nell'ultimo mese",
  "6M": "negli ultimi 6 mesi",
  YTD: "da inizio anno",
  "1A": "nell'ultimo anno",
  MAX: "dall'inizio",
};

/** Primo giorno (YYYY-MM-DD) del periodo. */
export function rangeStart(r: Range): string {
  if (r === "YTD") return `${new Date().getFullYear()}-01-01`;
  if (r === "MAX") return "0000-01-01";
  return cutoffDate(DAYS[r]);
}
