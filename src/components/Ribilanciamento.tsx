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
  const [contribution, setContribution] = useState(String(monthly || 500));
  useEffect(() => {
    setPcts(Object.fromEntries(classes.map((k) => [k, String(Math.round(((targets?.[k] ?? (total ? current[k] / total : 0)) * 100)))])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.join(","), targets]);

  const sum = classes.reduce((a, k) => a + (Number(pcts[k]) || 0), 0);
  const valid = Math.round(sum) === 100;
  const amount = Number(contribution.replace(/\./g, "").replace(",", ".")) || 0;

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
      <SectionHeader>Ribilanciamento</SectionHeader>
      <Panel>
        {classes.map((k) => {
          const cur = total ? current[k] / total : 0;
          return (
            <div key={k} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0">
              <BankDot color={ASSET_CLASS_COLOR[k as AssetClass] ?? "#888"} size={10} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{ASSET_CLASS_LABEL[k as AssetClass] ?? k}</p>
                <p className="num text-[12px] text-mut">ora {Math.round(cur * 100)}%</p>
              </div>
              <label className="flex items-center gap-1 rounded-[10px] bg-chip px-2.5 py-1.5">
                <span className="sr-only">Peso obiettivo {ASSET_CLASS_LABEL[k as AssetClass]}</span>
                <input
                  inputMode="numeric"
                  value={pcts[k] ?? ""}
                  onChange={(e) => setPcts({ ...pcts, [k]: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                  className="num w-9 bg-transparent text-right text-[16px] font-semibold outline-none"
                />
                <span className="text-[14px] text-mut">%</span>
              </label>
            </div>
          );
        })}
        <label className="flex items-center justify-between gap-3 bg-panel-2 px-4 py-3">
          <span className="text-[15px] text-ink-2">Prossimo versamento</span>
          <span className="flex items-center gap-1">
            <input
              inputMode="decimal"
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              className="num w-24 bg-transparent text-right text-[16px] font-semibold outline-none"
            />
            <span className="text-[15px] text-mut">€</span>
          </span>
        </label>
      </Panel>
      {!valid && <p className="px-5 pt-2 text-[13px] text-warn">I pesi devono sommare 100% (ora {sum}%).</p>}

      {valid && amount > 0 && (
        <>
          <p className="px-5 pb-2 pt-5 text-[13px] font-medium text-mut">Come dividere i {fmtEur0(amount)}</p>
          <Panel>
            {classes
              .filter((k) => (split[k] ?? 0) >= 1)
              .map((k) => {
                const v = pick(k);
                const name = v?.instrument.shortName ?? v?.instrument.name ?? ASSET_CLASS_LABEL[k as AssetClass];
                return (
                  <Link key={k} href={v ? `/posizioni/${v.instrument.isin}` : "#"} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0 active:bg-panel-2">
                    {v ? <Logo isin={v.instrument.isin} name={name} size={36} /> : <BankDot color={ASSET_CLASS_COLOR[k as AssetClass]} size={12} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">Compra {name}</p>
                      <p className="text-[12px] text-mut">{ASSET_CLASS_LABEL[k as AssetClass]}</p>
                    </div>
                    <p className="num text-[16px] font-semibold">{fmtEur0(split[k])}</p>
                  </Link>
                );
              })}
          </Panel>
          <p className="px-5 pt-2 text-[12px] leading-snug text-faint">
            Ribilanciare comprando invece di vendere non genera plusvalenze, quindi niente tasse. Il titolo suggerito è il più grande che hai già in quella classe.
          </p>
        </>
      )}
    </>
  );
}
