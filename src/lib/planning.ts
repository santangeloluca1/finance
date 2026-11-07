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

export interface GoalInput {
  id: string;
  target: number;
  date: string;
  /** "tutto", "liquidita" o l'id di un conto. */
  scope: string;
}

export interface GoalPlan {
  id: string;
  /** Parte del patrimonio assegnata all'obiettivo, dopo quelli con priorità più alta. */
  allocated: number;
  /** Versamento mensile necessario per arrivarci in tempo. */
  need: number;
  /** Versamento mensile che il piano riesce a dedicargli. */
  funded: number;
  status: "done" | "ok" | "late" | "expired";
  /** Quanto manca al mese per essere in linea (solo "late"). */
  extra: number;
  /** Mesi da oggi per arrivarci col versamento disponibile (null se mai entro 50 anni). */
  monthsAtPace: number | null;
}

/**
 * Divide patrimonio e versamento mensile tra gli obiettivi in ordine di priorità
 * (il primo dell'elenco viene servito per primo), così lo stesso denaro non conta due volte.
 * `pools` dà il valore di ciascun ambito: "tutto" è il totale, gli altri ne sono una parte.
 */
export function planGoals(goals: GoalInput[], pools: (scope: string) => number, monthly: number, r: number, from = new Date()): GoalPlan[] {
  const total = pools("tutto");
  let usedTotal = 0;
  const used: Record<string, number> = {};
  let budget = Math.max(0, monthly);

  return goals.map((g) => {
    const free = g.scope === "tutto" ? total - usedTotal : Math.min(pools(g.scope) - (used[g.scope] ?? 0), total - usedTotal);
    const allocated = Math.max(0, Math.min(g.target, free));
    usedTotal += allocated;
    used[g.scope] = (used[g.scope] ?? 0) + allocated;

    const base = { id: g.id, allocated, extra: 0 };
    if (allocated >= g.target) return { ...base, need: 0, funded: 0, status: "done" as const, monthsAtPace: 0 };

    const months = monthsUntil(g.date, from);
    const need = requiredMonthly(allocated, g.target, r, months);
    if (months === 0) return { ...base, need, funded: 0, status: "expired" as const, monthsAtPace: reach(allocated, g.target, budget, r) };
    if (need <= budget + 0.5) {
      budget -= need;
      return { ...base, need, funded: need, status: "ok" as const, monthsAtPace: months };
    }
    const funded = budget;
    budget = 0;
    return { ...base, need, funded, status: "late" as const, extra: need - funded, monthsAtPace: reach(allocated, g.target, funded, r) };
  });
}

/** Primo mese in cui `pv` con versamenti `pmt` arriva a `target` (null oltre 50 anni). */
function reach(pv: number, target: number, pmt: number, r: number) {
  for (let m = 1; m <= 600; m++) if (futureValue(pv, pmt, r, m) >= target) return m;
  return null;
}
