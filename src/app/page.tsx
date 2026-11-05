"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { AreaChart, type ChartPoint } from "@/components/AreaChart";
import { Donut } from "@/components/Donut";
import { AccountDot, Card, InstrumentBadge, Pill, SectionTitle, Segmented, Stat } from "@/components/ui";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, groupBy } from "@/lib/analytics";
import { fmtDate, fmtEur, fmtEur0, fmtPct, fmtSignedEur, fmtSignedPct, fmtTime, tone } from "@/lib/format";

type Range = "1M" | "3M" | "6M" | "1A" | "MAX";
const RANGE_DAYS: Record<Range, number> = { "1M": 31, "3M": 92, "6M": 183, "1A": 366, MAX: 99999 };

export default function Home() {
  const { data, totals, views, history, fetchedAt, loading, refresh } = usePortfolioCtx();
  const [range, setRange] = useState<Range>("1A");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [allocBy, setAllocBy] = useState<"classe" | "broker">("classe");

  const points = useMemo<ChartPoint[]>(() => {
    if (!history?.length) return [];
    const cutoff = new Date(Date.now() - RANGE_DAYS[range] * 86400_000).toISOString().slice(0, 10);
    const pts = history.filter((h) => h.date >= cutoff).map((h) => ({ date: h.date, value: h.value, base: h.invested }));
    // Ultimo punto = valore live
    if (totals && pts.length) pts.push({ date: new Date().toISOString().slice(0, 10), value: totals.value, base: totals.cost });
    return pts;
  }, [history, range, totals]);

  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const slices = useMemo(
    () =>
      allocBy === "classe"
        ? groupBy(views, (v) => ({ key: v.instrument.assetClass, label: ASSET_CLASS_LABEL[v.instrument.assetClass], color: ASSET_CLASS_COLOR[v.instrument.assetClass] }))
        : groupBy(views, (v) => {
            const a = accounts.get(v.position.account);
            return { key: v.position.account, label: a?.name ?? v.position.account, color: a?.color ?? "#888" };
          }),
    [views, allocBy, accounts],
  );

  const movers = useMemo(() => [...views].sort((a, b) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct)).slice(0, 4), [views]);

  if (!totals) return <EmptyState />;

  const periodStart = points[0];
  const shown = scrub ?? points[points.length - 1];
  const periodChange = periodStart && shown ? shown.value - periodStart.value - ((shown.base ?? 0) - (periodStart.base ?? 0)) : 0;
  const totalValue = scrub ? scrub.value : totals.value;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-[13px] font-medium text-muted">{greeting()}</p>
          <h1 className="font-display text-[28px] font-bold tracking-tight">Patrimonio</h1>
        </div>
        <button
          onClick={refresh}
          aria-label="Aggiorna quotazioni"
          className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-muted active:scale-95"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {fetchedAt ? fmtTime(fetchedAt) : "—"}
        </button>
      </header>

      {data.isDemo && (
        <Link href="/movimenti" className="fade-up flex items-center justify-between rounded-2xl border border-accent/25 bg-accent/10 px-4 py-3 text-[13px]">
          <span>
            <b className="font-semibold">Portafoglio di esempio</b>
            <span className="text-muted"> · prezzi reali, operazioni fittizie</span>
          </span>
          <ChevronRight size={16} className="text-accent" />
        </Link>
      )}

      {/* Valore + grafico */}
      <Card className="overflow-hidden px-0 pb-3">
        <div className="px-5">
          <p className="num font-display text-[40px] font-bold leading-none tracking-tight">{fmtEur(totalValue)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            {scrub ? (
              <span className="text-muted">{fmtDate(scrub.date)}</span>
            ) : (
              <>
                <span className={`num font-semibold ${tone(totals.dayChange)}`}>{fmtSignedEur(totals.dayChange)}</span>
                <Pill value={totals.dayChangePct} />
                <span className="text-faint">oggi</span>
              </>
            )}
            <span className="text-faint">·</span>
            <span className={`num font-semibold ${tone(periodChange)}`}>{fmtSignedEur(periodChange)}</span>
            <span className="text-faint">{range === "MAX" ? "dall'inizio" : `in ${range}`}</span>
          </div>
        </div>
        <div className="mt-4">
          <AreaChart points={points} height={190} onScrub={setScrub} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 px-4">
          <div className="flex-1">
            <Segmented
              value={range}
              onChange={setRange}
              options={(["1M", "3M", "6M", "1A", "MAX"] as Range[]).map((r) => ({ value: r, label: r }))}
            />
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 px-5 text-[11px] text-faint">
          <span className="inline-block h-px w-4 border-t border-dashed border-faint" /> capitale investito
        </p>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <Card style={{ animationDelay: "40ms" }}>
          <Stat
            label="Plus/minus latente"
            value={fmtSignedEur(totals.unrealized)}
            valueClass={tone(totals.unrealized)}
            hint={fmtSignedPct(totals.unrealizedPct)}
          />
        </Card>
        <Card style={{ animationDelay: "80ms" }}>
          <Stat label="Netto se vendi oggi" value={fmtEur0(totals.netLiquidation)} hint={`tasse stimate ${fmtEur0(totals.taxIfSold)}`} />
        </Card>
        <Card style={{ animationDelay: "120ms" }}>
          <Stat label="Realizzato netto" value={fmtSignedEur(totals.realizedNet)} valueClass={tone(totals.realizedNet)} hint={`imposte ${fmtEur0(totals.realizedTax)}`} />
        </Card>
        <Card style={{ animationDelay: "160ms" }}>
          <Stat label="Cedole e dividendi" value={fmtEur(totals.income)} valueClass="text-gain" hint="netti incassati" />
        </Card>
      </div>

      {/* Allocazione */}
      <Card style={{ animationDelay: "200ms" }}>
        <SectionTitle
          right={
            <div className="w-40">
              <Segmented
                value={allocBy}
                onChange={setAllocBy}
                options={[
                  { value: "classe", label: "Classe" },
                  { value: "broker", label: "Broker" },
                ]}
              />
            </div>
          }
        >
          Allocazione
        </SectionTitle>
        <div className="flex items-center gap-5">
          <Donut slices={slices}>
            <span className="text-[11px] text-muted">{slices.length} {allocBy === "classe" ? "classi" : "conti"}</span>
            <span className="num text-[15px] font-semibold">{fmtEur0(totals.value)}</span>
          </Donut>
          <ul className="min-w-0 flex-1 space-y-2.5">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-[13px]">
                <AccountDot color={s.color} />
                <span className="min-w-0 flex-1 truncate text-muted">{s.label}</span>
                <span className="num font-semibold">{fmtPct(s.value / (totals.value || 1))}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* Movimenti di oggi */}
      <Card style={{ animationDelay: "240ms" }}>
        <SectionTitle right={<Link href="/posizioni" className="text-[13px] font-medium text-accent">Tutte</Link>}>Oggi sui mercati</SectionTitle>
        <ul className="-mx-1 divide-y divide-line">
          {movers.map((v) => (
            <li key={`${v.position.account}-${v.position.isin}`}>
              <Link href={`/posizioni/${v.instrument.isin}`} className="flex items-center gap-3 px-1 py-2.5 active:opacity-70">
                <InstrumentBadge label={v.instrument.shortName ?? v.instrument.name} color={ASSET_CLASS_COLOR[v.instrument.assetClass]} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{v.instrument.shortName ?? v.instrument.name}</p>
                  <p className="flex items-center gap-1.5 text-[12px] text-muted">
                    <AccountDot color={accounts.get(v.position.account)?.color ?? "#888"} />
                    {accounts.get(v.position.account)?.name} · {v.instrument.ticker}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-[14px] font-semibold">{fmtEur(v.value)}</p>
                  <p className={`num text-[12px] font-semibold ${tone(v.dayChange)}`}>{fmtSignedPct(v.dayChangePct)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <p className="pb-2 text-center text-[11px] text-faint">
        Quotazioni Yahoo Finance, aggiornate ogni 5 minuti · borse europee con ~15 min di ritardo
      </p>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

function EmptyState() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <p className="text-lg font-semibold">Nessun dato</p>
      <p className="mt-1 text-sm text-muted">Importa i movimenti dalla sezione Movimenti.</p>
    </div>
  );
}
