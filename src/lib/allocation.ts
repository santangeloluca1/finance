import type { AssetClass } from "./engine/types";

/**
 * Composizione del portafoglio in quattro gruppi semplici, da cui si stima il
 * rendimento atteso e si decide dove mettere il versamento del mese.
 */
export type Group = "azioni" | "obbligazioni" | "liquidita" | "altro";
export const GROUPS: Group[] = ["azioni", "obbligazioni", "liquidita", "altro"];

export const GROUP_LABEL: Record<Group, string> = {
  azioni: "Azioni",
  obbligazioni: "Obbligazioni",
  liquidita: "Liquidità",
  altro: "Oro, crypto e altro",
};

export const GROUP_COLOR: Record<Group, string> = {
  azioni: "#5468ff",
  obbligazioni: "#22b8cf",
  liquidita: "#9aa3b2",
  altro: "#f5a524",
};

/** Rendimento annuo di lungo periodo ipotizzato per gruppo (lordo, nominale). */
export const GROUP_RETURN: Record<Group, number> = { azioni: 0.07, obbligazioni: 0.03, liquidita: 0.02, altro: 0.04 };

export function groupOf(c: AssetClass): Group {
  if (c === "etf_azionario" || c === "azione") return "azioni";
  if (c === "etf_obbligazionario" || c === "obbligazione") return "obbligazioni";
  return "altro";
}

/** Pesi in punti percentuali interi, che sommano sempre a 100. */
export type Weights = Record<Group, number>;

export const PRESETS: { id: string; label: string; weights: Weights }[] = [
  { id: "prudente", label: "Prudente", weights: { azioni: 30, obbligazioni: 55, liquidita: 15, altro: 0 } },
  { id: "bilanciato", label: "Bilanciato", weights: { azioni: 60, obbligazioni: 30, liquidita: 10, altro: 0 } },
  { id: "dinamico", label: "Dinamico", weights: { azioni: 85, obbligazioni: 10, liquidita: 5, altro: 0 } },
];

/** Arrotonda a interi mantenendo la somma a 100 (metodo dei resti più grandi). */
export function normalize(raw: Partial<Record<Group, number>>): Weights {
  const tot = GROUPS.reduce((a, g) => a + Math.max(0, raw[g] ?? 0), 0);
  if (tot <= 0) return { azioni: 0, obbligazioni: 0, liquidita: 100, altro: 0 };
  const exact = GROUPS.map((g) => (Math.max(0, raw[g] ?? 0) / tot) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) if (left-- > 0) out[i]++;
  return Object.fromEntries(GROUPS.map((g, i) => [g, out[i]])) as Weights;
}

/**
 * Pesi salvati: accetta sia i gruppi sia il vecchio formato per asset class
 * (pesi 0..1), che viene sommato nei gruppi.
 */
export function fromSaved(saved: Record<string, number> | undefined): Weights | null {
  if (!saved || !Object.keys(saved).length) return null;
  const raw: Partial<Record<Group, number>> = {};
  for (const [k, v] of Object.entries(saved)) {
    const g = (GROUPS as string[]).includes(k) ? (k as Group) : groupOf(k as AssetClass);
    raw[g] = (raw[g] ?? 0) + v;
  }
  return normalize(raw);
}

export function toSaved(w: Weights): Record<string, number> {
  return Object.fromEntries(GROUPS.map((g) => [g, w[g] / 100]));
}

/**
 * Cambia il peso di un gruppo di `delta` punti mantenendo il totale a 100:
 * la differenza viene presa (o restituita) agli altri gruppi, dal più grande.
 */
export function adjust(w: Weights, g: Group, delta: number): Weights {
  const next = { ...w };
  const target = Math.max(0, Math.min(100, w[g] + delta));
  let diff = target - w[g];
  next[g] = target;
  const others = GROUPS.filter((o) => o !== g);
  while (Math.abs(diff) > 0) {
    // Se si aumenta, si toglie al più grande; se si diminuisce, si dà al più grande.
    const pool = diff > 0 ? others.filter((o) => next[o] > 0) : others;
    if (!pool.length) {
      next[g] -= diff;
      break;
    }
    const o = pool.sort((a, b) => next[b] - next[a])[0];
    const step = diff > 0 ? Math.min(diff, next[o]) : diff;
    next[o] -= step;
    diff -= step;
  }
  return next;
}

export function expectedReturn(w: Weights) {
  return GROUPS.reduce((a, g) => a + (w[g] / 100) * GROUP_RETURN[g], 0);
}

export function samePreset(w: Weights) {
  return PRESETS.find((p) => GROUPS.every((g) => p.weights[g] === w[g]))?.id ?? null;
}
