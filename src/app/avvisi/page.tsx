"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, BellOff, ChevronRight, Info, Sparkles } from "lucide-react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { BackLink, LargeTitle, Panel } from "@/components/ui";
import { computeAlerts } from "@/lib/alerts";

const ICON = {
  attenzione: { icon: AlertTriangle, cls: "bg-warn/15 text-warn" },
  positivo: { icon: Sparkles, cls: "bg-up/15 text-up" },
  info: { icon: Info, cls: "bg-chip text-mut" },
} as const;

export default function Avvisi() {
  const { data, state, views, totals } = usePortfolioView();
  const alerts = useMemo(() => (state && totals ? computeAlerts(data, state, views, totals.value) : []), [data, state, views, totals]);

  return (
    <div>
      <BackLink href="/" label="Home" />
      <LargeTitle>Avvisi</LargeTitle>
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-mut">
            <BellOff size={24} />
          </span>
          <p className="mt-4 text-[17px] font-semibold">Tutto tranquillo</p>
          <p className="mt-1 text-[14px] leading-snug text-mut">
            Qui compaiono minus in scadenza, cali forti, cedole in arrivo e obiettivi raggiunti.
          </p>
        </div>
      ) : (
        <Panel>
          {alerts.map((a) => {
            const I = ICON[a.level];
            return (
              <Link key={a.id} href={a.href} className="flex items-center gap-3 border-b border-sep px-4 py-3.5 last:border-0 active:bg-panel-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${I.cls}`}>
                  <I.icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">{a.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-mut">{a.detail}</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            );
          })}
        </Panel>
      )}
      <p className="px-8 pt-4 text-center text-[12px] leading-snug text-faint">
        Gli avvisi si aggiornano ogni volta che apri l&apos;app. Le notifiche push sull&apos;iPhone arriveranno in seguito.
      </p>
    </div>
  );
}
