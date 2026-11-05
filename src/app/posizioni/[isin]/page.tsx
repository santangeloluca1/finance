"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { AreaChart, type ChartPoint } from "@/components/AreaChart";
import { ChevronLeft } from "lucide-react";
import { BankDot, Change, InfoRow, Logo, Panel, SectionHeader, Segmented } from "@/components/ui";
import { ASSET_CLASS_LABEL, cutoffDate, type FxRates, type PositionView } from "@/lib/analytics";
import { simulateSale } from "@/lib/engine/portfolio";
import { effectiveRate } from "@/lib/engine/tax";
import type { Account, Instrument, PortfolioState } from "@/lib/engine/types";
import { fmtDate, fmtEur, fmtNum, fmtPct, fmtPrice, fmtSignedEur, fmtSignedPct } from "@/lib/format";

type Range = "1S" | "1M" | "6M" | "1A" | "MAX";
const RANGE_DAYS: Record<Range, number> = { "1S": 7, "1M": 31, "6M": 183, "1A": 366, MAX: 99999 };
const RANGE_LABEL: Record<Range, string> = { "1S": "1 settimana", "1M": "1 mese", "6M": "6 mesi", "1A": "1 anno", MAX: "dall'inizio" };
const TX_LABEL = { buy: "Acquisto", sell: "Vendita", dividend: "Cedola/dividendo", split: "Frazionamento" } as const;

export default function PositionDetail() {
  const { isin } = useParams<{ isin: string }>();
  const { data, state, views, quotes, fx, priceSeries, historyReady } = usePortfolioView();
  const [range, setRange] = useState<Range>("1A");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [bank, setBank] = useState<string>("all");

  const instrument = data.instruments.find((i) => i.isin === isin);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const allRows = views.filter((v) => v.instrument.isin === isin);
  const rows = bank === "all" ? allRows : allRows.filter((r) => r.position.account === bank);
  const txs = data.transactions.filter((t) => t.isin === isin).sort((a, b) => b.date.localeCompare(a.date));

  const points = useMemo<ChartPoint[]>(() => {
    if (!instrument) return [];
    const s = priceSeries[instrument.ticker] ?? [];
    const cutoff = cutoffDate(RANGE_DAYS[range]);
    return s.filter(([d]) => d >= cutoff).map(([date, value]) => ({ date, value }));
  }, [priceSeries, instrument, range]);

  if (!instrument) {
    return (
      <div className="px-4 pt-10 text-center text-mut">
        Titolo non trovato.{" "}
        <Link href="/posizioni" className="text-accent">
          Torna ai titoli
        </Link>
      </div>
    );
  }

  const q = quotes[instrument.ticker];
  const price = scrub?.value ?? q?.price ?? points.at(-1)?.value;
  const first = points[0]?.value;
  const rangeChange = first && price ? (price - first) / first : 0;
  const qty = rows.reduce((a, r) => a + r.position.quantity, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const cost = rows.reduce((a, r) => a + r.position.totalCost, 0);
  const tax = rows.reduce((a, r) => a + r.taxIfSold, 0);
  const income = state?.positions.filter((p) => p.isin === isin && (bank === "all" || p.account === bank)).reduce((a, p) => a + p.income, 0) ?? 0;
  const name = instrument.shortName ?? instrument.name;
  const pmcMarker = instrument.currency === "EUR" && qty > 0 ? { value: cost / qty, label: `Il tuo prezzo medio ${fmtEur(cost / qty)}` } : undefined;

  return (
    <div>
      <div className="flex items-center justify-between px-3">
        <Link href="/posizioni" aria-label="Torna ai titoli" className="flex h-10 w-10 items-center justify-center rounded-full bg-chip active:opacity-60">
          <ChevronLeft size={20} strokeWidth={2.4} />
        </Link>
      </div>

      <div className="px-4 pt-4">
        <Logo isin={instrument.isin} name={name} size={52} />
        <h1 className="mt-3.5 truncate text-[15px] font-medium text-mut">
          {name} · {instrument.ticker.split(".")[0]}
        </h1>
        <PriceBig value={price} currency={instrument.currency} />
        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-[14px] text-mut">
          <span className={`num font-semibold ${rangeChange >= 0 ? "text-up" : "text-dn"}`}>
            {rangeChange >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(rangeChange))}
          </span>
          {scrub ? `al ${fmtDate(scrub.date)}` : RANGE_LABEL[range]}
          {!scrub && q && (
            <>
              <span>·</span>
              <Change pct={(q.price - q.previousClose) / q.previousClose} size="sm" />
              <span>oggi</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-7">
        <AreaChart
          points={points}
          height={170}
          onScrub={setScrub}
          loading={!historyReady}
          tooltip={(p) => `${fmtPrice(p.value, instrument.currency)} · ${fmtDate(p.date, { day: "numeric", month: "short" })}`}
          marker={pmcMarker}
        />
      </div>
      <div className="mt-3 flex px-3">
        {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`num rounded-full px-3 py-1.5 text-[13px] font-semibold ${range === r ? "bg-ink text-bg" : "text-mut"}`}
          >
            {r}
          </button>
        ))}
      </div>

      {allRows.length > 0 && (
        <>
          <SectionHeader>La tua posizione</SectionHeader>
          {allRows.length > 1 && (
            <div className="px-4 pb-3">
              <Segmented
                value={bank}
                onChange={setBank}
                options={[{ value: "all", label: "Tutte" }, ...allRows.map((r) => ({ value: r.position.account, label: accounts.get(r.position.account)?.name ?? r.position.account }))]}
              />
            </div>
          )}
          <Panel>
            <div className="flex items-end justify-between gap-3 px-4 py-4">
              <div>
                <p className="text-[13px] text-mut">Valore{bank !== "all" || allRows.length === 1 ? ` · ${accounts.get(rows[0]?.position.account ?? "")?.name ?? ""}` : ""}</p>
                <p className="num sensitive mt-1 text-[28px] font-semibold tracking-[-0.04em]">{fmtEur(value)}</p>
              </div>
              <span className={`num sensitive rounded-full px-2.5 py-1 text-[14px] font-semibold ${value - cost >= 0 ? "bg-up/12 text-up" : "bg-dn/12 text-dn"}`}>
                {fmtSignedEur(value - cost)} · {fmtSignedPct(cost ? (value - cost) / cost : 0)}
              </span>
            </div>
            <div className="grid grid-cols-3 border-t border-sep">
              <Cell label="Quote" value={fmtNum(qty)} />
              <Cell label="Prezzo medio" value={fmtEur(qty ? cost / qty : 0)} border />
              <Cell label="Investito" value={fmtEur(cost)} border sensitive />
            </div>
            <div className="border-t border-sep">
              {income > 0 && <InfoRow label="Cedole e dividendi incassati" value={`+${fmtEur(income)}`} valueClass="text-up" />}
              <InfoRow label="Tasse se vendi oggi" value={fmtEur(tax)} />
              <InfoRow label="Netto se vendi oggi" value={<span className="sensitive">{fmtEur(value - tax)}</span>} />
            </div>
          </Panel>
          {bank === "all" && allRows.length > 1 && (
            <p className="px-8 pt-2 text-[12px] leading-snug text-mut">Il prezzo medio è calcolato separatamente per ogni banca, come fanno gli intermediari.</p>
          )}

          {state && (
            <Simulator
              key={bank}
              state={state}
              instrument={instrument}
              rows={bank === "all" ? allRows : rows}
              accounts={accounts}
              price={q?.price}
              fx={fx}
            />
          )}
        </>
      )}

      <SectionHeader>Informazioni</SectionHeader>
      <Panel>
        <InfoRow label="ISIN" value={instrument.isin} />
        <InfoRow label="Valuta" value={instrument.currency} />
        {instrument.ter !== undefined && <InfoRow label="Costo annuo (TER)" value={`${instrument.ter.toLocaleString("it-IT")}%`} />}
        <InfoRow
          label="Aliquota sulle plusvalenze"
          value={fmtPct(effectiveRate(instrument))}
          hint={instrument.govBondShare ? `${Math.round(instrument.govBondShare * 100)}% in titoli di Stato al 12,5%` : undefined}
        />
      </Panel>

      <SectionHeader>Operazioni</SectionHeader>
      <Panel>
        {txs.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 border-b border-sep px-4 py-3 last:border-0">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{TX_LABEL[t.type]}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mut">
                <BankDot color={accounts.get(t.account)?.color ?? "#888"} size={7} />
                {accounts.get(t.account)?.name} · {fmtDate(t.date)}
              </p>
            </div>
            <div className="num text-right">
              {t.type === "dividend" ? (
                <p className="text-[15px] font-semibold text-up">+{fmtEur(t.amount ?? 0)}</p>
              ) : t.type === "split" ? (
                <p className="text-[15px]">× {t.splitRatio}</p>
              ) : (
                <>
                  <p className="text-[15px] font-semibold">
                    {t.type === "sell" ? "−" : "+"}
                    {fmtNum(t.quantity ?? 0)} quote
                  </p>
                  <p className="text-[12px] text-mut">a {fmtPrice(t.price ?? 0, instrument.currency)}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </Panel>
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
  const priceNow = price ?? row.position.avgCost * rate;
  const sim = useMemo(() => {
    try {
      return simulateSale(state, instrument, account, Math.min(qty, row.position.quantity), priceNow, { fxRate: rate });
    } catch {
      return null;
    }
  }, [state, instrument, account, qty, row, priceNow, rate]);

  return (
    <>
      <SectionHeader>Simula una vendita</SectionHeader>
      <Panel>
        <div className="px-4 pb-3 pt-4">
          {rows.length > 1 && (
            <div className="mb-4">
              <Segmented
                size="sm"
                value={account}
                onChange={(a) => {
                  setAccount(a);
                  setQty(rows.find((r) => r.position.account === a)!.position.quantity);
                }}
                options={rows.map((r) => ({ value: r.position.account, label: accounts.get(r.position.account)?.name ?? r.position.account }))}
              />
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] text-ink-2">Quote da vendere</p>
            <p className="num text-[15px] font-semibold">
              {fmtNum(qty)} <span className="font-normal text-mut">di {fmtNum(row.position.quantity)}</span>
            </p>
          </div>
          <input
            type="range"
            aria-label="Quote da vendere"
            min={0}
            max={row.position.quantity}
            step={row.position.quantity >= 10 ? 1 : 0.01}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="mt-3 w-full"
          />
          <div className="mt-3 flex gap-2 text-[13px] font-semibold">
            {[0.25, 0.5, 1].map((f) => (
              <button
                key={f}
                onClick={() => setQty(f === 1 ? row.position.quantity : Math.round(row.position.quantity * f))}
                className="rounded-full bg-chip px-3 py-1.5 active:opacity-60"
              >
                {f === 1 ? "Tutte" : `${f * 100}%`}
              </button>
            ))}
          </div>
        </div>
        {sim && qty > 0 ? (
          <div className="border-t border-sep">
            <InfoRow label="Controvalore" value={fmtEur(sim.gross)} />
            <InfoRow
              label="Plus/minus sul prezzo medio"
              value={fmtSignedEur(sim.gain)}
              valueClass={sim.gain >= 0 ? "text-up" : "text-dn"}
              hint={sim.kind === "redditi_capitale" ? "reddito di capitale: non compensa lo zainetto" : "reddito diverso"}
            />
            {sim.lossesUsed > 0 && <InfoRow label="Minus dello zainetto usate" value={fmtEur(sim.lossesUsed)} valueClass="text-up" />}
            {sim.lossCreated > 0 && <InfoRow label="Minus che entra nello zainetto" value={fmtEur(sim.lossCreated)} valueClass="text-warn" />}
            <InfoRow label="Imposta stimata" value={fmtEur(sim.tax)} />
            <div className="flex items-center justify-between bg-panel-2 px-4 py-3.5">
              <p className="text-[16px] font-semibold">Incasso netto</p>
              <p className="num text-[24px] font-semibold tracking-[-0.03em]">{fmtEur(sim.net)}</p>
            </div>
          </div>
        ) : (
          <p className="border-t border-sep px-4 py-4 text-[14px] text-mut">Sposta il cursore per simulare la vendita.</p>
        )}
      </Panel>
      <p className="px-8 pt-2 text-[12px] text-mut">Stima al prezzo attuale, senza commissioni di vendita.</p>
    </>
  );
}

function Cell({ label, value, border, sensitive }: { label: string; value: string; border?: boolean; sensitive?: boolean }) {
  return (
    <div className={`px-4 py-3 ${border ? "border-l border-sep" : ""}`}>
      <p className="text-[12px] text-mut">{label}</p>
      <p className={`num mt-1 truncate text-[16px] font-semibold ${sensitive ? "sensitive" : ""}`}>{value}</p>
    </div>
  );
}

/** Prezzo grande con decimali in apice. */
function PriceBig({ value, currency }: { value: number | undefined; currency: string }) {
  if (value === undefined) return <p className="hero-number mt-1.5">—</p>;
  const s = fmtPrice(value, currency);
  const i = s.lastIndexOf(",");
  return (
    <p className="hero-number mt-1.5" aria-label={s}>
      {i > 0 ? s.slice(0, i) : s}
      {i > 0 && <span className="dec">{s.slice(i)}</span>}
    </p>
  );
}
