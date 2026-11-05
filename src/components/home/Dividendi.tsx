"use client";

import { useMemo, useState } from "react";
import { BankDot, Chip, ChipRow, Logo, Panel, SectionHeader } from "@/components/ui";
import { BigAmount } from "@/components/BigAmount";
import { dividendsForYear } from "@/lib/dividends";
import type { PortfolioData } from "@/lib/store";
import type { PortfolioState } from "@/lib/engine/types";
import type { Totals } from "@/lib/analytics";
import { fmtDate, fmtEur } from "@/lib/format";

const MONTHS = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

export function Dividendi({ data, state, totals }: { data: PortfolioData; state: PortfolioState; totals: Totals }) {
  const thisYear = new Date().getFullYear().toString();
  const years = useMemo(() => {
    const ys = new Set([thisYear, ...data.transactions.filter((t) => t.type === "dividend").map((t) => t.date.slice(0, 4))]);
    return [...ys].sort().reverse();
  }, [data.transactions, thisYear]);
  const [year, setYear] = useState(thisYear);

  const events = useMemo(
    () => (year === "tutti" ? years.flatMap((y) => dividendsForYear(y, data.transactions, state, data.instruments)).sort((a, b) => a.date.localeCompare(b.date)) : dividendsForYear(year, data.transactions, state, data.instruments)),
    [year, years, data, state],
  );
  const paid = events.filter((e) => !e.forecast).reduce((a, e) => a + e.amount, 0);
  const expected = events.filter((e) => e.forecast).reduce((a, e) => a + e.amount, 0);
  const byMonth = MONTHS.map((_, m) => {
    const mm = String(m + 1).padStart(2, "0");
    const evs = events.filter((e) => e.date.slice(5, 7) === mm);
    return { paid: evs.filter((e) => !e.forecast).reduce((a, e) => a + e.amount, 0), forecast: evs.filter((e) => e.forecast).reduce((a, e) => a + e.amount, 0) };
  });
  const max = Math.max(1, ...byMonth.map((m) => m.paid + m.forecast));
  const currentMonth = year === thisYear ? new Date().getMonth() : -1;
  const instruments = new Map(data.instruments.map((i) => [i.isin, i]));
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));

  return (
    <div className="pt-4">
      <ChipRow>
        {years.map((y) => (
          <Chip key={y} active={y === year} onClick={() => setYear(y)}>
            {y}
          </Chip>
        ))}
        <Chip active={year === "tutti"} onClick={() => setYear("tutti")}>
          Tutti gli anni
        </Chip>
      </ChipRow>

      <div className="px-4 pt-6">
        <p className="text-[15px] font-medium text-mut">{year === "tutti" ? "Incassati in totale, netti" : year === thisYear ? "Incassati quest'anno, netti" : `Incassati nel ${year}, netti`}</p>
        <BigAmount value={paid} className="mt-1" />
        {expected > 0 && (
          <p className="mt-1.5 text-[15px] text-mut">
            + <span className="num sensitive font-semibold text-ink">{fmtEur(expected)}</span> previsti entro dicembre
          </p>
        )}
      </div>

      {year !== "tutti" && (
        <div className="mt-6 grid grid-cols-3 gap-2.5 px-4">
          <Stat label="Rendimento" value={pct((paid + expected) / (totals.value || 1))} />
          <Stat label="Sul costo" value={pct((paid + expected) / (totals.cost || 1))} />
          <Stat label="Al mese" value={fmtEur((paid + expected) / 12)} sensitive />
        </div>
      )}

      <div className="mt-8 px-4">
        <div className="flex h-[170px] items-end gap-1.5">
          {byMonth.map((m, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end">
              {m.forecast > 0 && (
                <div className="hatch-box rounded-[6px] border-[1.5px] border-dashed border-accent" style={{ height: `${(m.forecast / max) * 100}%` }} />
              )}
              {m.paid > 0 && <div className="mt-[2px] rounded-[6px] bg-accent" style={{ height: `${(m.paid / max) * 100}%` }} />}
              {m.paid + m.forecast === 0 && <div className="h-1 rounded-full bg-chip" />}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          {MONTHS.map((m, i) => (
            <span key={i} className={`flex-1 text-center text-[11px] font-semibold ${i === currentMonth ? "text-ink" : "text-faint"}`}>
              {m}
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[12px] text-mut">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" /> Pagati
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-dashed border-accent" /> Previsti
          </span>
        </div>
      </div>

      <SectionHeader>Calendario</SectionHeader>
      <Panel>
        {events.length === 0 && <p className="px-4 py-6 text-center text-[15px] text-mut">Nessuna cedola o dividendo nel {year}.</p>}
        {[...events].reverse().map((e, i) => {
          const ins = instruments.get(e.isin);
          const name = ins?.shortName ?? ins?.name ?? e.isin;
          return (
            <div key={i} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0">
              <div className="w-11 text-center">
                <p className={`text-[11px] font-semibold uppercase ${e.forecast ? "text-accent" : "text-mut"}`}>
                  {new Date(`${e.date}T12:00:00`).toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}
                </p>
                <p className="num text-[20px] font-semibold leading-tight tracking-[-0.02em]">{Number(e.date.slice(8, 10))}</p>
              </div>
              <Logo isin={e.isin} name={name} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mut">
                  <BankDot color={accounts.get(e.account)?.color ?? "#888"} size={7} />
                  {accounts.get(e.account)?.name}
                  {year === "tutti" ? ` · ${e.date.slice(0, 4)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className={`num sensitive text-[16px] font-semibold ${e.forecast ? "text-mut" : "text-up"}`}>+{fmtEur(e.amount)}</p>
                <p className="text-[12px] text-mut">{e.forecast ? "previsto" : "netto"}</p>
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function Stat({ label, value, sensitive }: { label: string; value: string; sensitive?: boolean }) {
  return (
    <div className="rounded-[18px] bg-panel px-3.5 py-3 shadow-panel">
      <p className="text-[12px] text-mut">{label}</p>
      <p className={`num mt-2 text-[18px] font-semibold ${sensitive ? "sensitive" : ""}`}>{value}</p>
    </div>
  );
}

function pct(n: number) {
  return n.toLocaleString("it-IT", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
