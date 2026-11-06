"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { type ChartPoint } from "@/components/AreaChart";
import { InteractiveChart } from "@/components/InteractiveChart";
import { ChevronLeft } from "lucide-react";
import { BankDot, Change, InfoRow, Logo, Panel, SectionHeader, Segmented } from "@/components/ui";
import { ASSET_CLASS_LABEL, cutoffDate, type FxRates, type PositionView } from "@/lib/analytics";
import { simulateSale } from "@/lib/engine/portfolio";
import { detectPac } from "@/lib/pac";
import { effectiveRate } from "@/lib/engine/tax";
import type { Account, Instrument, PortfolioState } from "@/lib/engine/types";
import { exchangeName, fmtDate, fmtEur, fmtNum, fmtPct, fmtPrice, fmtSignedEur, fmtSignedPct, fmtWhen } from "@/lib/format";

type Range = "1G" | "1S" | "1M" | "6M" | "1A" | "MAX";
const RANGE_DAYS: Record<Range, number> = { "1G": 1, "1S": 7, "1M": 31, "6M": 183, "1A": 366, MAX: 99999 };
const RANGE_LABEL: Record<Range, string> = { "1G": "oggi", "1S": "1 settimana", "1M": "1 mese", "6M": "6 mesi", "1A": "1 anno", MAX: "dall'inizio" };

/** Etichette dell'asse in percentuale: +4%, −1,5%. */
function axisPct(v: number) {
  const n = v * 100;
  const s = Math.abs(n).toLocaleString("it-IT", { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
  return `${n < -0.0001 ? "−" : n > 0.0001 ? "+" : ""}${s}%`;
}
const TX_LABEL = { buy: "Acquisto", sell: "Vendita", dividend: "Cedola/dividendo", split: "Frazionamento", cash: "Liquidità", deposit: "Versamento", withdrawal: "Prelievo", transfer: "Bonifico" } as const;

export default function PositionDetail() {
  const { isin } = useParams<{ isin: string }>();
  const { data, state, views, quotes, fx, priceSeries, historyReady } = usePortfolioView();
  const [range, setRange] = useState<Range>("1A");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [bank, setBank] = useState<string>("all");
  const [allTx, setAllTx] = useState(false);

  const instrument = data.instruments.find((i) => i.isin === isin);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const allRows = views.filter((v) => v.instrument.isin === isin);
  const rows = bank === "all" ? allRows : allRows.filter((r) => r.position.account === bank);
  const txs = data.transactions.filter((t) => t.isin === isin).sort((a, b) => b.date.localeCompare(a.date));

  // Andamento della giornata (ogni 5 minuti), caricato solo quando serve.
  const [intraday, setIntraday] = useState<{ points: [string, number][]; previousClose: number } | null>(null);
  useEffect(() => {
    if (range !== "1G" || !instrument) return;
    let stop = false;
    setIntraday(null);
    const t = instrument.currency === "EUR" ? `${instrument.ticker}~${instrument.isin}` : instrument.ticker;
    fetch(`/api/intraday?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((j) => !stop && setIntraday(j))
      .catch(() => !stop && setIntraday({ points: [], previousClose: 0 }));
    return () => {
      stop = true;
    };
  }, [range, instrument]);

  /** Prezzi del periodo (in valuta del titolo). */
  const prices = useMemo<ChartPoint[]>(() => {
    if (!instrument) return [];
    if (range === "1G") return (intraday?.points ?? []).map(([date, value]) => ({ date, value }));
    const s = priceSeries[instrument.ticker] ?? [];
    const cutoff = cutoffDate(RANGE_DAYS[range]);
    return s.filter(([d]) => d >= cutoff).map(([date, value]) => ({ date, value }));
  }, [priceSeries, instrument, range, intraday]);
  // Base della percentuale: chiusura di ieri per "1G", primo prezzo del periodo altrimenti.
  const base = range === "1G" ? intraday?.previousClose || prices[0]?.value : prices[0]?.value;
  const points = useMemo<ChartPoint[]>(() => (base ? prices.map((p) => ({ date: p.date, value: p.value / base - 1 })) : []), [prices, base]);

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
  const price = scrub?.value ?? q?.price ?? prices.at(-1)?.value;
  const rangeChange = base && price ? (price - base) / base : 0;
  const qty = rows.reduce((a, r) => a + r.position.quantity, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const cost = rows.reduce((a, r) => a + r.position.totalCost, 0);
  const tax = rows.reduce((a, r) => a + r.taxIfSold, 0);
  const income = state?.positions.filter((p) => p.isin === isin && (bank === "all" || p.account === bank)).reduce((a, p) => a + p.income, 0) ?? 0;
  const name = instrument.shortName ?? instrument.name;
  const pmcMarker =
    instrument.currency === "EUR" && qty > 0 && base && range !== "1G" ? { value: cost / qty / base - 1, label: `Il tuo prezzo medio ${fmtEur(cost / qty)}` } : undefined;

  return (
    <div>
      <div className="flex items-center justify-between px-3">
        <Link href="/posizioni" aria-label="Torna ai titoli" className="flex h-11 w-11 items-center justify-center rounded-full bg-chip active:opacity-60">
          <ChevronLeft size={20} strokeWidth={2.4} />
        </Link>
      </div>

      <div className="flex items-center gap-3.5 px-4 pt-5">
        <Logo isin={instrument.isin} name={name} size={48} />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-[-0.025em]">{name}</h1>
          <p className="num truncate text-[14px] text-mut">
            {instrument.ticker.split(".")[0]} · {instrument.isin}
          </p>
        </div>
      </div>
      <div className="px-4 pt-6">
        {price === undefined ? (
          <p className="text-[15px] text-mut">Quotazione non disponibile al momento.</p>
        ) : (
          <>
            <PriceBig value={price} currency={instrument.currency} />
            <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[14px] text-mut">
              <span className={`num font-semibold ${rangeChange > 0 ? "text-up" : rangeChange < 0 ? "text-dn" : "text-mut"}`}>
                {rangeChange > 0 ? "↗ " : rangeChange < 0 ? "↘ " : ""}
                {fmtPct(Math.abs(rangeChange))}
              </span>
              {scrub ? (scrub.date.length > 10 ? `alle ${new Date(scrub.date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : `al ${fmtDate(scrub.date)}`) : range === "1G" && prices.length && new Date(prices[prices.length - 1].date).toDateString() !== new Date().toDateString() ? "ultima seduta" : RANGE_LABEL[range]}
              {!scrub && q && range !== "1G" && (
                <>
                  <span className="text-faint">·</span>
                  oggi <Change pct={(q.price - q.previousClose) / q.previousClose} size="sm" />
                </>
              )}
            </p>
            {q && (
              <p className="mt-1 text-[13px] text-mut">
                {q.source ?? exchangeName(instrument.ticker)} · prezzo {fmtWhen(q.time)}
                {q.source === "Tradegate" ? ", fuori orario di borsa" : Date.now() - q.time > 30 * 60_000 ? " (borsa chiusa)" : ", ritardo ~15 min"}
              </p>
            )}
          </>
        )}
      </div>

      <div className={`pl-4 pr-3 ${points.length > 1 ? "mt-6" : "mt-2"}`}>
        <InteractiveChart
          points={points}
          height={points.length > 1 || (range === "1G" ? !intraday : !historyReady) ? 234 : 72}
          reference={0}
          onSelect={(sel) => setScrub(sel ? prices[sel.b ?? sel.a] : null)}
          loading={range === "1G" ? !intraday : !historyReady}
          format={(v) => fmtSignedPct(v)}
          formatAxis={axisPct}
          describePoint={(i) => `${fmtPrice(prices[i].value, instrument.currency)} · ${fmtSignedPct(points[i].value)}`}
          describeRange={(i, j) => `${fmtSignedPct(prices[j].value / prices[i].value - 1)} · ${fmtPrice(prices[j].value - prices[i].value, instrument.currency)}`}
          marker={pmcMarker}
          events={
            range === "1G"
              ? []
              : txs
                  .filter((t) => t.type === "buy" || t.type === "sell" || t.type === "dividend")
                  .map((t) => ({
                    date: t.date,
                    kind: t.type as "buy" | "sell" | "dividend",
                    label: t.type === "dividend" ? `+${fmtEur(t.amount ?? 0)}` : `${fmtNum(t.quantity ?? 0)} quote a ${fmtPrice(t.price ?? 0, instrument.currency)}`,
                  }))
          }
        />
      </div>
      <div role="group" aria-label="Periodo del grafico" className="mt-4 grid grid-cols-6 gap-1 px-3">
        {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`num h-9 rounded-full text-[14px] font-semibold ${range === r ? "bg-chip text-ink" : "text-mut active:text-ink"}`}
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
            <InfoRow
              label={`Valore${bank !== "all" || allRows.length === 1 ? ` · ${accounts.get(rows[0]?.position.account ?? "")?.name ?? ""}` : ""}`}
              value={<span className="sensitive">{fmtEur(value)}</span>}
            />
            <InfoRow
              label="Guadagno"
              value={<span className="sensitive">{`${fmtSignedEur(value - cost)} · ${fmtSignedPct(cost ? (value - cost) / cost : 0)}`}</span>}
              valueClass={value - cost > 0.005 ? "text-up" : value - cost < -0.005 ? "text-dn" : ""}
            />
            <InfoRow label="Quote" value={fmtNum(qty)} />
            <InfoRow
              label="Prezzo medio di carico"
              value={fmtEur(qty ? cost / qty : 0)}
              hint={bank === "all" && allRows.length > 1 ? "Calcolato per ogni banca" : undefined}
            />
            <InfoRow label="Investito" value={<span className="sensitive">{fmtEur(cost)}</span>} />
            {income > 0 && <InfoRow label="Cedole e dividendi incassati" value={`+${fmtEur(income)}`} valueClass="text-up" />}
            {allRows.map((r) => {
              const pac = detectPac(data.transactions, isin, r.position.account);
              if (!pac) return null;
              return (
                <InfoRow
                  key={`pac-${r.position.account}`}
                  label={`Piano di accumulo${allRows.length > 1 ? ` · ${accounts.get(r.position.account)?.name}` : ""}`}
                  hint={`${pac.installments} rate dal ${fmtDate(pac.since, { month: "short", year: "numeric" })}`}
                  value={`${fmtEur(pac.monthly)} al mese`}
                />
              );
            })}
            <InfoRow label="Tasse se vendi oggi" value={fmtEur(tax)} />
            <InfoRow label="Netto se vendi oggi" value={<span className="sensitive">{fmtEur(value - tax)}</span>} />
          </Panel>

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
      <ul>
        {(allTx ? txs : txs.slice(0, 5)).map((t) => (
          <li key={t.id} className="flex min-h-[60px] items-center gap-3.5 px-4 py-2.5">
            <span className="num w-[42px] shrink-0 text-[15px] text-mut">{fmtDate(t.date, { day: "2-digit", month: "2-digit" }).replace("/", ".")}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold">{TX_LABEL[t.type]}</p>
              <p className="num mt-0.5 flex items-center gap-1.5 text-[14px] text-mut">
                <BankDot color={accounts.get(t.account)?.color ?? "#888"} size={7} />
                {t.type === "buy" || t.type === "sell"
                  ? `${fmtNum(t.quantity ?? 0)} a ${fmtPrice(t.price ?? 0, instrument.currency)}`
                  : t.type === "split"
                    ? `Rapporto ${t.splitRatio}:1`
                    : fmtDate(t.date, { year: "numeric" })}
              </p>
            </div>
            <p className={`num sensitive shrink-0 text-[17px] font-medium ${t.type === "dividend" || t.type === "sell" ? "text-up" : ""}`}>
              {t.type === "dividend"
                ? `+${fmtEur(t.amount ?? 0)}`
                : t.type === "split"
                  ? `× ${t.splitRatio}`
                  : `${t.type === "sell" ? "+" : "−"}${fmtEur(((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1))}`}
            </p>
          </li>
        ))}
      </ul>
      {txs.length > 5 && (
        <div className="flex justify-end px-4">
          <button onClick={() => setAllTx(!allTx)} className="min-h-[44px] text-[15px] font-semibold text-accent">
            {allTx ? "Mostra meno" : `Mostra tutte (${txs.length})`}
          </button>
        </div>
      )}
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
                className="h-9 rounded-full bg-chip px-3.5 active:opacity-60"
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
              <div>
                <p className="text-[16px] font-semibold">Incasso netto</p>
                <p className="text-[13px] text-mut">Al prezzo attuale, senza commissioni</p>
              </div>
              <p className="num text-[24px] font-semibold tracking-[-0.03em]">{fmtEur(sim.net)}</p>
            </div>
          </div>
        ) : (
          <p className="border-t border-sep px-4 py-4 text-[14px] text-mut">Sposta il cursore per simulare la vendita.</p>
        )}
      </Panel>
    </>
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
