"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { AreaChart, type ChartPoint } from "@/components/AreaChart";
import { AccountDot, Card, Pill, SectionTitle, Segmented, Stat } from "@/components/ui";
import { ASSET_CLASS_LABEL, type FxRates, type PositionView } from "@/lib/analytics";
import type { Account, Instrument, PortfolioState } from "@/lib/engine/types";
import { simulateSale } from "@/lib/engine/portfolio";
import { effectiveRate } from "@/lib/engine/tax";
import { fmtDate, fmtEur, fmtNum, fmtPct, fmtPrice, fmtSignedEur, fmtSignedPct, tone } from "@/lib/format";

type Range = "1M" | "6M" | "1A" | "MAX";
const RANGE_DAYS: Record<Range, number> = { "1M": 31, "6M": 183, "1A": 366, MAX: 99999 };

const TX_LABEL = { buy: "Acquisto", sell: "Vendita", dividend: "Cedola/dividendo", split: "Frazionamento" } as const;

export default function PositionDetail() {
  const { isin } = useParams<{ isin: string }>();
  const { data, state, views, quotes, fx, priceSeries } = usePortfolioCtx();
  const [range, setRange] = useState<Range>("1A");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  const instrument = data.instruments.find((i) => i.isin === isin);
  const rows = views.filter((v) => v.instrument.isin === isin);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const txs = data.transactions.filter((t) => t.isin === isin).sort((a, b) => b.date.localeCompare(a.date));

  const points = useMemo<ChartPoint[]>(() => {
    if (!instrument) return [];
    const s = priceSeries[instrument.ticker] ?? [];
    const cutoff = new Date(Date.now() - RANGE_DAYS[range] * 86400_000).toISOString().slice(0, 10);
    return s.filter(([d]) => d >= cutoff).map(([date, value]) => ({ date, value }));
  }, [priceSeries, instrument, range]);

  if (!instrument) {
    return (
      <div className="pt-10 text-center text-muted">
        Strumento non trovato. <Link href="/posizioni" className="text-accent">Torna alle posizioni</Link>
      </div>
    );
  }

  const q = quotes[instrument.ticker];
  const price = scrub?.value ?? q?.price;
  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const totalCost = rows.reduce((a, r) => a + r.position.totalCost, 0);
  const income = state?.positions.filter((p) => p.isin === isin).reduce((a, p) => a + p.income, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <Link href="/posizioni" className="-ml-2 flex items-center text-[15px] font-medium text-accent active:opacity-60">
          <ChevronLeft size={22} /> Posizioni
        </Link>
      </div>

      <header>
        <p className="text-[13px] font-medium text-muted">
          {instrument.ticker} · {ASSET_CLASS_LABEL[instrument.assetClass]}
        </p>
        <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight">{instrument.name}</h1>
        <p className="mt-1 text-[12px] text-faint">
          ISIN {instrument.isin}
          {instrument.ter !== undefined && ` · TER ${instrument.ter.toLocaleString("it-IT")}%`} · aliquota effettiva {fmtPct(effectiveRate(instrument))}
        </p>
      </header>

      <Card className="overflow-hidden px-0 pb-3">
        <div className="px-5">
          <p className="num font-display text-[34px] font-bold leading-none tracking-tight">{price !== undefined ? fmtPrice(price, instrument.currency) : "—"}</p>
          <div className="mt-2 flex items-center gap-2 text-[13px]">
            {scrub ? (
              <span className="text-muted">{fmtDate(scrub.date)}</span>
            ) : q ? (
              <>
                <Pill value={(q.price - q.previousClose) / q.previousClose} />
                <span className="text-faint">oggi</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <AreaChart points={points} height={170} onScrub={setScrub} />
        </div>
        <div className="mt-3 px-4">
          <Segmented value={range} onChange={setRange} options={(["1M", "6M", "1A", "MAX"] as Range[]).map((r) => ({ value: r, label: r }))} />
        </div>
      </Card>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <Stat label="Valore" value={fmtEur(totalValue)} hint={`${fmtNum(rows.reduce((a, r) => a + r.position.quantity, 0))} quote`} />
          </Card>
          <Card>
            <Stat
              label="Plus/minus latente"
              value={fmtSignedEur(totalValue - totalCost)}
              valueClass={tone(totalValue - totalCost)}
              hint={fmtSignedPct((totalValue - totalCost) / (totalCost || 1))}
            />
          </Card>
        </div>
      )}

      {rows.map((r) => {
        const acc = accounts.get(r.position.account);
        return (
          <Card key={r.position.account}>
            <SectionTitle>
              <span className="flex items-center gap-2">
                <AccountDot color={acc?.color ?? "#888"} /> {acc?.name ?? r.position.account}
              </span>
            </SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Quote" value={fmtNum(r.position.quantity)} />
              <Stat label="Prezzo medio" value={fmtEur(r.position.avgCost)} />
              <Stat label="Costo" value={fmtEur(r.position.totalCost)} />
              <Stat label="Valore" value={fmtEur(r.value)} />
              <Stat label="Plus/minus" value={fmtSignedEur(r.unrealized)} valueClass={tone(r.unrealized)} />
              <Stat label="Tasse se vendi" value={fmtEur(r.taxIfSold)} />
            </div>
          </Card>
        );
      })}

      {rows.length > 0 && state && (
        <Simulator state={state} instrument={instrument} rows={rows} accounts={accounts} price={q?.price} fx={fx} />
      )}

      {income > 0 && (
        <Card>
          <Stat label="Cedole/dividendi netti incassati" value={fmtEur(income)} valueClass="text-gain" />
        </Card>
      )}

      <Card>
        <SectionTitle>Operazioni</SectionTitle>
        <ul className="divide-y divide-line">
          {txs.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <div className="min-w-0">
                <p className="font-semibold">{TX_LABEL[t.type]}</p>
                <p className="flex items-center gap-1.5 text-[12px] text-muted">
                  <AccountDot color={accounts.get(t.account)?.color ?? "#888"} />
                  {fmtDate(t.date)}
                </p>
              </div>
              <div className="num text-right">
                {t.type === "dividend" ? (
                  <p className="font-semibold text-gain">+{fmtEur(t.amount ?? 0)}</p>
                ) : t.type === "split" ? (
                  <p>× {t.splitRatio}</p>
                ) : (
                  <>
                    <p className="font-semibold">
                      {t.type === "sell" ? "−" : "+"}
                      {fmtNum(t.quantity ?? 0)} @ {fmtPrice(t.price ?? 0, instrument.currency)}
                    </p>
                    {t.fees ? <p className="text-[11px] text-faint">comm. {fmtEur(t.fees)}</p> : null}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Simulator({
  state,
  instrument,
  rows,
  accounts,
  price,
  fx,
}: {
  state: PortfolioState;
  instrument: Instrument;
  rows: PositionView[];
  accounts: Map<string, Account>;
  price: number | undefined;
  fx: FxRates;
}) {
  const [account, setAccount] = useState(rows[0].position.account);
  const row = rows.find((r) => r.position.account === account) ?? rows[0];
  const [qty, setQty] = useState(row.position.quantity);
  const rate = instrument.currency === "EUR" ? 1 : fx[instrument.currency] ?? 1;
  const priceNow = price ?? row.position.avgCost;
  const sim = useMemo(() => {
    try {
      return simulateSale(state, instrument, account, Math.min(qty, row.position.quantity), priceNow, { fxRate: rate });
    } catch {
      return null;
    }
  }, [state, instrument, account, qty, row, priceNow, rate]);
  return (
    <Card>
      <SectionTitle>Simula una vendita</SectionTitle>
      {rows.length > 1 && (
        <div className="mb-3">
          <Segmented
            value={account}
            onChange={(a) => {
              setAccount(a);
              setQty(rows.find((r) => r.position.account === a)!.position.quantity);
            }}
            options={rows.map((r) => ({ value: r.position.account, label: accounts.get(r.position.account)?.name ?? r.position.account }))}
          />
        </div>
      )}
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted">Quote da vendere</span>
        <span className="num font-semibold">
          {fmtNum(qty)} / {fmtNum(row.position.quantity)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={row.position.quantity}
        step={row.position.quantity >= 10 ? 1 : 0.01}
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--accent)]"
      />
      {sim && qty > 0 && (
        <dl className="num mt-3 space-y-2 text-[13px]">
          <Line label="Controvalore" value={fmtEur(sim.gross)} />
          <Line label="Plus/minus sul prezzo medio" value={fmtSignedEur(sim.gain)} cls={tone(sim.gain)} />
          <Line label="Natura fiscale" value={sim.kind === "redditi_capitale" ? "Reddito di capitale" : "Reddito diverso"} />
          {sim.lossesUsed > 0 && <Line label="Minus dello zainetto usate" value={fmtEur(sim.lossesUsed)} cls="text-gain" />}
          {sim.lossCreated > 0 && <Line label="Minus che entra nello zainetto" value={fmtEur(sim.lossCreated)} cls="text-warn" />}
          <Line label="Imposta stimata" value={fmtEur(sim.tax)} cls="text-loss" />
          <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-[15px] font-semibold">
            <dt>Incasso netto</dt>
            <dd>{fmtEur(sim.net)}</dd>
          </div>
        </dl>
      )}
      {sim?.kind === "redditi_capitale" && sim.gain > 0 && (
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
          Le plusvalenze da ETF sono redditi di capitale: non possono essere compensate con le minusvalenze dello zainetto.
        </p>
      )}
    </Card>
  );
}

function Line({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold ${cls}`}>{value}</dd>
    </div>
  );
}
