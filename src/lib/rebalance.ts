/**
 * Ribilanciamento senza vendite: divide un nuovo versamento tra le classi
 * sottopesate, in proporzione a quanto manca a ciascuna per tornare al peso
 * obiettivo calcolato sul patrimonio dopo il versamento.
 */
export function splitContribution(current: Record<string, number>, targets: Record<string, number>, contribution: number) {
  const keys = Object.keys(targets);
  const total = keys.reduce((a, k) => a + (current[k] ?? 0), 0) + contribution;
  const deficit = Object.fromEntries(keys.map((k) => [k, Math.max(0, targets[k] * total - (current[k] ?? 0))]));
  const sum = Object.values(deficit).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = sum > 0 ? (deficit[k] / sum) * contribution : contribution * targets[k];
  return out;
}
