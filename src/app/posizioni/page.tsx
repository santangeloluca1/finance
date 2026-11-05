"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { AccountDot, Card, InstrumentBadge, PageHeader, Segmented } from "@/components/ui";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, type PositionView } from "@/lib/analytics";
import { fmtEur, fmtNum, fmtSignedEur, fmtSignedPct, tone } from "@/lib/format";

type View = "strumento" | "broker";
type Sort = "valore" | "rendimento" | "oggi";

interface Row {
  key: string;
  isin: string;
  title: string;
  subtitle: string;
  color: string;
  value: number;
  cost: number;
  dayChange: number;
  dayChangePct: number;
  accounts: string[];
}

export default function Posizioni() {
  const { views, data, totals } = usePortfolioCtx();
  const [view, setView] = useState<View>("strumento");
  const [sort, setSort] = useState<Sort>("valore");
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);

  const groups = useMemo(() => {
    const rows = aggregate(views);
    const sorter = (a: Row, b: Row) =>
      sort === "valore" ? b.value - a.value : sort === "oggi" ? b.dayChangePct - a.dayChangePct : (b.value - b.cost) / b.cost - (a.value - a.cost) / a.cost;
    if (view === "strumento") return [{ id: "all", title: null as string | null, color: "", rows: rows.sort(sorter) }];
    return data.accounts
      .map((acc) => ({
        id: acc.id,
        title: acc.name,
        color: acc.color,
        rows: aggregate(views.filter((v) => v.position.account === acc.id)).sort(sorter),
      }))
      .filter((g) => g.rows.length);
  }, [views, view, sort, data.accounts]);

  return (
    <div className="space-y-4">
      <PageHeader title="Posizioni" subtitle={`${views.length} posizioni aperte`} />
      <div className="grid grid-cols-2 gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: "strumento", label: "Strumento" }, { value: "broker", label: "Broker" }]} />
        <Segmented value={sort} onChange={setSort} options={[{ value: "valore", label: "Valore" }, { value: "rendimento", label: "Rend." }, { value: "oggi", label: "Oggi" }]} />
      </div>

      {groups.map((g) => {
        const gValue = g.rows.reduce((a, r) => a + r.value, 0);
        const gCost = g.rows.reduce((a, r) => a + r.cost, 0);
        return (
          <Card key={g.id} className="px-3 py-2">
            {g.title && (
              <div className="flex items-center justify-between px-1 pb-1 pt-2">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  <AccountDot color={g.color} /> {g.title}
                </span>
                <span className="num text-[13px] text-muted">
                  {fmtEur(gValue)} <span className={tone(gValue - gCost)}>{fmtSignedPct((gValue - gCost) / (gCost || 1))}</span>
                </span>
              </div>
            )}
            <ul className="divide-y divide-line">
              {g.rows.map((r) => {
                const gain = r.value - r.cost;
                const weight = r.value / (totals?.value || 1);
                return (
                  <li key={r.key}>
                    <Link href={`/posizioni/${r.isin}`} className="flex items-center gap-3 px-1 py-3 active:opacity-70">
                      <InstrumentBadge label={r.title} color={r.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold">{r.title}</p>
                        <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                          {view === "strumento" && r.accounts.map((a) => <AccountDot key={a} color={accounts.get(a)?.color ?? "#888"} />)}
                          {r.subtitle}
                        </p>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(2, weight * 100)}%`, background: r.color }} />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num text-[14px] font-semibold">{fmtEur(r.value)}</p>
                        <p className={`num text-[12px] font-semibold ${tone(gain)}`}>
                          {sort === "oggi" ? fmtSignedPct(r.dayChangePct) : `${fmtSignedEur(gain)}`}
                        </p>
                        <p className={`num text-[11px] ${tone(gain)}`}>{sort === "oggi" ? fmtSignedEur(r.dayChange) : fmtSignedPct(gain / (r.cost || 1))}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function aggregate(views: PositionView[]): Row[] {
  const map = new Map<string, Row & { qty: number }>();
  for (const v of views) {
    const r =
      map.get(v.instrument.isin) ??
      {
        key: v.instrument.isin,
        isin: v.instrument.isin,
        title: v.instrument.shortName ?? v.instrument.name,
        subtitle: "",
        color: ASSET_CLASS_COLOR[v.instrument.assetClass],
        value: 0,
        cost: 0,
        dayChange: 0,
        dayChangePct: v.dayChangePct,
        accounts: [],
        qty: 0,
      };
    r.value += v.value;
    r.cost += v.position.totalCost;
    r.dayChange += v.dayChange;
    r.qty += v.position.quantity;
    r.accounts.push(v.position.account);
    r.subtitle = `${fmtNum(r.qty)} quote · ${ASSET_CLASS_LABEL[v.instrument.assetClass]}`;
    map.set(v.instrument.isin, r);
  }
  return [...map.values()];
}
