"use client";

import { useMemo, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { BankDot, InfoRow, Panel, SectionHeader, SelectButton } from "@/components/ui";
import { lookThrough, topCompanies, useCompositions } from "@/lib/xray-client";
import { isFundLike } from "@/lib/engine/tax";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, groupBy, type PositionView, type Slice, type Totals } from "@/lib/analytics";
import type { Account } from "@/lib/engine/types";
import { fmtEur, fmtEur0, fmtPct, fmtSignedPct } from "@/lib/format";

type By = "asset" | "banca" | "paese" | "settore" | "valuta" | "titolo";
const PALETTE = ["#5468ff", "#22b8cf", "#9b6bff", "#2dd4a7", "#f5a524", "#f472b6", "#ff7a45", "#94a3b8"];

export function Analisi({
  views,
  totals,
  accounts,
  cash = {},
}: {
  views: PositionView[];
  totals: Totals;
  accounts: Account[];
  cash?: Record<string, { date: string; amount: number }>;
}) {
  const [by, setBy] = useState<By>("asset");
  const byAcc = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const fundIsins = useMemo(() => views.filter((v) => isFundLike(v.instrument)).map((v) => v.instrument.isin), [views]);
  const { compositions, loading: xrayLoading } = useCompositions(fundIsins);
  const slices: Slice[] = useMemo(() => withCash(computeSlices(), by), [views, by, byAcc, cash, compositions]);
  const companies = useMemo(() => topCompanies(views, compositions).slice(0, 10), [views, compositions]);

  function withCash(list: Slice[], mode: By): Slice[] {
    const entries = Object.entries(cash).filter(([, c]) => c.amount > 0);
    if (!entries.length) return list;
    const out = list.map((s) => ({ ...s }));
    if (mode === "banca") {
      for (const [id, c] of entries) {
        const s = out.find((x) => x.key === id);
        const a = byAcc.get(id);
        if (s) s.value += c.amount;
        else out.push({ key: id, label: a?.name ?? id, color: a?.color ?? "#888", value: c.amount });
      }
    } else if (mode === "valuta") {
      const eur = out.find((x) => x.key === "EUR");
      const total = entries.reduce((a, [, c]) => a + c.amount, 0);
      if (eur) eur.value += total;
      else out.push({ key: "EUR", label: "Euro", color: "#5468ff", value: total });
    } else {
      out.push({ key: "liquidita", label: "Liquidità", color: "#94a3b8", value: entries.reduce((a, [, c]) => a + c.amount, 0) });
    }
    return out.sort((a, b) => b.value - a.value);
  }

  function computeSlices(): Slice[] {
    if (by === "paese" || by === "settore") {
      return lookThrough(views, compositions, by === "paese" ? "countries" : "sectors").map((x, i) => ({
        key: x.name,
        label: x.name,
        value: x.value,
        color: x.name === "Altri" || x.name === "Non disponibile" ? "#64748b" : PALETTE[i % PALETTE.length],
      }));
    }
    if (by === "asset") return groupBy(views, (v) => ({ key: v.instrument.assetClass, label: ASSET_CLASS_LABEL[v.instrument.assetClass], color: ASSET_CLASS_COLOR[v.instrument.assetClass] }));
    if (by === "banca")
      return groupBy(views, (v) => {
        const a = byAcc.get(v.position.account);
        return { key: v.position.account, label: a?.name ?? v.position.account, color: a?.color ?? "#888" };
      });
    if (by === "valuta") return groupBy(views, (v) => ({ key: v.instrument.currency, label: v.instrument.currency === "EUR" ? "Euro" : v.instrument.currency === "USD" ? "Dollaro USA" : v.instrument.currency, color: "" })).map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
    return groupBy(views, (v) => ({ key: v.instrument.isin, label: v.instrument.shortName ?? v.instrument.name, color: "" })).map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  }

  const ter = views.reduce((a, v) => a + (v.value * (v.instrument.ter ?? 0)) / 100, 0);
  const banks = accounts
    .map((a) => {
      const vs = views.filter((v) => v.position.account === a.id);
      const value = vs.reduce((s, v) => s + v.value, 0);
      const cost = vs.reduce((s, v) => s + v.position.totalCost, 0);
      return { a, value, pct: cost ? (value - cost) / cost : 0 };
    })
    .filter((b) => b.value > 0);

  return (
    <div>
      <div className="pt-7">
        <Gauge slices={slices} size={280}>
          <p className="text-[13px] text-mut">Valore del portafoglio</p>
          <p className="num sensitive text-[28px] font-bold tracking-[-0.035em]">{fmtEur(totals.value)}</p>
        </Gauge>
      </div>

      <SectionHeader
        right={
          <SelectButton
            label="Raggruppa per"
            value={by}
            onChange={setBy}
            options={[
              { value: "asset", label: "Asset class" },
              { value: "paese", label: "Paese" },
              { value: "settore", label: "Settore" },
              { value: "banca", label: "Banca" },
              { value: "valuta", label: "Valuta" },
              { value: "titolo", label: "Titolo" },
            ]}
          />
        }
      >
        Composizione
      </SectionHeader>
      <ul>
        {slices.map((s) => {
          const share = s.value / (totals.value || 1);
          return (
            <li key={s.key} className="px-4 py-3">
              <div className="flex items-baseline gap-2.5">
                <BankDot color={s.color} size={9} />
                <p className="min-w-0 flex-1 truncate text-[17px] font-medium">{s.label}</p>
                <p className="num sensitive text-[15px] text-mut">{fmtEur0(s.value)}</p>
                <p className="num w-[62px] text-right text-[17px] font-semibold">{fmtPct(share)}</p>
              </div>
              <div className="ml-[19px] mt-2 h-1 overflow-hidden rounded-full bg-chip">
                <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: s.color }} />
              </div>
            </li>
          );
        })}
      </ul>

      {(by === "paese" || by === "settore") && (
        <p className="px-4 pt-1 text-[13px] leading-snug text-mut">
          {xrayLoading ? "Lettura della composizione degli ETF…" : "Esposizione dentro gli ETF, dati justETF."}
        </p>
      )}

      {companies.length > 0 && (
        <>
          <SectionHeader>Prime aziende</SectionHeader>
          <ul>
            {companies.map((c) => (
              <li key={c.name} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold">{c.name}</p>
                  <p className="truncate text-[14px] text-mut">{c.via.map((v) => (v === "diretta" ? "Azione diretta" : v)).join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-[17px] font-medium">{fmtPct(c.value / (totals.value || 1))}</p>
                  <p className="num sensitive text-[14px] text-mut">{fmtEur0(c.value)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="px-4 pt-1 text-[13px] leading-snug text-mut">Prime 10 partecipazioni di ogni ETF più le azioni dirette.</p>
        </>
      )}

      <SectionHeader>Rendimento per banca</SectionHeader>
      <ul>
        {banks.map(({ a, value, pct }) => (
          <li key={a.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
            <BankDot color={a.color} size={9} />
            <div className="flex-1">
              <p className="text-[17px] font-semibold">{a.name}</p>
              <p className="num sensitive text-[14px] text-mut">{fmtEur(value)}</p>
            </div>
            <p className={`num text-[17px] font-medium ${pct > 0.00005 ? "text-up" : pct < -0.00005 ? "text-dn" : "text-mut"}`}>{fmtSignedPct(pct)}</p>
          </li>
        ))}
      </ul>

      <SectionHeader>Costi annui</SectionHeader>
      <Panel>
        <InfoRow label="TER medio ponderato" value={`${((ter / (totals.value || 1)) * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`} />
        <InfoRow label="Costi di gestione degli ETF" value={<span className="sensitive">{fmtEur0(ter)}</span>} />
        <InfoRow label="Imposta di bollo" hint="0,2% del valore" value={<span className="sensitive">{fmtEur0(totals.value * 0.002)}</span>} />
      </Panel>
    </div>
  );
}


