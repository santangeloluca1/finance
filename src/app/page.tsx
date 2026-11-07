"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Repeat } from "lucide-react";
import { usePortfolioView, type Filter } from "@/components/PortfolioProvider";
import { InteractiveChart, type ChartEvent, type Selection, type SeriesPoint } from "@/components/InteractiveChart";
import { BigAmount } from "@/components/BigAmount";
import { buildRows, PERIOD_OPTIONS, PositionList } from "@/components/PositionList";
import { Toolbar } from "@/components/home/Toolbar";
import { Obiettivi } from "@/components/Obiettivi";
import { Dividendi } from "@/components/home/Dividendi";
import { PAGE_TITLE, RangePicker, SectionHeader, SelectButton } from "@/components/ui";
import { RANGES, RANGE_PHRASE, rangeStart, type Range } from "@/lib/range";
import { cutoffDate, type Period } from "@/lib/analytics";
import { usableLosses } from "@/lib/engine/portfolio";
import { fmtDate, fmtEur, fmtEur0, fmtNum, fmtPct, fmtSignedEur, fmtSignedPct, fmtTime, fmtN } from "@/lib/format";
import { twrSeries } from "@/lib/performance";
import { usePortfolioIntraday } from "@/lib/intraday-client";
import { pendingOccurrences } from "@/lib/recurring";

type Tab = "panoramica" | "obiettivi" | "dividendi";
const TABS: { id: Tab; label: string }[] = [
  { id: "panoramica", label: "Panoramica" },
  { id: "obiettivi", label: "Obiettivi" },
  { id: "dividendi", label: "Cedole" },
];


export default function Home() {
  const [tab, setTab] = useState<Tab>("panoramica");
  const [filter, setFilter] = useState<Filter>({ account: "all", asset: "all" });
  const view = usePortfolioView(filter);
  const router = useRouter();

  useEffect(() => {
    const sync = () => {
      // Analisi ora ha una pagina sua nella barra in basso.
      if (window.location.hash === "#analisi") return router.replace("/analisi");
      const h = window.location.hash.slice(1) as Tab;
      const next = TABS.some((t) => t.id === h) ? h : "panoramica";
      setTab(next);
      // Un link a "/#obiettivi" (es. da Impostazioni) non riporta in cima da solo:
      // la scheda si apre sempre dall'inizio.
      if (next !== "panoramica") requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [router]);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "panoramica" ? "/" : `/#${t}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      {/* Schede testuali in alto, poi filtri e azioni di servizio sulla stessa riga */}
      <div role="tablist" className="no-scrollbar flex gap-4 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => go(t.id)}
            className={`shrink-0 py-1 ${PAGE_TITLE} transition-colors ${tab === t.id ? "text-ink" : "text-faint"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Toolbar filter={filter} setFilter={setFilter} view={view} showFilters={tab !== "obiettivi"} />

      {view.totals && view.state ? (
        <div key={tab} className="page-in">
        {tab === "panoramica" ? (
          <Panoramica view={view} filter={filter} goto={go} />
        ) : tab === "obiettivi" ? (
          <Obiettivi embedded />
        ) : (
          <Dividendi data={view.data} state={view.state} totals={view.totals} views={view.views} />
        )}
        </div>
      ) : null}
    </div>
  );
}

type View = ReturnType<typeof usePortfolioView>;

function Panoramica({ view, filter, goto }: { view: View; filter: Filter; goto: (t: Tab) => void }) {
  const { data, state, views, totals, history, priceSeries, fx, fetchedAt, loading, historyReady } = view;
  const [range, setRange] = useState<Range>("1A");
  const [sel, setSel] = useState<Selection | null>(null);
  const [period, setPeriod] = useState<Period>("oggi");

  const intraday = usePortfolioIntraday(views, fx, range === "1G");
  const day = range === "1G";

  // Serie giornaliera del periodo + punto live di oggi; per "1G" i prezzi ogni 5 minuti.
  const series = useMemo(() => {
    if (!totals || !state) return [];
    if (range === "1G") {
      if (!intraday) return [];
      return intraday.dates.map((date, i) => ({ date, value: intraday.values[i] + totals.cash, invested: 0, gain: intraday.values[i] - intraday.base, cash: totals.cash }));
    }
    if (!history?.length) return [];
    const cutoff = rangeStart(range);
    const today = new Date().toISOString().slice(0, 10);
    const slice = history.filter((h) => h.date >= cutoff && h.date < today);
    const realized = state.realized.reduce((a, r) => a + r.gain, 0);
    return [...slice, { date: today, value: totals.value, invested: totals.cost + totals.cash, gain: totals.unrealized + realized + totals.income, cash: totals.cash }];
  }, [history, totals, range, state, intraday]);

  // Rendimento ponderato nel tempo dall'inizio del periodo: i versamenti non lo gonfiano.
  // In giornata: variazione sulla chiusura di ieri, come "Oggi".
  const twr = useMemo(
    () =>
      range === "1G"
        ? intraday?.base
          ? series.map((h) => (h.value - (h.cash ?? 0)) / intraday.base - 1)
          : series.map(() => 0)
        : twrSeries(series.map((h) => ({ ...h, value: h.value - (h.cash ?? 0) }))).map((p) => p.value),
    [series, range, intraday],
  );
  const points = useMemo<SeriesPoint[]>(() => series.map((h, i) => ({ date: h.date, value: twr[i] })), [series, twr]);

  // Operazioni da mostrare sulla linea del tempo.
  const events = useMemo<ChartEvent[]>(() => {
    const ins = new Map(data.instruments.map((i) => [i.isin, i]));
    return data.transactions
      .filter((t) => (filter.account === "all" || t.account === filter.account) && (filter.asset === "all" || ins.get(t.isin)?.assetClass === filter.asset))
      // Gli acquisti ricorrenti affollerebbero la linea: si segnano solo vendite e cedole.
      .filter((t) => t.type === "sell" || t.type === "dividend")
      .map((t) => {
        const name = ins.get(t.isin)?.shortName ?? t.isin;
        const label = t.type === "dividend" ? `${name} +${fmtEur(t.amount ?? 0)}` : `${name} · ${fmtNum(t.quantity ?? 0)} quote`;
        return { date: t.date, kind: t.type as ChartEvent["kind"], label };
      });
  }, [data, filter]);

  const rows = useMemo(
    () => buildRows(views, period, priceSeries, fx, filter.account === "all", "valore", data.transactions),
    [views, period, priceSeries, fx, filter.account, data.transactions],
  );
  const pending = useMemo(
    () => pendingOccurrences(data.recurring ?? [], data.transactions, data.recurringSkipped ?? [], new Date().toISOString().slice(0, 10)),
    [data.recurring, data.transactions, data.recurringSkipped],
  );

  if (!totals || !state) return null;

  // Guadagno tra due indici della serie: esclude acquisti e vendite.
  const gainBetween = (i: number, j: number) => series[j].gain - series[i].gain;
  // Rendimento tra due date, ponderato nel tempo.
  const pctBetween = (i: number, j: number) => (1 + twr[j]) / (1 + twr[i]) - 1;

  const last = series.length - 1;
  const from = sel?.b != null ? sel.a : 0;
  const to = sel ? (sel.b ?? sel.a) : last;
  const ready = series.length > 1;
  // In giornata, senza intervallo, la variazione parte dalla chiusura di ieri.
  const fromClose = day && sel?.b == null;
  const gain = fromClose ? (ready ? series[to].gain : totals.dayChange) : ready ? gainBetween(from, to) : 0;
  const gainPct = fromClose ? (ready ? twr[to] : totals.dayChangePct) : ready ? pctBetween(from, to) : 0;
  const shownValue = ready && (sel || day) ? series[to].value : totals.value;
  const caption = !sel
    ? "Valore del portafoglio"
    : sel.b != null
      ? day
        ? `Dalle ${clock(series[from].date)} alle ${clock(series[to].date)}`
        : `Dal ${fmtDate(series[from].date, { day: "numeric", month: "short", year: "numeric" })} al ${fmtDate(series[to].date, { day: "numeric", month: "short", year: "numeric" })}`
      : day
        ? `Alle ${clock(series[to].date)}`
        : fmtDate(series[to].date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const lastSession = day && !!intraday && !intraday.today && series.length > 1;

  const totalReturn = totals.unrealized + state.realized.reduce((a, r) => a + r.gain, 0) + totals.income;
  const today = new Date().toISOString().slice(0, 10);
  const backpack = data.accounts
    .filter((a) => filter.account === "all" || a.id === filter.account)
    .flatMap((a) => usableLosses(state.losses, a.id, today))
    .reduce((s, l) => s + l.remaining, 0);

  return (
    <div>
      {/* Totale: segue il dito sul grafico. A destra la variazione del periodo. */}
      <div className="flex items-end justify-between gap-3 px-4 pt-7">
        <div className="min-w-0">
          <p className="h-5 truncate text-[14px] capitalize-first text-mut">{caption}</p>
          <BigAmount value={shownValue} className="mt-1" />
        </div>
        {!ready && (day ? !intraday : !historyReady) ? (
          // Variazione del periodo in arrivo: segnaposto invece di un falso 0,00%.
          <div className="flex shrink-0 flex-col items-end gap-2 pb-1.5" aria-hidden>
            <span className="skeleton h-4 w-16" />
            <span className="skeleton h-3.5 w-20" />
          </div>
        ) : (
          <div className={`num sensitive shrink-0 pb-1 text-right ${tint(gain)}`}>
            <p className="text-[17px] font-semibold">
              {gain > 0.005 ? "↗ " : gain < -0.005 ? "↘ " : ""}
              {fmtPct(Math.abs(gainPct))}
            </p>
            <p className="text-[15px] font-medium">{fmtSignedEur(gain)}</p>
          </div>
        )}
      </div>
      <p className="mt-2 h-5 px-4 text-[14px] text-mut">
        {sel ? (sel.b != null ? "Nell'intervallo" : day ? "Dalla chiusura di ieri" : "Da inizio periodo") : day ? (
          lastSession ? "Ultima seduta" : "Oggi"
        ) : (
          <>
            {RANGE_PHRASE[range].replace(/^./, (c) => c.toUpperCase())}{" "}
            {ready ? (
              <span className={`num sensitive font-medium ${tint(gain)}`}>{fmtSignedPct(gainPct)}</span>
            ) : historyReady ? (
              <span className="num">—</span>
            ) : (
              <span className="skeleton inline-block h-3 w-10 align-middle" aria-hidden />
            )}
            <span className="mx-1.5 text-faint">·</span>
            Oggi <span className={`num sensitive font-medium ${tint(totals.dayChange)}`}>{fmtSignedPct(totals.dayChangePct)}</span>
          </>
        )}
      </p>

      {/* Grafico del rendimento: tutta la larghezza */}
      <div className="mt-6 pl-4 pr-3">
        <InteractiveChart
          points={points}
          height={240}
          reference={0}
          events={day ? [] : events}
          onSelect={setSel}
          loading={day ? !intraday : !historyReady}
          format={(v) => fmtSignedPct(v)}
          formatAxis={axisPct}
          describePoint={(i) => `${fmtSignedPct(day ? twr[i] : pctBetween(0, i))} · ${fmtEur(series[i].value)}`}
          describeRange={(i, j) => `${fmtSignedPct(pctBetween(i, j))} · ${fmtSignedEur(gainBetween(i, j))}`}
          trend={gainBetween}
        />
      </div>

      <RangePicker value={range} onChange={setRange} options={RANGES} />

      {pending.length > 0 && (
        <Link href="/ricorrenti" className="mx-4 mt-6 flex min-h-[56px] items-center gap-3 rounded-[16px] bg-accent/12 px-4 py-2.5 active:opacity-80">
          <Repeat size={20} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">{pending.length === 1 ? `${pending[0].plan.label} da confermare` : `${pending.length} rate da confermare`}</span>
            <span className="block truncate text-[14px] text-mut">{pending.map((o) => o.plan.label).join(", ")}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-accent" />
        </Link>
      )}

      <SectionHeader right={<SelectButton label="Periodo della variazione" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}>Titoli</SectionHeader>
      {rows.length || totals.cash > 0 ? (
        <>
          <PositionList rows={rows.slice(0, 6)} accounts={data.accounts} showBanks={filter.account === "all"} cash={state.cash} />
          {rows.length > 6 && (
            <div className="flex justify-end px-4 pt-1">
              <Link href="/posizioni" className="flex min-h-[44px] items-center gap-0.5 text-[15px] font-semibold text-accent">
                Mostra tutti <ChevronRight size={17} />
              </Link>
            </div>
          )}
        </>
      ) : (
        <p className="px-4 py-8 text-center text-[15px] text-mut">Nessun titolo con questi filtri.</p>
      )}

      {filter.account === "all" && <Banche views={views} cash={state.cash} accounts={data.accounts} />}

      <SectionHeader>In sintesi</SectionHeader>
      <ul>
        <SummaryRow
          label="Guadagno totale"
          value={fmtSignedEur(totalReturn)}
          valueClass={tint(totalReturn)}
          note={`${fmtSignedPct(totals.cost ? totalReturn / totals.cost : 0)} sul capitale`}
        />
        <SummaryRow href="/fisco" label="Netto se vendi oggi" value={fmtEur(totals.netLiquidation)} note={totals.taxIfSold > 0.5 ? `${fmtEur(totals.taxIfSold)} di tasse` : "Nessuna tassa da pagare"} />
        <SummaryRow
          onClick={() => goto("dividendi")}
          label={`Cedole ${new Date().getFullYear()}`}
          value={fmtEur(state.incomeByYear[String(new Date().getFullYear())] ?? 0)}
          note="Nette, già incassate"
        />
        {backpack > 0 && <SummaryRow href="/fisco" label="Zainetto fiscale" value={fmtEur(backpack)} valueClass="text-warn" note="Minusvalenze da recuperare" />}
      </ul>

      {data.isDemo && (
        <Link href="/movimenti" className="mx-4 mt-8 flex items-center justify-between rounded-[16px] bg-accent px-4 py-3.5 text-accent-ink active:opacity-80">
          <span>
            <span className="block text-[15px] font-semibold">Stai guardando un esempio</span>
            <span className="text-[13px] opacity-85">Prezzi reali, operazioni inventate. Importa le tue.</span>
          </span>
          <ChevronRight size={20} />
        </Link>
      )}

      <p className="num px-4 pb-2 pt-8 text-center text-[12px] text-faint">
        {loading ? "Aggiornamento quotazioni…" : fetchedAt ? `Quotazioni delle ${fmtTime(fetchedAt)} · titoli in euro in tempo reale` : "Quotazioni non ancora disponibili"}
      </p>
    </div>
  );
}

/** Ora di un istante intraday: "14:35". */
function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}


/** Etichette dell'asse in percentuale: +4%, −1,5%. */
function axisPct(v: number) {
  const n = v * 100;
  const s = fmtN(Math.abs(n), { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
  return `${n < -0.0001 ? "−" : n > 0.0001 ? "+" : ""}${s}%`;
}

/** Etichette compatte per l'asse: 58,1k €. */
function compact(v: number, signed: boolean) {
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `${fmtN((abs / 1000), { maximumFractionDigits: 1 })}k` : fmtN(abs, { maximumFractionDigits: 0 });
  return `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}${s} €`;
}

function SummaryRow({
  label,
  value,
  note,
  href,
  onClick,
  valueClass = "",
}: {
  label: string;
  value: string;
  note: string;
  href?: string;
  onClick?: () => void;
  valueClass?: string;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-medium">{label}</p>
        <p className="num mt-0.5 truncate text-[14px] text-mut">{note}</p>
      </div>
      <p className={`num sensitive shrink-0 text-[17px] font-medium ${valueClass}`}>{value}</p>
      {(href || onClick) && <ChevronRight size={18} className="-mr-1 shrink-0 text-faint" />}
    </>
  );
  const cls = "flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-panel-2";
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : onClick ? (
        <button onClick={onClick} className={cls}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** 4.414,79 € → "+4.415 €"; oltre 100k → "+101,2k €". */
function compactSigned(v: number) {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + compactPlain(Math.abs(v));
}

function compactPlain(v: number) {
  const abs = Math.abs(v);
  const s = abs >= 100_000 ? `${fmtN((abs / 1000), { maximumFractionDigits: 1 })}k` : fmtN(abs, { maximumFractionDigits: 0 });
  return `${v < 0 ? "−" : ""}${s} €`;
}

function tint(n: number) {
  return n > 0.005 ? "text-up" : n < -0.005 ? "text-dn" : "text-mut";
}

function pill(n: number) {
  return n > 0.005 ? "bg-up/12 text-up" : n < -0.005 ? "bg-dn/12 text-dn" : "bg-chip text-mut";
}

/** Quanto hai su ogni banca: titoli più liquidità, con la quota sul totale. */
function Banche({ views, cash, accounts }: { views: View["views"]; cash: Record<string, { amount: number }>; accounts: View["data"]["accounts"] }) {
  const rows = accounts
    .map((a) => {
      const titoli = views.filter((v) => v.position.account === a.id).reduce((s, v) => s + v.value, 0);
      const liquidita = cash[a.id]?.amount ?? 0;
      return { a, titoli, liquidita, total: titoli + liquidita };
    })
    .filter((r) => Math.abs(r.total) > 0.005)
    .sort((x, y) => y.total - x.total);
  const all = rows.reduce((s, r) => s + Math.max(0, r.total), 0);
  if (rows.length < 2 || all <= 0) return null;
  return (
    <>
      <SectionHeader>Le tue banche</SectionHeader>
      <div className="mx-4 mb-2 flex h-3 overflow-hidden rounded-full bg-chip" aria-hidden>
        {rows.map((r) => (
          <span key={r.a.id} className="h-full [&+&]:ml-0.5" style={{ width: `${(Math.max(0, r.total) / all) * 100}%`, background: r.a.color }} />
        ))}
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.a.id} className="relative flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 after:absolute after:bottom-0 after:left-[74px] after:right-0 after:h-px after:bg-sep last:after:hidden">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white" style={{ background: r.a.color }}>
              {r.a.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">
                  {r.a.name} <span className="num ml-1 text-[15px] font-medium text-mut">{Math.round((Math.max(0, r.total) / all) * 100)}%</span>
                </p>
                <p className="num sensitive shrink-0 text-[17px] font-medium tracking-[-0.01em]">{fmtEur(r.total)}</p>
              </div>
              <div className="num sensitive mt-0.5 flex justify-between gap-3 text-[14px] text-mut">
                <span>{r.titoli > 0 ? `Titoli ${fmtEur0(r.titoli)}` : "Solo liquidità"}</span>
                {r.titoli > 0 && Math.abs(r.liquidita) >= 1 && <span>Liquidi {fmtEur0(r.liquidita)}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
