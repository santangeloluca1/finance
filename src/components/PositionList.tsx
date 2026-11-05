"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { BankDot, Change, Logo } from "@/components/ui";
import { positionChange, type FxRates, type Period, type PositionView } from "@/lib/analytics";
import type { Account, Instrument } from "@/lib/engine/types";
import { fmtDate, fmtEur, fmtNum } from "@/lib/format";

export interface PositionRow {
  key: string;
  instrument: Instrument;
  accounts: string[];
  quantity: number;
  value: number;
  cost: number;
  change: { abs: number; pct: number };
}

export type SortKey = "valore" | "variazione" | "nome";

/** Righe per strumento (somma dei conti) o per singolo conto. */
export function buildRows(
  views: PositionView[],
  period: Period,
  series: Record<string, [string, number][]>,
  fx: FxRates,
  groupByInstrument: boolean,
  sort: SortKey = "valore",
): PositionRow[] {
  const map = new Map<string, PositionRow>();
  for (const v of views) {
    const key = groupByInstrument ? v.instrument.isin : `${v.position.account}|${v.instrument.isin}`;
    const ch = positionChange(v, period, series, fx);
    const r = map.get(key) ?? {
      key,
      instrument: v.instrument,
      accounts: [],
      quantity: 0,
      value: 0,
      cost: 0,
      change: { abs: 0, pct: 0 },
    };
    r.accounts.push(v.position.account);
    r.quantity += v.position.quantity;
    r.value += v.value;
    r.cost += v.position.totalCost;
    r.change.abs += ch.abs;
    map.set(key, r);
  }
  const rows = [...map.values()].map((r) => {
    const base = r.value - r.change.abs;
    return { ...r, change: { abs: r.change.abs, pct: base > 0 ? r.change.abs / base : 0 } };
  });
  return rows.sort((a, b) =>
    sort === "valore" ? b.value - a.value : sort === "variazione" ? b.change.pct - a.change.pct : (a.instrument.shortName ?? a.instrument.name).localeCompare(b.instrument.shortName ?? b.instrument.name),
  );
}

export function PositionList({
  rows,
  accounts,
  showBanks = true,
  cash,
}: {
  rows: PositionRow[];
  accounts: Account[];
  showBanks?: boolean;
  /** Saldi di liquidità da mostrare in fondo all'elenco. */
  cash?: Record<string, { date: string; amount: number }>;
}) {
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const cashRows = Object.entries(cash ?? {}).filter(([, c]) => c.amount !== 0);
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={`/posizioni/${r.instrument.isin}`} className="flex min-h-[68px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
            <Logo isin={r.instrument.isin} name={r.instrument.shortName ?? r.instrument.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{r.instrument.shortName ?? r.instrument.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-mut">
                {showBanks &&
                  r.accounts.map((a) => <BankDot key={a} color={byId.get(a)?.color ?? "#888"} size={7} />)}
                <span className="num truncate">
                  {symbol(r.instrument.ticker)} · {fmtNum(r.quantity)}
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="num sensitive text-[17px] font-medium tracking-[-0.01em]">{fmtEur(r.value)}</p>
              <Change pct={r.change.pct} size="sm" arrow />
            </div>
          </Link>
        </li>
      ))}
      {cashRows.map(([account, c]) => (
        <li key={`cash-${account}`}>
          <Link href={`/movimenti/nuovo?tipo=deposit&conto=${account}`} className="flex min-h-[68px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
            <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-chip text-ink-2">
              <Wallet size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">Liquidità</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-mut">
                <BankDot color={byId.get(account)?.color ?? "#888"} size={7} />
                <span className="truncate">
                  {byId.get(account)?.name} · {fmtDate(c.date, { day: "numeric", month: "short" })}
                </span>
              </p>
            </div>
            <p className="num sensitive shrink-0 text-[17px] font-medium tracking-[-0.01em]">{fmtEur(c.amount)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "SPPW.DE" → "SPPW": il simbolo senza la borsa. */
function symbol(ticker: string) {
  return ticker.split(".")[0];
}

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "oggi", label: "Oggi" },
  { value: "1S", label: "1 settimana" },
  { value: "1M", label: "1 mese" },
  { value: "6M", label: "6 mesi" },
  { value: "1A", label: "1 anno" },
  { value: "totale", label: "Dall'acquisto" },
];
