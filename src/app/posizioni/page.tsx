"use client";

import { Search } from "lucide-react";

import { useMemo, useState } from "react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { buildRows, PERIOD_OPTIONS, PositionList, type SortKey } from "@/components/PositionList";
import { BankDot, LargeTitle, SelectButton, IconButton } from "@/components/ui";
import type { Period } from "@/lib/analytics";
import { fmtEur } from "@/lib/format";

type View = "titolo" | "banca";

export default function Posizioni() {
  const { views, data, priceSeries, fx, totals } = usePortfolioView();
  const [view, setView] = useState<View>("titolo");
  const [period, setPeriod] = useState<Period>("totale");
  const [sort, setSort] = useState<SortKey>("valore");

  const groups = useMemo(() => {
    if (view === "titolo") return [{ id: "all", account: null, rows: buildRows(views, period, priceSeries, fx, true, sort, data.transactions) }];
    return data.accounts
      .map((account) => ({
        id: account.id,
        account,
        rows: buildRows(
          views.filter((v) => v.position.account === account.id),
          period,
          priceSeries,
          fx,
          false,
          sort,
          data.transactions,
        ),
      }))
      .filter((g) => g.rows.length);
  }, [view, views, period, priceSeries, fx, sort, data.accounts]);

  return (
    <div>
      <LargeTitle
        right={
          <IconButton href="/cerca" label="Cerca un titolo">
            <Search size={18} strokeWidth={2.2} />
          </IconButton>
        }
      >
        Titoli
      </LargeTitle>
      <div className="flex items-center gap-5 px-4">
        <SelectButton
          label="Raggruppa"
          value={view}
          onChange={setView}
          options={[
            { value: "titolo", label: "Per titolo" },
            { value: "banca", label: "Per banca" },
          ]}
        />
        <SelectButton label="Periodo della variazione" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        <span className="ml-auto">
          <SelectButton
            label="Ordina per"
            value={sort}
            onChange={setSort}
            options={[
              { value: "valore", label: "Valore" },
              { value: "variazione", label: "Variazione" },
              { value: "nome", label: "Nome" },
            ]}
          />
        </span>
      </div>

      {groups.map((g) => {
        const value = g.rows.reduce((a, r) => a + r.value, 0);
        return (
          <section key={g.id} className={g.account ? "mt-8" : "mt-3"}>
            {g.account && (
              <div className="flex items-baseline justify-between px-4 pb-1">
                <h2 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.025em]">
                  <BankDot color={g.account.color} size={9} />
                  {g.account.name}
                </h2>
                <p className="num sensitive text-[15px] text-mut">
                  {fmtEur(value)} · {Math.round((value / (totals?.value || 1)) * 100)}%
                </p>
              </div>
            )}
            <PositionList rows={g.rows} accounts={data.accounts} showBanks={view === "titolo"} />
          </section>
        );
      })}
    </div>
  );
}
