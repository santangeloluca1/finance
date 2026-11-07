"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Orb } from "@/components/advisor/Orb";
import { usePortfolioView, ALL } from "@/components/PortfolioProvider";
import { Toolbar } from "@/components/home/Toolbar";
import { BankDot, Logo, PAGE_TITLE, SelectButton } from "@/components/ui";
import { BigAmount } from "@/components/BigAmount";
import { isFundLike, TAX_RATE } from "@/lib/engine/tax";
import { usableLosses } from "@/lib/engine/portfolio";
import { fmtDate, fmtEur, fmtSignedEur } from "@/lib/format";

const BOLLO_RATE = 0.002;
const CAPITAL = "#22b8cf";

/**
 * Fisco: imposte dell'anno e da dove vengono, zainetto delle minusvalenze con
 * le scadenze e i titoli con cui recuperarle, costi annui stimati.
 */
export default function Fisco() {
  const view = usePortfolioView();
  const { state, views, data } = view;
  const today = new Date().toISOString().slice(0, 10);
  const years = useMemo(() => {
    const ys = new Set([today.slice(0, 4), ...(state?.realized.map((r) => r.date.slice(0, 4)) ?? []), ...Object.keys(state?.incomeByYear ?? {})]);
    return [...ys].sort().reverse();
  }, [state, today]);
  const [year, setYear] = useState(years[0]);

  const header = (
    <>
      <div className="flex items-center justify-between pr-4">
        <h1 className={`px-4 py-1 ${PAGE_TITLE}`}>Fisco</h1>
        <Link href="/consulente/analisi?a=fisco" className="press flex h-9 items-center gap-2 rounded-full bg-chip pl-1.5 pr-3.5 text-[14px] font-semibold text-ink">
          <Orb size={24} /> Minerva
        </Link>
      </div>
      <Toolbar
        filter={ALL}
        setFilter={() => {}}
        view={view}
        showFilters={false}
        left={<SelectButton label="Anno" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y === today.slice(0, 4) ? `${y} · in corso` : y }))} />}
      />
    </>
  );
  if (!state) return header;

  const yr = state.realized.filter((r) => r.date.startsWith(year));
  const plusDiversi = sum(yr.filter((r) => r.gain > 0 && r.kind === "redditi_diversi").map((r) => r.gain));
  const plusCapitale = sum(yr.filter((r) => r.gain > 0 && r.kind === "redditi_capitale").map((r) => r.gain));
  const minus = sum(yr.filter((r) => r.gain < 0).map((r) => r.gain));
  const taxes = sum(yr.map((r) => r.tax));
  const income = state.incomeByYear[year] ?? 0;
  const net = plusDiversi + plusCapitale + minus - taxes + income;
  const gross = plusDiversi + plusCapitale + income;

  const nextYearEnd = `${Number(today.slice(0, 4)) + 1}-12-31`;
  const backpack = data.accounts.map((acc) => ({ acc, lots: usableLosses(state.losses, acc.id, today) })).filter((b) => b.lots.length);
  const backpackTotal = sum(backpack.flatMap((b) => b.lots.map((l) => l.remaining)));

  const bollo = data.accounts
    .map((acc) => ({ acc, value: sum(views.filter((v) => v.position.account === acc.id).map((v) => v.value)) }))
    .filter((b) => b.value > 0);
  const terCost = sum(views.map((v) => (v.value * (v.instrument.ter ?? 0)) / 100));
  const bolloTotal = sum(bollo.map((b) => b.value * BOLLO_RATE));

  const parts = [
    { key: "diversi", label: "Plusvalenze · redditi diversi", hint: "Azioni, obbligazioni, ETC: si compensano con lo zainetto", value: plusDiversi, color: "var(--accent)" },
    { key: "capitale", label: "Plusvalenze · redditi di capitale", hint: "ETF e fondi: non si compensano", value: plusCapitale, color: CAPITAL },
    { key: "cedole", label: "Cedole e dividendi", hint: "Già al netto delle tasse", value: income, color: "var(--up)" },
  ];

  return (
    <div>
      {header}

      {/* Tasse pagate nell'anno e guadagno netto: sotto, il conto che li lega */}
      <div className="flex items-end justify-between gap-3 px-4 pt-5">
        <div className="min-w-0">
          <p className="text-[14px] text-mut">Tasse pagate{year === today.slice(0, 4) ? " quest'anno" : ` nel ${year}`}</p>
          <BigAmount value={taxes} className="mt-1" />
        </div>
        <div className={`num sensitive shrink-0 pb-1 text-right ${net > 0.005 ? "text-up" : net < -0.005 ? "text-dn" : "text-mut"}`}>
          <p className="text-[17px] font-semibold">{fmtSignedEur(net)}</p>
          <p className="text-[13px] font-medium text-mut">guadagno netto</p>
        </div>
      </div>
      <p className="num sensitive mt-3 px-4 text-[14px] leading-relaxed text-mut">
        Plusvalenze <span className="text-ink-2">{fmtEur(plusDiversi + plusCapitale)}</span>
        {income > 0 && (
          <>
            {" "}+ cedole <span className="text-ink-2">{fmtEur(income)}</span>
          </>
        )}
        {minus < 0 && (
          <>
            {" "}− minus <span className="text-ink-2">{fmtEur(-minus)}</span>
          </>
        )}{" "}
        − tasse <span className="text-ink-2">{fmtEur(taxes)}</span> = <span className="font-semibold text-ink">{fmtEur(net)}</span>
        <span className="block text-[13px]">Le tasse le trattiene la banca quando vendi in guadagno; sulle cedole sono già tolte.</span>
      </p>

      {/* Da dove vengono: barra unica e righe */}
      <Section title="Da dove vengono" desc={`Cosa hai incassato nel ${year}, vendendo e con le cedole.`}>
      {gross > 0 && (
        <div className="mx-4 mb-2 flex h-3 overflow-hidden rounded-full bg-chip" aria-hidden>
          {parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span key={p.key} className="h-full [&+&]:ml-0.5" style={{ width: `${(p.value / gross) * 100}%`, background: p.color }} />
            ))}
        </div>
      )}
      <ul>
        {parts.map((p) => (
          <Row key={p.key} color={p.color} label={p.label} hint={p.hint} value={fmtSignedEur(p.value)} valueClass={p.value > 0 ? "text-up" : "text-mut"} />
        ))}
        <Row color="var(--faint)" label="Minusvalenze" hint="Finiscono nello zainetto fiscale" value={fmtSignedEur(minus)} valueClass={minus < 0 ? "text-dn" : "text-mut"} />
      </ul>
      </Section>

      {/* Zainetto */}
      <Section
        title="Zainetto fiscale"
        right={<span className={`num sensitive text-[17px] font-semibold ${backpackTotal > 0 ? "text-warn" : "text-mut"}`}>{fmtEur(backpackTotal)}</span>}
        desc={backpack.length ? "Minusvalenze da recuperare entro 4 anni con plus di azioni, obbligazioni o ETC sulla stessa banca." : "Nessuna minusvalenza da recuperare."}
      >
      {backpack.length > 0 && (
        <>
          {backpack.map(({ acc, lots }) => {
            const available = sum(lots.map((l) => l.remaining));
            const candidates = views.filter((v) => v.position.account === acc.id && !isFundLike(v.instrument) && Math.min(v.unrealized, available) * TAX_RATE >= 0.5);
            const soon = lots.some((l) => l.expires <= nextYearEnd);
            return (
              <div key={acc.id} className="pt-4">
                <p className="flex items-center justify-between px-4 pb-1 text-[13px] font-semibold uppercase tracking-[0.04em] text-mut">
                  <span className="flex items-center gap-2">
                    <BankDot color={acc.color} size={8} /> {acc.name}
                  </span>
                  <span className="num sensitive normal-case tracking-normal">{fmtEur(available)}</span>
                </p>
                <ul>
                  {lots.map((l, i) => {
                    const total = daysBetween(l.date, l.expires);
                    const left = daysBetween(today, l.expires);
                    const expiring = l.expires <= nextYearEnd;
                    const name = data.instruments.find((x) => x.isin === l.sourceIsin)?.shortName ?? l.sourceIsin;
                    return (
                      <li key={i} className="relative px-4 py-3 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-sep last:after:hidden">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-[17px] font-semibold">{name}</p>
                          <p className="num sensitive shrink-0 text-[17px] font-medium">{fmtEur(l.remaining)}</p>
                        </div>
                        <p className="mt-0.5 flex justify-between text-[14px] text-mut">
                          <span>Da {fmtDate(l.date, { month: "short", year: "numeric" })}</span>
                          <span className={expiring ? "font-medium text-dn" : ""}>scade {fmtDate(l.expires, { month: "short", year: "numeric" })}</span>
                        </p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip">
                          <div className={`h-full rounded-full ${expiring ? "bg-dn" : "bg-warn"}`} style={{ width: `${Math.max(3, Math.min(100, (left / total) * 100))}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {candidates.length > 0 ? (
                  <>
                    <p className={`flex items-center gap-1.5 px-4 pb-1 pt-3 text-[14px] font-medium ${soon ? "text-warn" : "text-mut"}`}>
                      {soon && <AlertTriangle size={15} />}
                      Recuperale vendendo e ricomprando
                    </p>
                    <ul>
                      {candidates.map((c) => (
                        <li key={c.instrument.isin}>
                          <Link href={`/posizioni/${c.instrument.isin}`} className="flex min-h-[60px] items-center gap-3.5 px-4 py-2 active:bg-panel-2">
                            <Logo isin={c.instrument.isin} name={c.instrument.shortName ?? c.instrument.name} size={40} />
                            <p className="min-w-0 flex-1 truncate text-[16px] font-semibold">{c.instrument.shortName ?? c.instrument.name}</p>
                            <p className="num sensitive shrink-0 text-[15px] font-medium text-up">risparmi {fmtEur(Math.min(c.unrealized, available) * TAX_RATE)}</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="px-4 pt-2 text-[13px] leading-snug text-mut">
                    Su {acc.name} non hai plus compensabili adesso: quelle degli ETF non valgono.
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}

      </Section>

      {/* Costi */}
      <Section id="costi" title="Costi annui stimati" right={<span className="num sensitive text-[17px] font-semibold">{fmtEur(terCost + bolloTotal)}</span>} desc="Quanto ti costa all'anno tenere il portafoglio, ai valori di oggi.">
      <ul>
        {bollo.map(({ acc, value }) => (
          <Row key={acc.id} color={acc.color} label={`Bollo ${acc.name}`} hint="0,2% del valore" value={fmtEur(value * BOLLO_RATE)} valueClass="" />
        ))}
        <Row color="var(--faint)" label="Costi di gestione degli ETF" hint="TER sul valore attuale" value={fmtEur(terCost)} valueClass="" />
      </ul>

      </Section>

      <p className="px-6 pb-2 pt-8 text-center text-[12px] leading-relaxed text-mut">Stime con il prezzo medio ponderato per banca. Fa fede il calcolo dell&apos;intermediario.</p>
    </div>
  );
}

/** Sezione separata da una fascia: titolo, totale a destra e una riga che dice cosa contiene. */
function Section({ id, title, right, desc, children }: { id?: string; title: string; right?: ReactNode; desc?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="h-2 bg-panel" aria-hidden />
      <div className="flex items-center justify-between px-4 pb-1 pt-7">
        <h2 id={id} className="text-[22px] font-bold tracking-[-0.025em]">
          {title}
        </h2>
        {right}
      </div>
      {desc && <p className="px-4 pb-2 text-[14px] leading-snug text-mut">{desc}</p>}
      {children}
    </section>
  );
}

function Row({ color, label, hint, value, valueClass }: { color: string; label: string; hint: string; value: string; valueClass: string }) {
  return (
    <li className="relative flex min-h-[60px] items-center gap-3 px-4 py-2.5 after:absolute after:bottom-0 after:left-[38px] after:right-0 after:h-px after:bg-sep last:after:hidden">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-medium">{label}</p>
        <p className="text-[13px] leading-snug text-mut">{hint}</p>
      </div>
      <p className={`num sensitive shrink-0 text-[16px] font-semibold ${valueClass}`}>{value}</p>
    </li>
  );
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

function daysBetween(a: string, b: string) {
  return Math.max(1, (Date.parse(b) - Date.parse(a)) / 86400_000);
}
