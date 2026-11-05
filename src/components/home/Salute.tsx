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

  // Arco del punteggio (270°).
  const r = 70;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;

  return (
    <div>
      <div className="flex flex-col items-center pt-8">
        <div className="relative h-[170px] w-[170px]">
          <svg viewBox="0 0 170 170" className="h-full w-full rotate-[135deg]" aria-hidden>
            <circle cx="85" cy="85" r={r} fill="none" stroke="var(--chip)" strokeWidth="12" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
            <circle
              cx="85"
              cy="85"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeDasharray={`${(arc * health.score) / 100} ${c}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="num text-[48px] font-semibold leading-none tracking-[-0.05em]">{health.score}</p>
            <p className="mt-1 text-[13px] text-mut">su 100</p>
          </div>
        </div>
        <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em]" style={{ color }}>
          {verdict}
        </p>
        <p className="mt-1 max-w-[290px] text-center text-[13px] leading-snug text-mut">
          Controllo a regole su diversificazione, costi, fisco e liquidità. Tocca un&apos;area per i dettagli.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {health.areas.map((a) => {
          const isOpen = open === a.id;
          const worst: Level = a.checks.some((x) => x.level === "critico") ? "critico" : a.checks.some((x) => x.level === "attenzione") ? "attenzione" : "ok";
          const Icon = LEVEL[worst].icon;
          return (
            <Panel key={a.id}>
              <button onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <Icon size={20} className={`shrink-0 ${LEVEL[worst].cls}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold">{a.label}</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chip">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(a.score / 25) * 100}%`, background: a.score >= 20 ? "var(--up)" : a.score >= 12 ? "var(--warn)" : "var(--dn)" }}
                    />
                  </div>
                </div>
                <p className="num shrink-0 text-[15px] font-semibold">
                  {a.score}
                  <span className="text-[12px] font-normal text-mut">/25</span>
                </p>
                <ChevronDown size={18} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <ul className="border-t border-sep">
                  {a.checks.map((x, i) => {
                    const L = LEVEL[x.level];
                    return (
                      <li key={i} className="flex gap-3 border-b border-sep px-4 py-3 last:border-0">
                        <L.icon size={16} className={`mt-0.5 shrink-0 ${L.cls}`} />
                        <div>
                          <p className="text-[14px] font-semibold">{x.title}</p>
                          <p className="mt-0.5 text-[13px] leading-snug text-mut">{x.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>
      <p className="px-8 pb-2 pt-5 text-center text-[11px] leading-relaxed text-faint">
        Indicazioni automatiche a scopo informativo, non consulenza finanziaria.
      </p>
    </div>
  );
}
