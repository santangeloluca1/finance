import { Banknote, BookOpen, ChartPie, Coins, Flag, Gauge, Layers, Receipt, Scale, Stethoscope, Zap, type LucideIcon } from "lucide-react";
import type { AnalysisId } from "@/lib/ai/prompts";

/** Icona di ogni analisi del consulente. */
export const ICON: Record<AnalysisId, LucideIcon> = {
  checkup: Stethoscope,
  fisco: Receipt,
  versamenti: Banknote,
  vendere: Scale,
  stress: Zap,
  sovrapposizioni: Layers,
  costi: Coins,
  obiettivi: Flag,
  rendita: ChartPie,
  mese: Gauge,
  titolo: BookOpen,
};
