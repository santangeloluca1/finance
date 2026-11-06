"use client";

import { useMemo, useState } from "react";
import { BankDot, Chip, ChipRow, Logo, SectionHeader, DayCell } from "@/components/ui";
import { BigAmount } from "@/components/BigAmount";
import { dividendsForYear, trailingDividends } from "@/lib/dividends";
import type { PositionView } from "@/lib/analytics";
import type { PortfolioData } from "@/lib/store";
import type { PortfolioState } from "@/lib/engine/types";
import type { Totals } from "@/lib/analytics";
import { fmtDate, fmtEur, fmtN } from "@/lib/format";

const MONTHS = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

export function Dividendi({ data, state, totals, views = [] }: { data: PortfolioData; state: PortfolioState; totals: Totals; views?: PositionView[] }) {
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
  const perTitle = trailingDividends(data.transactions).map((d) => {
    const vs = views.filter((v) => v.instrument.isin === d.isin);
    const value = vs.reduce((a, v) => a + v.value, 0);
    const cost = vs.reduce((a, v) => a + v.position.totalCost, 0);
    return { ...d, value, yieldNow: value ? d.trailing / value : 0, yieldCost: cost ? d.trailing / cost : 0 };
  });
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
        <p className="num mt-2 px-4 text-[14px] text-mut">
          Rendimento {pct((paid + expected) / (totals.value - totals.cash || 1))}
          <span className="mx-1.5 text-faint">·</span>
          sul costo {pct((paid + expected) / (totals.cost || 1))}
          <span className="mx-1.5 text-faint">·</span>
          <span className="sensitive">{fmtEur((paid + expected) / 12)}</span> al mese
        </p>
      )}

      <div className="mt-8 px-4">
        <div className="flex h-[170px] items-end gap-1.5">
          {byMonth.map((m, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end">
              {m.forecast > 0 && (
                <div className="grow-y hatch-box rounded-[6px] border-[1.5px] border-dashed border-accent" style={{ height: `${(m.forecast / max) * 100}%` }} />
              )}
              {m.paid > 0 && <div className="grow-y mt-[2px] rounded-[6px] bg-accent" style={{ height: `${(m.paid / max) * 100}%` }} />}
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

      {perTitle.length > 0 && (
        <>
          <SectionHeader right={<span className="text-[13px] text-mut">ultimi 12 mesi</span>}>Per titolo</SectionHeader>
          <ul className="stagger">
            {perTitle.map((d) => {
              const ins = instruments.get(d.isin);
              const name = ins?.shortName ?? ins?.name ?? d.isin;
              return (
                <li key={d.isin} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
                  <Logo isin={d.isin} name={name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold">{name}</p>
                    <p className="num mt-0.5 truncate text-[14px] text-mut">
                      {d.payments} {d.payments === 1 ? "pagamento" : "pagamenti"}
                    </p>
                  </div>
                  {/* Importo e rendimento a destra, come le altre liste: niente testo tagliato. */}
                  <div className="shrink-0 text-right">
                    <p className="num sensitive text-[17px] font-medium text-up">+{fmtEur(d.trailing)}</p>
                    {d.value > 0 && <p className="num mt-0.5 text-[14px] text-mut">{pct(d.yieldNow)} annuo</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SectionHeader>Calendario</SectionHeader>
      <ul className="stagger">
        {events.length === 0 && <li className="px-4 py-6 text-center text-[15px] text-mut">Nessuna cedola o dividendo nel {year}.</li>}
        {[...events].reverse().map((e, i) => {
          const ins = instruments.get(e.isin);
          const name = ins?.shortName ?? ins?.name ?? e.isin;
          return (
            <li key={i} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
              <DayCell date={e.date} className={e.forecast ? "text-accent" : "text-mut"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-mut">
                  <BankDot color={accounts.get(e.account)?.color ?? "#888"} size={7} />
                  {accounts.get(e.account)?.name}
                  {year === "tutti" ? ` · ${e.date.slice(0, 4)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className={`num sensitive text-[17px] font-medium ${e.forecast ? "text-mut" : "text-up"}`}>+{fmtEur(e.amount)}</p>
                <p className="text-[14px] text-mut">{e.forecast ? "Previsto" : "Netto"}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}



function pct(n: number) {
  return fmtN(n, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
