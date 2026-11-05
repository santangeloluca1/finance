"use client";

import { useMemo, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { BankDot, Chip, ChipRow, InfoRow, Logo, Panel, SectionHeader } from "@/components/ui";
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
      <div className="pt-4">
        <ChipRow>
          {(
            [
              ["asset", "Asset"],
              ["paese", "Paese"],
              ["settore", "Settore"],
              ["banca", "Banca"],
              ["valuta", "Valuta"],
              ["titolo", "Titolo"],
            ] as [By, string][]
          ).map(([k, label]) => (
            <Chip key={k} active={by === k} onClick={() => setBy(k)}>
              {label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className="pt-9">
        <Gauge slices={slices} size={300}>
          <p className="text-[13px] text-mut">Valore del portafoglio</p>
          <p className="num sensitive text-[30px] font-semibold tracking-[-0.04em]">{fmtEur(totals.value)}</p>
        </Gauge>
      </div>

      <Panel className="mt-6">
        {slices.map((s) => {
          const share = s.value / (totals.value || 1);
          return (
            <div key={s.key} className="border-b border-sep px-4 py-3 last:border-0">
              <div className="flex items-center gap-2.5">
                <BankDot color={s.color} size={10} />
                <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{s.label}</p>
                <p className="num text-[15px] font-semibold">{fmtPct(share)}</p>
              </div>
              <div className="mt-2 flex items-center gap-3 pl-[22px]">
                <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-chip">
                  <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: s.color }} />
                </div>
                <p className="num sensitive w-24 text-right text-[13px] text-mut">{fmtEur(s.value)}</p>
              </div>
            </div>
          );
        })}
      </Panel>

      {(by === "paese" || by === "settore") && (
        <p className="px-5 pt-2 text-[12px] leading-snug text-faint">
          {xrayLoading ? "Lettura della composizione degli ETF…" : "Esposizione reale dentro gli ETF, dai principali paesi e settori pubblicati da justETF; il resto è in \"Altri\"."}
        </p>
      )}

      {companies.length > 0 && (
        <>
          <SectionHeader>Prime aziende</SectionHeader>
          <Panel>
            {companies.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0">
                <span className="num w-5 shrink-0 text-center text-[13px] font-semibold text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{c.name}</p>
                  <p className="truncate text-[12px] text-mut">{c.via.map((v) => (v === "diretta" ? "azione diretta" : v)).join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-[15px] font-semibold">{fmtPct(c.value / (totals.value || 1))}</p>
                  <p className="num sensitive text-[12px] text-mut">{fmtEur0(c.value)}</p>
                </div>
              </div>
            ))}
          </Panel>
          <p className="px-5 pt-2 text-[12px] leading-snug text-faint">
            Somma delle prime 10 partecipazioni di ogni ETF più le azioni che possiedi direttamente. Un&apos;azione presente in più ETF compare una volta sola.
          </p>
        </>
      )}

      <SectionHeader>Rendimento per banca</SectionHeader>
      <Panel>
        {banks.map(({ a, value, pct }) => (
          <div key={a.id} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0">
            <span
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[15px] font-bold"
              style={{ background: `color-mix(in srgb, ${a.color} 16%, transparent)`, color: a.color }}
            >
              {a.name[0]}
            </span>
            <div className="flex-1">
              <p className="text-[15px] font-semibold">{a.name}</p>
              <p className="num sensitive text-[13px] text-mut">{fmtEur(value)}</p>
            </div>
            <p className={`num text-[16px] font-semibold ${pct >= 0 ? "text-up" : "text-dn"}`}>{fmtSignedPct(pct)}</p>
          </div>
        ))}
      </Panel>

      <SectionHeader>Costi annui</SectionHeader>
      <Panel>
        <InfoRow label="TER medio ponderato" value={`${((ter / (totals.value || 1)) * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`} />
        <InfoRow label="Costi di gestione degli ETF" value={<span className="sensitive">{fmtEur0(ter)}</span>} />
        <InfoRow label="Imposta di bollo" hint="0,2% del valore" value={<span className="sensitive">{fmtEur0(totals.value * 0.002)}</span>} />
      </Panel>
    </div>
  );
}


