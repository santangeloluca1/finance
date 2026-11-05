"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { AccountDot, Card, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { isFundLike, TAX_RATE } from "@/lib/engine/tax";
import { usableLosses } from "@/lib/engine/portfolio";
import { fmtDate, fmtEur, fmtSignedEur, tone } from "@/lib/format";

const BOLLO_RATE = 0.002;

export default function Fisco() {
  const { state, views, data } = usePortfolioCtx();
  const today = new Date().toISOString().slice(0, 10);
  const years = useMemo(() => {
    const ys = new Set([today.slice(0, 4), ...(state?.realized.map((r) => r.date.slice(0, 4)) ?? []), ...Object.keys(state?.incomeByYear ?? {})]);
    return [...ys].sort().reverse();
  }, [state, today]);
  const [year, setYear] = useState(years[0]);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);

  if (!state) return null;

  const yr = state.realized.filter((r) => r.date.startsWith(year));
  const plusDiversi = sum(yr.filter((r) => r.gain > 0 && r.kind === "redditi_diversi").map((r) => r.gain));
  const plusCapitale = sum(yr.filter((r) => r.gain > 0 && r.kind === "redditi_capitale").map((r) => r.gain));
  const minus = sum(yr.filter((r) => r.gain < 0).map((r) => r.gain));
  const taxes = sum(yr.map((r) => r.tax));
  const income = state.incomeByYear[year] ?? 0;

  const backpack = data.accounts
    .map((acc) => ({ acc, lots: usableLosses(state.losses, acc.id, today) }))
    .filter((b) => b.lots.length);

  const nextYearEnd = `${Number(today.slice(0, 4)) + 1}-12-31`;

  const opportunities = backpack.flatMap(({ acc, lots }) => {
    const available = sum(lots.map((l) => l.remaining));
    const candidates = views.filter((v) => v.position.account === acc.id && !isFundLike(v.instrument) && v.unrealized > 0);
    return [{ acc, available, candidates, expiringSoon: lots.some((l) => l.expires <= nextYearEnd) }];
  });

  const bollo = data.accounts
    .map((acc) => ({ acc, value: sum(views.filter((v) => v.position.account === acc.id).map((v) => v.value)) }))
    .filter((b) => b.value > 0);
  const terCost = sum(views.map((v) => (v.value * (v.instrument.ter ?? 0)) / 100));

  return (
    <div className="space-y-4">
      <PageHeader title="Fisco" subtitle="Regime amministrato" />

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${y === year ? "bg-text text-bg" : "bg-surface-2 text-muted"}`}
          >
            {y}
          </button>
        ))}
      </div>

      <Card>
        <SectionTitle>Riepilogo {year}</SectionTitle>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Stat label="Plus redditi diversi" value={fmtSignedEur(plusDiversi)} valueClass={tone(plusDiversi)} hint="azioni, obbligazioni, ETC" />
          <Stat label="Plus redditi di capitale" value={fmtSignedEur(plusCapitale)} valueClass={tone(plusCapitale)} hint="ETF, non compensabili" />
          <Stat label="Minusvalenze" value={fmtSignedEur(minus)} valueClass={tone(minus)} hint="finite nello zainetto" />
          <Stat label="Imposte stimate" value={fmtEur(taxes)} hint="trattenute dalle banche" />
          <Stat label="Cedole e dividendi" value={fmtEur(income)} valueClass="text-gain" hint="netti" />
        </div>
      </Card>

      <Card>
        <SectionTitle>Zainetto fiscale</SectionTitle>
        {backpack.length === 0 ? (
          <p className="text-[13px] text-muted">Nessuna minusvalenza da recuperare.</p>
        ) : (
          <div className="space-y-4">
            {backpack.map(({ acc, lots }) => (
              <div key={acc.id}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <AccountDot color={acc.color} /> {acc.name}
                  </span>
                  <span className="num text-[14px] font-semibold text-warn">{fmtEur(sum(lots.map((l) => l.remaining)))}</span>
                </div>
                <ul className="space-y-2">
                  {lots.map((l, i) => {
                    const total = daysBetween(l.date, l.expires);
                    const left = daysBetween(today, l.expires);
                    const soon = l.expires <= nextYearEnd;
                    return (
                      <li key={i} className="rounded-xl bg-surface-2 p-3">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-muted">
                            {fmtDate(l.date, { month: "short", year: "numeric" })} · {data.instruments.find((x) => x.isin === l.sourceIsin)?.shortName ?? l.sourceIsin}
                          </span>
                          <span className="num font-semibold">{fmtEur(l.remaining)}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div className={`h-full rounded-full ${soon ? "bg-loss" : "bg-warn"}`} style={{ width: `${Math.max(3, (left / total) * 100)}%` }} />
                        </div>
                        <p className={`mt-1.5 text-[11px] ${soon ? "text-loss" : "text-faint"}`}>
                          Scade il {fmtDate(l.expires)} · {Math.round(left / 30)} mesi rimasti
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {opportunities.map(({ acc, available, candidates, expiringSoon }) => (
        <Card key={acc.id} className={expiringSoon ? "border-warn/30" : ""}>
          <div className="flex gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${expiringSoon ? "bg-warn/15 text-warn" : "bg-accent/15 text-accent"}`}>
              {expiringSoon ? <AlertTriangle size={18} /> : <Lightbulb size={18} />}
            </div>
            <div className="min-w-0 text-[13px] leading-relaxed">
              <p className="text-[14px] font-semibold">Recupera le minus su {acc.name}</p>
              {candidates.length ? (
                <>
                  <p className="mt-1 text-muted">
                    Vendendo e riacquistando questi titoli in plus realizzi guadagni compensabili con {fmtEur(available)} di minus:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {candidates.map((c) => {
                      const usable = Math.min(c.unrealized, available);
                      return (
                        <li key={c.instrument.isin} className="flex justify-between">
                          <span>{c.instrument.shortName ?? c.instrument.name}</span>
                          <span className="num font-semibold text-gain">risparmi {fmtEur(usable * TAX_RATE)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-muted">
                  Hai {fmtEur(available)} di minus, ma su questo conto non ci sono plus compensabili. Le plus degli ETF non valgono: servono
                  azioni, obbligazioni, ETC o certificati in guadagno su {acc.name}.
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}

      <Card>
        <SectionTitle>Costi annui stimati</SectionTitle>
        <ul className="space-y-2 text-[13px]">
          {bollo.map(({ acc, value }) => (
            <li key={acc.id} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted">
                <AccountDot color={acc.color} /> Bollo {acc.name} (0,2%)
              </span>
              <span className="num font-semibold">{fmtEur(value * BOLLO_RATE)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between">
            <span className="text-muted">Costi di gestione ETF (TER)</span>
            <span className="num font-semibold">{fmtEur(terCost)}</span>
          </li>
          <li className="flex items-center justify-between border-t border-line pt-2 text-[14px] font-semibold">
            <span>Totale</span>
            <span className="num">{fmtEur(terCost + sum(bollo.map((b) => b.value * BOLLO_RATE)))}</span>
          </li>
        </ul>
      </Card>

      <p className="px-2 pb-2 text-center text-[11px] leading-relaxed text-faint">
        Stime calcolate con il metodo del costo medio ponderato, separatamente per ogni intermediario. Fa fede il calcolo della banca.
        Non è consulenza fiscale.
      </p>
    </div>
  );
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

function daysBetween(a: string, b: string) {
  return Math.max(1, (Date.parse(b) - Date.parse(a)) / 86400_000);
}
