/** Profilo dell'investitore: risposte a poche domande, usate in ogni analisi. */
export interface InvestorProfile {
  horizon: "breve" | "medio" | "lungo" | "molto-lungo";
  drawdown: "10" | "20" | "35" | "50";
  goal: "crescita" | "rendita" | "equilibrio" | "protezione";
  experience: "base" | "intermedio" | "esperto";
  emergency: "si" | "parziale" | "no";
  ageBand: "under30" | "30-45" | "45-60" | "over60";
  /** Note libere (es. "compro casa nel 2029", "niente azioni singole"). */
  notes?: string;
  updatedAt?: string;
}

export const PROFILE_QUESTIONS: {
  key: Exclude<keyof InvestorProfile, "notes" | "updatedAt">;
  question: string;
  options: { value: string; label: string; hint?: string }[];
}[] = [
  {
    key: "horizon",
    question: "Fra quanto pensi di usare la maggior parte di questi soldi?",
    options: [
      { value: "breve", label: "Entro 3 anni" },
      { value: "medio", label: "Fra 3 e 10 anni" },
      { value: "lungo", label: "Fra 10 e 20 anni" },
      { value: "molto-lungo", label: "Oltre 20 anni", hint: "es. pensione" },
    ],
  },
  {
    key: "drawdown",
    question: "Il portafoglio scende in un anno. Fino a che punto resti tranquillo senza vendere?",
    options: [
      { value: "10", label: "−10%", hint: "di più mi preoccupa" },
      { value: "20", label: "−20%" },
      { value: "35", label: "−35%", hint: "come nel 2008 per un portafoglio bilanciato" },
      { value: "50", label: "−50% o più", hint: "so che poi recupera" },
    ],
  },
  {
    key: "goal",
    question: "Cosa conta di più per te?",
    options: [
      { value: "crescita", label: "Far crescere il capitale" },
      { value: "rendita", label: "Una rendita da cedole e dividendi" },
      { value: "equilibrio", label: "Un equilibrio tra le due" },
      { value: "protezione", label: "Proteggere quello che ho" },
    ],
  },
  {
    key: "experience",
    question: "Quanta esperienza hai con gli investimenti?",
    options: [
      { value: "base", label: "Poca", hint: "spiegami le cose" },
      { value: "intermedio", label: "Discreta" },
      { value: "esperto", label: "Molta", hint: "vai al punto" },
    ],
  },
  {
    key: "emergency",
    question: "Hai un fondo per le emergenze fuori da questi investimenti?",
    options: [
      { value: "si", label: "Sì, almeno 6 mesi di spese" },
      { value: "parziale", label: "In parte" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "ageBand",
    question: "Quanti anni hai?",
    options: [
      { value: "under30", label: "Meno di 30" },
      { value: "30-45", label: "30–45" },
      { value: "45-60", label: "45–60" },
      { value: "over60", label: "Oltre 60" },
    ],
  },
];

/** Profilo in parole, per il modello. */
export function describeProfile(p: InvestorProfile | undefined) {
  if (!p) return "Profilo non compilato: fai ipotesi prudenti e dillo esplicitamente.";
  const ans = (k: (typeof PROFILE_QUESTIONS)[number]["key"]) => {
    const q = PROFILE_QUESTIONS.find((x) => x.key === k)!;
    return `${q.question} → ${q.options.find((o) => o.value === p[k])?.label ?? "non risposto"}`;
  };
  return [...PROFILE_QUESTIONS.map((q) => ans(q.key)), p.notes ? `Note dell'investitore: ${p.notes}` : ""].filter(Boolean).join("\n");
}
