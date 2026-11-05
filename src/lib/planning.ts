/**
 * Proiezioni con capitalizzazione mensile: valore iniziale `pv`, versamento
 * mensile `pmt` a fine mese, rendimento annuo `r`.
 */
export function futureValue(pv: number, pmt: number, r: number, months: number) {
  const i = Math.pow(1 + r, 1 / 12) - 1;
  if (Math.abs(i) < 1e-12) return pv + pmt * months;
  const g = Math.pow(1 + i, months);
  return pv * g + pmt * ((g - 1) / i);
}

/** Serie annuale del valore proiettato (anno 0 = oggi). */
export function projection(pv: number, pmt: number, r: number, years: number) {
  return Array.from({ length: years + 1 }, (_, y) => ({ year: y, value: futureValue(pv, pmt, r, y * 12), contributed: pv + pmt * 12 * y }));
}

/** Versamento mensile necessario per arrivare a `target` in `months` mesi. */
export function requiredMonthly(pv: number, target: number, r: number, months: number) {
  if (months <= 0) return Math.max(0, target - pv);
  const i = Math.pow(1 + r, 1 / 12) - 1;
  const g = Math.pow(1 + i, months);
  const gap = target - pv * g;
  if (gap <= 0) return 0;
  return Math.abs(i) < 1e-12 ? gap / months : (gap * i) / (g - 1);
}

export function monthsUntil(date: string, from = new Date()) {
  const d = new Date(`${date}T12:00:00`);
  return Math.max(0, (d.getFullYear() - from.getFullYear()) * 12 + (d.getMonth() - from.getMonth()));
}
