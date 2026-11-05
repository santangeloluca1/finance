"use client";

import { useMemo, useState } from "react";
import { BankDot, Chip, ChipRow, Logo, Panel, SectionHeader } from "@/components/ui";
import { BigAmount } from "@/components/BigAmount";
import { dividendsForYear } from "@/lib/dividends";
import type { PortfolioData } from "@/lib/store";
import type { PortfolioState } from "@/lib/engine/types";
import { fmtDate, fmtEur } from "@/lib/format";

const MONTHS = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

export function Dividendi({ data, state }: { data: PortfolioData; state: PortfolioState }) {
  const thisYear = new Date().getFullYear().toString();
  const years = useMemo(() => {
    const ys = new Set([thisYear, ...data.transactions.filter((t) => t.type === "dividend").map((t) => t.date.slice(0, 4))]);
    return [...ys].sort().reverse();
  }, [data.transactions, thisYear]);
  const [year, setYear] = useState(thisYear);

  const events = useMemo(() => dividendsForYear(year, data.transactions, state, data.instruments), [year, data, state]);
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
      </ChipRow>

      <div className="px-4 pt-6">
        <p className="text-[15px] font-medium text-mut">{year === thisYear ? "Incassati quest'anno" : `Incassati nel ${year}`}</p>
        <BigAmount value={paid} className="mt-1" />
        {expected > 0 && (
          <p className="mt-1.5 text-[15px] text-mut">
            + <span className="num sensitive font-semibold text-ink">{fmtEur(expected)}</span> previsti entro dicembre
          </p>
        )}
      </div>

      <div className="mt-6 px-4">
        <div className="flex h-40 items-end gap-1.5">
          {byMonth.map((m, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end">
              {m.forecast > 0 && <div className="hatch rounded-t-[4px] text-accent" style={{ height: `${(m.forecast / max) * 100}%` }} />}
              {m.paid > 0 && <div className={`bg-accent ${m.forecast > 0 ? "" : "rounded-t-[4px]"}`} style={{ height: `${(m.paid / max) * 100}%` }} />}
              {m.paid + m.forecast === 0 && <div className="h-[3px] rounded-full bg-chip" />}
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
            <span className="hatch h-2.5 w-2.5 rounded-[3px] text-accent" /> Previsti
          </span>
        </div>
      </div>

      <SectionHeader>Pagamenti</SectionHeader>
      <Panel>
        {events.length === 0 && <p className="px-4 py-6 text-center text-[15px] text-mut">Nessuna cedola o dividendo nel {year}.</p>}
        {[...events].reverse().map((e, i) => {
          const ins = instruments.get(e.isin);
          const name = ins?.shortName ?? ins?.name ?? e.isin;
          return (
            <div key={i} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0">
              <Logo isin={e.isin} name={name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mut">
                  <BankDot color={accounts.get(e.account)?.color ?? "#888"} size={7} />
                  {fmtDate(e.date, { day: "numeric", month: "long" })}
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
