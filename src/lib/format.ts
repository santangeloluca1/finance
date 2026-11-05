const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("it-IT", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });

export const fmtEur = (n: number) => eur.format(n);
export const fmtEur0 = (n: number) => eur0.format(n);
export const fmtNum = (n: number) => num.format(n);
export const fmtPct = (n: number) => pct.format(n);
export const fmtSignedEur = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + eur.format(Math.abs(n));
export const fmtSignedPct = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + pct.format(Math.abs(n));
export const fmtPrice = (n: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency, maximumFractionDigits: 4, minimumFractionDigits: 2 }).format(n);

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", opts);
}

export function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export const tone = (n: number) => (n > 0.004 ? "text-gain" : n < -0.004 ? "text-loss" : "text-muted");
