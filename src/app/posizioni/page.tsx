"use client";

import { useMemo, useState } from "react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { buildRows, PERIOD_OPTIONS, PositionList, type SortKey } from "@/components/PositionList";
import { BankDot, LargeTitle, Panel, Segmented, SelectButton } from "@/components/ui";
import type { Period } from "@/lib/analytics";
import { fmtEur } from "@/lib/format";

type View = "titolo" | "banca";

export default function Posizioni() {
  const { views, data, priceSeries, fx, totals } = usePortfolioView();
  const [view, setView] = useState<View>("titolo");
  const [period, setPeriod] = useState<Period>("totale");
  const [sort, setSort] = useState<SortKey>("valore");

  const groups = useMemo(() => {
    if (view === "titolo") return [{ id: "all", account: null, rows: buildRows(views, period, priceSeries, fx, true, sort) }];
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
        ),
      }))
      .filter((g) => g.rows.length);
  }, [view, views, period, priceSeries, fx, sort, data.accounts]);

  return (
    <div>
      <LargeTitle>Titoli</LargeTitle>
      <div className="px-4">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "titolo", label: "Per titolo" },
            { value: "banca", label: "Per banca" },
          ]}
        />
        <div className="mt-3 flex items-center justify-between">
          <SelectButton label="Periodo della variazione" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
          <SelectButton
            label="Ordina per"
            value={sort}
            onChange={setSort}
            options={[
              { value: "valore", label: "Per valore" },
              { value: "variazione", label: "Per variazione" },
              { value: "nome", label: "Per nome" },
            ]}
          />
        </div>
      </div>

      {groups.map((g) => {
        const value = g.rows.reduce((a, r) => a + r.value, 0);
        return (
          <section key={g.id} className="mt-5">
            {g.account && (
              <div className="flex items-baseline justify-between px-4 pb-2">
                <h2 className="flex items-center gap-2 text-[20px] font-bold tracking-[-0.02em]">
                  <BankDot color={g.account.color} size={10} />
                  {g.account.name}
                </h2>
                <p className="num text-[15px] text-mut">
                  {fmtEur(value)} · {Math.round((value / (totals?.value || 1)) * 100)}%
                </p>
              </div>
            )}
            <Panel>
              <PositionList rows={g.rows} accounts={data.accounts} showBanks={view === "titolo"} />
            </Panel>
          </section>
        );
      })}
    </div>
  );
}
