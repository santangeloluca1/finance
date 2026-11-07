"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BankDot, Logo, Panel, SectionHeader } from "@/components/ui";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, type PositionView } from "@/lib/analytics";
import type { AssetClass } from "@/lib/engine/types";
import { fmtEur0 } from "@/lib/format";
import { splitContribution } from "@/lib/rebalance";
import { saveTargets } from "@/lib/store";

/**
 * Allocazione obiettivo per asset class e suggerimento su come dividere il
 * prossimo versamento per avvicinarsi, senza vendere (quindi senza tasse).
 */
export function Ribilanciamento({ views, targets, monthly }: { views: PositionView[]; targets?: Record<string, number>; monthly: number }) {
  const current = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of views) m[v.instrument.assetClass] = (m[v.instrument.assetClass] ?? 0) + v.value;
    return m;
  }, [views]);
  const total = Object.values(current).reduce((a, b) => a + b, 0);
  const classes = Object.keys(current).sort((a, b) => current[b] - current[a]);

  // Pesi in percentuale intera; di default l'allocazione attuale.
  const [pcts, setPcts] = useState<Record<string, string>>({});
  useEffect(() => {
    setPcts(Object.fromEntries(classes.map((k) => [k, String(Math.round(((targets?.[k] ?? (total ? current[k] / total : 0)) * 100)))])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.join(","), targets]);

  const sum = classes.reduce((a, k) => a + (Number(pcts[k]) || 0), 0);
  const valid = Math.round(sum) === 100;
  const amount = monthly;

  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(() => {
      const next = Object.fromEntries(classes.map((k) => [k, (Number(pcts[k]) || 0) / 100]));
      if (JSON.stringify(next) !== JSON.stringify(targets ?? {})) saveTargets(next);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcts, valid]);

  const split = useMemo(() => {
    if (!valid || amount <= 0) return {};
    return splitContribution(current, Object.fromEntries(classes.map((k) => [k, (Number(pcts[k]) || 0) / 100])), amount);
  }, [valid, amount, current, classes, pcts]);

  // Per ogni classe, lo strumento più grande già in portafoglio.
  const pick = (cls: string) => views.filter((v) => v.instrument.assetClass === cls).sort((a, b) => b.value - a.value)[0];

  if (!classes.length) return null;

  return (
    <>
      <SectionHeader>Dove investire il versamento</SectionHeader>
      <p className="px-4 pb-3 text-[14px] leading-snug text-mut">Scegli i pesi che vuoi avere: ti diciamo come dividere i {fmtEur0(amount)} del piano per avvicinarti.</p>
      <Panel>
        {classes.map((k) => {
          const cur = total ? current[k] / total : 0;
          return (
            <div key={k} className="flex min-h-[56px] items-center gap-3 border-b border-sep px-4 py-2 last:border-0">
              <BankDot color={ASSET_CLASS_COLOR[k as AssetClass] ?? "#888"} size={9} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-medium">{ASSET_CLASS_LABEL[k as AssetClass] ?? k}</p>
                <p className="num text-[13px] text-mut">ora {Math.round(cur * 100)}%</p>
              </div>
              <label className="flex min-h-[44px] items-center">
                <span className="sr-only">Peso obiettivo {ASSET_CLASS_LABEL[k as AssetClass]}</span>
                <input
                  inputMode="numeric"
                  value={pcts[k] ?? ""}
                  onChange={(e) => setPcts({ ...pcts, [k]: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                  className="num w-10 bg-transparent text-right text-[17px] font-semibold text-accent outline-none"
                />
                <span className="-ml-px text-[17px] font-semibold text-accent">%</span>
              </label>
            </div>
          );
        })}
      </Panel>
      {!valid && <p className="px-4 pt-2 text-[14px] text-warn">I pesi devono sommare 100% (ora {sum}%).</p>}

      {valid && amount > 0 && (
        <>
          <p className="px-4 pb-1 pt-6 text-[15px] font-medium text-mut">Questo mese</p>
          <ul>
            {classes
              .filter((k) => (split[k] ?? 0) >= 1)
              .map((k) => {
                const v = pick(k);
                const name = v?.instrument.shortName ?? v?.instrument.name ?? ASSET_CLASS_LABEL[k as AssetClass];
                return (
                  <li key={k}>
                  <Link href={v ? `/posizioni/${v.instrument.isin}` : "#"} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
                    {v ? <Logo isin={v.instrument.isin} name={name} size={44} /> : <BankDot color={ASSET_CLASS_COLOR[k as AssetClass]} size={12} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold">Compra {name}</p>
                      <p className="text-[14px] text-mut">{ASSET_CLASS_LABEL[k as AssetClass]}</p>
                    </div>
                    <p className="num text-[17px] font-medium">{fmtEur0(split[k])}</p>
                  </Link>
                  </li>
                );
              })}
          </ul>
          <p className="px-4 pt-1 text-[13px] leading-snug text-mut">Comprando invece di vendere non paghi tasse.</p>
        </>
      )}
    </>
  );
}
