"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Bell, Eye, EyeOff, Search, Settings } from "lucide-react";
import { usePortfolioView, type Filter } from "@/components/PortfolioProvider";
import { Analisi } from "@/components/home/Analisi";
import { Prestazioni } from "@/components/home/Prestazioni";
import { Salute } from "@/components/home/Salute";
import { BankDot, Segmented, SelectButton } from "@/components/ui";
import { ASSET_CLASS_LABEL } from "@/lib/analytics";
import type { AssetClass } from "@/lib/engine/types";
import { usePrivacy } from "@/lib/privacy";
import { computeAlerts, unseenAlerts } from "@/lib/alerts";

/** Riga sotto il titolo: filtri per banca e asset class, privacy, avvisi e impostazioni. */
export function Toolbar({ filter, setFilter, view, showFilters = true, left }: { filter: Filter; setFilter: (f: Filter) => void; view: View; showFilters?: boolean; left?: ReactNode }) {
  const [privacy, togglePrivacy] = usePrivacy();
  return (
    <div className="mt-1 flex min-h-[44px] items-center pr-2">
      {showFilters && <Filters filter={filter} setFilter={setFilter} view={view} />}
      {left && <div className="pl-4">{left}</div>}
      <div className="ml-auto flex shrink-0">
        <Link href="/cerca" aria-label="Cerca un titolo" className="flex h-11 w-9 items-center justify-center text-mut active:opacity-50">
          <Search size={20} strokeWidth={1.8} />
        </Link>
        <button onClick={togglePrivacy} aria-label={privacy ? "Mostra importi" : "Nascondi importi"} aria-pressed={privacy} className="flex h-11 w-9 items-center justify-center text-mut active:opacity-50">
          {privacy ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
        </button>
        <AlertsBell view={view} />
        <Link href="/impostazioni" aria-label="Impostazioni" className="flex h-11 w-9 items-center justify-center text-mut active:opacity-50">
          <Settings size={20} strokeWidth={1.8} />
        </Link>
      </div>
    </div>
  );
}

export type View = ReturnType<typeof usePortfolioView>;

function AlertsBell({ view }: { view: View }) {
  const count = useMemo(
    () => (view.state && view.totals ? unseenAlerts(computeAlerts(view.data, view.state, view.views, view.totals, view.quotes), view.data).length : 0),
    [view.data, view.state, view.views, view.totals, view.quotes],
  );
  return (
    <Link href="/avvisi" aria-label={count ? `Avvisi, ${count} nuovi` : "Avvisi"} className="relative flex h-11 w-10 items-center justify-center text-mut active:opacity-50">
      <Bell size={20} strokeWidth={1.8} />
      {count > 0 && (
        <span className="num absolute right-0 top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-bg bg-dn px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

export function AnalisiTab({ view, filter }: { view: View; filter: Filter }) {
  const [sub, setSub] = useState<"prestazioni" | "allocazione" | "salute">("prestazioni");
  const txs = useMemo(() => {
    const assetOf = new Map(view.data.instruments.map((i) => [i.isin, i.assetClass]));
    return view.data.transactions.filter(
      (t) =>
        (filter.account === "all" || t.account === filter.account || t.toAccount === filter.account) &&
        (filter.asset === "all" || (filter.asset === "liquidita" ? ["cash", "deposit", "withdrawal", "transfer"].includes(t.type) : assetOf.get(t.isin) === filter.asset)),
    );
  }, [view.data, filter]);
  if (!view.totals || !view.state) return null;
  return (
    <div>
      <div className="px-4 pt-5">
        <Segmented
          value={sub}
          onChange={setSub}
          options={[
            { value: "prestazioni", label: "Prestazioni" },
            { value: "allocazione", label: "Allocazione" },
            { value: "salute", label: "Salute" },
          ]}
        />
      </div>
      {sub === "prestazioni" ? (
        <Prestazioni
          history={view.history}
          state={view.state}
          totals={view.totals}
          transactions={txs}
          views={view.views}
          priceSeries={view.priceSeries}
          fxSeries={view.fxSeries}
          fx={view.fx}
          accounts={view.data.accounts}
          instruments={view.data.instruments}
        />
      ) : sub === "allocazione" ? (
        <Analisi views={view.views} totals={view.totals} accounts={view.data.accounts} />
      ) : (
        <Salute views={view.views} totals={view.totals} state={view.state} accounts={view.data.accounts} />
      )}
    </div>
  );
}

export function Filters({ filter, setFilter, view }: { filter: Filter; setFilter: (f: Filter) => void; view: View }) {
  const presentAssets = useMemo(() => {
    const set = new Set(view.data.instruments.map((i) => i.assetClass));
    return (Object.keys(ASSET_CLASS_LABEL) as AssetClass[]).filter((a) => set.has(a));
  }, [view.data.instruments]);
  const hasCash = view.data.transactions.some((t) => ["cash", "deposit", "withdrawal", "transfer"].includes(t.type));
  const bank = view.data.accounts.find((a) => a.id === filter.account);
  return (
    <div className="flex min-w-0 items-center gap-4 pl-4">
      <span className="flex items-center gap-1.5">
        {bank && <BankDot color={bank.color} />}
        <SelectButton
          label="Conto"
          display={filter.account === "all" ? "Conti" : undefined}
          value={filter.account}
          onChange={(account) => setFilter({ ...filter, account })}
          options={[{ value: "all", label: "Tutti i conti" }, ...view.data.accounts.map((a) => ({ value: a.id, label: a.name }))]}
        />
      </span>
      <SelectButton
        label="Asset class"
        display={filter.asset === "all" ? "Asset" : undefined}
        value={filter.asset}
        onChange={(asset) => setFilter({ ...filter, asset })}
        options={[
          { value: "all" as const, label: "Tutti gli asset" },
          ...presentAssets.map((a) => ({ value: a as Filter["asset"], label: ASSET_CLASS_LABEL[a] })),
          ...(hasCash ? [{ value: "liquidita" as const, label: "Liquidità" }] : []),
        ]}
      />
    </div>
  );
}

