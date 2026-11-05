"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BankDot, Change, Logo } from "@/components/ui";
import { positionChange, type FxRates, type Period, type PositionView } from "@/lib/analytics";
import type { Account, Instrument } from "@/lib/engine/types";
import { fmtEur, fmtNum } from "@/lib/format";

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

export function PositionList({ rows, accounts, showBanks = true }: { rows: PositionRow[]; accounts: Account[]; showBanks?: boolean }) {
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key} className="border-b border-sep last:border-0">
          <Link href={`/posizioni/${r.instrument.isin}`} className="flex items-center gap-3 px-4 py-3 active:bg-panel-2">
            <Logo isin={r.instrument.isin} name={r.instrument.shortName ?? r.instrument.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{r.instrument.shortName ?? r.instrument.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mut">
                {showBanks && (
                  <span className="flex -space-x-0.5">
                    {r.accounts.map((a) => (
                      <BankDot key={a} color={byId.get(a)?.color ?? "#888"} size={7} />
                    ))}
                  </span>
                )}
                <span className="truncate">
                  {fmtNum(r.quantity)} quote{showBanks && r.accounts.length === 1 ? ` · ${byId.get(r.accounts[0])?.name}` : ""}
                </span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="num sensitive text-[16px] font-semibold tracking-[-0.01em]">{fmtEur(r.value)}</p>
              <Change pct={r.change.pct} size="sm" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "oggi", label: "Oggi" },
  { value: "1S", label: "1 settimana" },
  { value: "1M", label: "1 mese" },
  { value: "6M", label: "6 mesi" },
  { value: "1A", label: "1 anno" },
  { value: "totale", label: "Dall'acquisto" },
];
