"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, OctagonAlert } from "lucide-react";
import { Panel } from "@/components/ui";
import type { PositionView, Totals } from "@/lib/analytics";
import type { Account, PortfolioState } from "@/lib/engine/types";
import { portfolioHealth, type Level } from "@/lib/health";

const LEVEL = {
  ok: { icon: CheckCircle2, cls: "text-up" },
  attenzione: { icon: AlertTriangle, cls: "text-warn" },
  critico: { icon: OctagonAlert, cls: "text-dn" },
} as const;

export function Salute({ views, totals, state, accounts }: { views: PositionView[]; totals: Totals; state: PortfolioState; accounts: Account[] }) {
  const health = useMemo(() => portfolioHealth(views, totals, state, accounts), [views, totals, state, accounts]);
  const [open, setOpen] = useState<string | null>(health.areas.find((a) => a.score < 20)?.id ?? null);

  const verdict = health.score >= 85 ? "Ottimo" : health.score >= 70 ? "Buono" : health.score >= 50 ? "Da migliorare" : "Da rivedere";
  const color = health.score >= 70 ? "var(--up)" : health.score >= 50 ? "var(--warn)" : "var(--dn)";

  return (
    <div>
      <div className="px-4 pt-6">
        <p className="text-[14px] text-mut">Stato di salute del portafoglio</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="hero-number num">{health.score}</span>
          <span className="text-[17px] text-mut">su 100</span>
          <span className="ml-auto text-[17px] font-semibold" style={{ color }}>
            {verdict}
          </span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-chip">
          <div className="grow-x h-full rounded-full" style={{ width: `${health.score}%`, background: color }} />
        </div>
        <p className="mt-2 text-[14px] text-mut">Regole su diversificazione, costi, fisco e liquidità.</p>
      </div>

      <ul className="mt-6">
        {health.areas.map((a) => {
          const isOpen = open === a.id;
          const worst: Level = a.checks.some((x) => x.level === "critico") ? "critico" : a.checks.some((x) => x.level === "attenzione") ? "attenzione" : "ok";
          const Icon = LEVEL[worst].icon;
          return (
            <li key={a.id}>
              <button onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-panel-2">
                <Icon size={22} className={`shrink-0 ${LEVEL[worst].cls}`} />
                <p className="min-w-0 flex-1 text-[17px] font-semibold">{a.label}</p>
                <p className="num shrink-0 text-[17px] font-medium">
                  {a.score}
                  <span className="text-[14px] font-normal text-mut">/25</span>
                </p>
                <ChevronDown size={18} className={`shrink-0 text-mut transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <Panel className="mb-3">
                  <ul>
                    {a.checks.map((x, i) => {
                      const L = LEVEL[x.level];
                      return (
                        <li key={i} className="flex gap-3 border-b border-sep px-4 py-3 last:border-0">
                          <L.icon size={17} className={`mt-0.5 shrink-0 ${L.cls}`} />
                          <div>
                            <p className="text-[15px] font-semibold">{x.title}</p>
                            <p className="mt-0.5 text-[14px] leading-snug text-mut">{x.detail}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-6 pb-2 pt-6 text-center text-[12px] leading-relaxed text-mut">Indicazioni automatiche, non consulenza finanziaria.</p>
    </div>
  );
}
