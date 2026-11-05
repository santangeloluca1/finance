"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Lightbulb } from "lucide-react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { BankDot, ChipRow, Chip, InfoRow, LargeTitle, Panel, SectionHeader } from "@/components/ui";
import { BigAmount } from "@/components/BigAmount";
import { isFundLike, TAX_RATE } from "@/lib/engine/tax";
import { usableLosses } from "@/lib/engine/portfolio";
import { fmtDate, fmtEur, fmtSignedEur } from "@/lib/format";

const BOLLO_RATE = 0.002;

export default function Fisco() {
  const { state, views, data } = usePortfolioView();
  const today = new Date().toISOString().slice(0, 10);
  const years = useMemo(() => {
    const ys = new Set([today.slice(0, 4), ...(state?.realized.map((r) => r.date.slice(0, 4)) ?? []), ...Object.keys(state?.incomeByYear ?? {})]);
    return [...ys].sort().reverse();
  }, [state, today]);
  const [year, setYear] = useState(years[0]);

  if (!state) return null;

  const yr = state.realized.filter((r) => r.date.startsWith(year));
  const plusDiversi = sum(yr.filter((r) => r.gain > 0 && r.kind === "redditi_diversi").map((r) => r.gain));
  const plusCapitale = sum(yr.filter((r) => r.gain > 0 && r.kind === "redditi_capitale").map((r) => r.gain));
  const minus = sum(yr.filter((r) => r.gain < 0).map((r) => r.gain));
  const taxes = sum(yr.map((r) => r.tax));
  const income = state.incomeByYear[year] ?? 0;
  const net = plusDiversi + plusCapitale + minus - taxes + income;

  const nextYearEnd = `${Number(today.slice(0, 4)) + 1}-12-31`;
  const backpack = data.accounts.map((acc) => ({ acc, lots: usableLosses(state.losses, acc.id, today) })).filter((b) => b.lots.length);
  const backpackTotal = sum(backpack.flatMap((b) => b.lots.map((l) => l.remaining)));

  const bollo = data.accounts
    .map((acc) => ({ acc, value: sum(views.filter((v) => v.position.account === acc.id).map((v) => v.value)) }))
    .filter((b) => b.value > 0);
  const terCost = sum(views.map((v) => (v.value * (v.instrument.ter ?? 0)) / 100));
  const bolloTotal = sum(bollo.map((b) => b.value * BOLLO_RATE));

  return (
    <div>
      <LargeTitle>Fisco</LargeTitle>
      <ChipRow>
        {years.map((y) => (
          <Chip key={y} active={y === year} onClick={() => setYear(y)}>
            {y}
          </Chip>
        ))}
      </ChipRow>

      <div className="px-4 pt-6">
        <p className="text-[15px] font-medium text-mut">Imposte trattenute nel {year}</p>
        <BigAmount value={taxes} className="mt-1.5" />
        <p className="mt-3 text-[15px] text-mut">
          Risultato netto dell&apos;anno <span className={`num font-semibold ${net >= 0 ? "text-up" : "text-dn"}`}>{fmtSignedEur(net)}</span>
        </p>
      </div>

      <Panel className="mt-6">
        {plusDiversi + plusCapitale + income > 0 && (
          <div className="mx-4 mb-1 mt-4 flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            <span className="bg-accent" style={{ width: `${(plusDiversi / (plusDiversi + plusCapitale + income)) * 100}%` }} />
            <span style={{ width: `${(plusCapitale / (plusDiversi + plusCapitale + income)) * 100}%`, background: "#22b8cf" }} />
            <span className="bg-up" style={{ width: `${(income / (plusDiversi + plusCapitale + income)) * 100}%` }} />
          </div>
        )}
        <InfoRow label={<Dot color="var(--accent)">Plus · redditi diversi</Dot>} hint="azioni, obbligazioni, ETC: compensano lo zainetto" value={fmtSignedEur(plusDiversi)} valueClass={plusDiversi > 0 ? "text-up" : ""} />
        <InfoRow label={<Dot color="#22b8cf">Plus · redditi di capitale</Dot>} hint="ETF: non compensabili" value={fmtSignedEur(plusCapitale)} valueClass={plusCapitale > 0 ? "text-up" : ""} />
        <InfoRow label={<Dot color="var(--up)">Cedole e dividendi</Dot>} hint="netti, già tassati" value={fmtSignedEur(income)} valueClass={income > 0 ? "text-up" : ""} />
        <InfoRow label={<Dot color="var(--faint)">Minusvalenze</Dot>} hint="finiscono nello zainetto" value={fmtSignedEur(minus)} valueClass={minus < 0 ? "text-dn" : "text-mut"} />
      </Panel>

      <SectionHeader right={<span className="num text-[17px] font-bold text-warn">{fmtEur(backpackTotal)}</span>}>Zainetto fiscale</SectionHeader>
      {backpack.length === 0 ? (
        <Panel>
          <p className="px-4 py-5 text-[15px] text-mut">Nessuna minusvalenza da recuperare.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {backpack.map(({ acc, lots }) => {
            const available = sum(lots.map((l) => l.remaining));
            const candidates = views.filter((v) => v.position.account === acc.id && !isFundLike(v.instrument) && v.unrealized > 0);
            const soon = lots.some((l) => l.expires <= nextYearEnd);
            return (
              <Panel key={acc.id}>
                <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
                  <p className="flex items-center gap-2 text-[15px] font-semibold">
                    <BankDot color={acc.color} size={9} /> {acc.name}
                  </p>
                  <p className="num text-[15px] font-semibold">{fmtEur(available)}</p>
                </div>
                <ul className="px-4 pb-3">
                  {lots.map((l, i) => {
                    const total = daysBetween(l.date, l.expires);
                    const left = daysBetween(today, l.expires);
                    const expiring = l.expires <= nextYearEnd;
                    return (
                      <li key={i} className="pt-2.5">
                        <div className="flex justify-between text-[13px]">
                          <span className="text-mut">
                            {data.instruments.find((x) => x.isin === l.sourceIsin)?.shortName ?? l.sourceIsin} · {fmtDate(l.date, { month: "short", year: "numeric" })}
                          </span>
                          <span className={expiring ? "font-semibold text-dn" : "text-mut"}>scade {fmtDate(l.expires, { month: "short", year: "numeric" })}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-chip">
                          <div className={`h-full rounded-full ${expiring ? "bg-dn" : "bg-warn"}`} style={{ width: `${Math.max(3, (left / total) * 100)}%` }} />
                        </div>
                        <div className="num mt-1.5 flex justify-between text-[11px] text-faint">
                          {Array.from({ length: Number(l.expires.slice(0, 4)) - Number(l.date.slice(0, 4)) + 1 }, (_, k) => (
                            <span key={k}>{Number(l.date.slice(0, 4)) + k}</span>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className={`flex gap-3 px-4 py-3.5 ${soon ? "bg-warn/10" : "bg-panel-2"}`}>
                  <span className={`mt-0.5 shrink-0 ${soon ? "text-warn" : "text-accent"}`}>{soon ? <AlertTriangle size={18} /> : <Lightbulb size={18} />}</span>
                  <div className="text-[14px] leading-snug">
                    {candidates.length ? (
                      <>
                        <p className="font-semibold">Puoi recuperare queste minus</p>
                        <p className="mt-0.5 text-mut">Vendendo e riacquistando titoli in plus su {acc.name}:</p>
                        <ul className="mt-2 space-y-1">
                          {candidates.map((c) => (
                            <li key={c.instrument.isin} className="flex justify-between">
                              <span>{c.instrument.shortName ?? c.instrument.name}</span>
                              <span className="num font-semibold text-up">risparmi {fmtEur(Math.min(c.unrealized, available) * TAX_RATE)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="text-mut">
                        <span className="font-semibold text-ink">Nessuna plus compensabile su {acc.name}.</span> Le plus degli ETF non valgono: servono azioni, obbligazioni, ETC o
                        certificati in guadagno su questo conto.
                      </p>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <SectionHeader right={<span className="num text-[17px] font-bold">{fmtEur(terCost + bolloTotal)}</span>}>Costi annui stimati</SectionHeader>
      <Panel>
        {bollo.map(({ acc, value }) => (
          <InfoRow
            key={acc.id}
            label={
              <span className="flex items-center gap-2">
                <BankDot color={acc.color} size={7} /> Bollo {acc.name}
              </span>
            }
            hint="0,2% del valore"
            value={fmtEur(value * BOLLO_RATE)}
          />
        ))}
        <InfoRow label="Costi di gestione degli ETF" hint="TER sul valore attuale" value={fmtEur(terCost)} />
      </Panel>

      <p className="px-8 pb-2 pt-6 text-center text-[12px] leading-relaxed text-faint">
        Stime con il metodo del costo medio ponderato, separate per intermediario. In regime amministrato fa fede il calcolo della banca. Non è consulenza fiscale.
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

function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
