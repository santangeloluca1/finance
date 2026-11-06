/** Indici di confronto (ETF quotati in euro che li replicano). */
export const BENCHMARKS = [
  { value: "SWDA.MI", label: "MSCI World" },
  { value: "VWCE.DE", label: "FTSE All-World" },
  { value: "CSSPX.MI", label: "S&P 500" },
  { value: "MEUD.PA", label: "Stoxx Europe 600" },
  { value: "AGGH.MI", label: "Obbligazioni globali" },
] as const;

/** Allinea una serie di livelli (prezzo o indice) alle date date: variazione dalla prima data. */
export function alignSeries(dates: string[], series: [string, number][] | undefined): (number | null)[] | undefined {
  if (!series?.length || !dates.length) return undefined;
  let j = 0;
  let last: number | null = null;
  const levels = dates.map((d) => {
    while (j < series.length && series[j][0] <= d) last = series[j++][1];
    return last;
  });
  const base = levels.find((v) => v !== null);
  return base ? levels.map((v) => (v === null ? null : v / base - 1)) : undefined;
}
