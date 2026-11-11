"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BackLink, LargeTitle, Logo, SectionHeader } from "@/components/ui";
import { fmtPct, fmtPrice, fmtSignedPct } from "@/lib/format";
import { POPULAR, TYPE_LABEL, type Popular } from "@/lib/popular";

interface Result {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
  isin: string | null;
  currency: string | null;
  price: number | null;
  change: number | null;
}

const RECENT_KEY = "portafoglio:recent-search:v1";

/** Nome breve leggibile: senza "UCITS ETF (Acc)" e simili. */
function shortName(name: string) {
  return name.replace(/\b(UCITS|ETF|Acc|Dist|Accumulation|Distributing)\b|\(.*?\)/gi, "").replace(/\s+/g, " ").trim().slice(0, 36) || name;
}

/** Indirizzo della scheda: quella del portafoglio se lo possiedi, altrimenti la scheda di consultazione. */
function hrefFor(r: Result) {
  const q = new URLSearchParams({ t: r.ticker, n: shortName(r.name), c: r.currency ?? "EUR", k: r.type });
  return `/posizioni/${encodeURIComponent(r.isin ?? r.ticker)}?${q}`;
}

function readRecent(): Result[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Result[];
  } catch {
    return [];
  }
}

export default function Cerca() {
  const router = useRouter();
  const { data } = usePortfolioCtx();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Result[]>([]);
  useEffect(() => setRecent(readRecent()), []);

  // Titoli già in portafoglio che corrispondono alla ricerca.
  const mine = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return data.instruments.filter((i) => [i.name, i.shortName, i.ticker, i.isin].some((v) => v?.toLowerCase().includes(s))).slice(0, 4);
  }, [q, data.instruments]);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    let stop = false;
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(s)}`)
        .then((r) => r.json())
        .then((j: { results: Result[] }) => !stop && setResults(j.results.filter((r) => !data.instruments.some((i) => i.ticker === r.ticker))))
        .catch(() => !stop && setResults([]))
        .finally(() => !stop && setBusy(false));
    }, 300);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [q, data.instruments]);

  const open = (r: Result) => {
    const next = [r, ...readRecent().filter((x) => x.ticker !== r.ticker)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    router.push(hrefFor(r));
  };

  const removeRecent = (ticker: string) => {
    const next = readRecent().filter((x) => x.ticker !== ticker);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    setRecent(next);
  };

  // Suggerimenti: quotazioni dei titoli più seguiti (per le maggiori variazioni di oggi).
  const [popQuotes, setPopQuotes] = useState<Record<string, { price: number; previousClose: number; currency: string }>>({});
  useEffect(() => {
    const t = POPULAR.map((p) => (p.currency === "EUR" && p.isin ? `${p.ticker}~${p.isin}` : p.ticker)).join(",");
    fetch(`/api/quotes?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((j) => setPopQuotes(j.quotes ?? {}))
      .catch(() => {});
  }, []);
  const asResult = (p: Popular): Result => {
    const qt = popQuotes[p.ticker];
    return { ticker: p.ticker, name: p.name, exchange: "", type: p.type, isin: p.isin ?? null, currency: qt?.currency ?? p.currency, price: qt?.price ?? null, change: qt?.previousClose ? qt.price / qt.previousClose - 1 : null };
  };
  const movers = POPULAR.map(asResult)
    .filter((r) => r.change !== null)
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
    .slice(0, 6);

  const empty = q.trim().length < 2;

  return (
    <div>
      <BackLink href="/" label="Home" />
      <LargeTitle>Cerca</LargeTitle>

      <label className="mx-4 flex h-11 items-center gap-2.5 rounded-[12px] bg-chip px-3.5">
        <Search size={18} className="shrink-0 text-mut" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titolo, ETF, ticker o ISIN"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
        />
        {busy ? (
          <LoaderCircle size={17} className="shrink-0 animate-spin text-mut" />
        ) : (
          q && (
            <button onClick={() => setQ("")} aria-label="Cancella la ricerca" className="hit relative -mr-1 flex h-8 w-8 items-center justify-center text-mut">
              <X size={17} />
            </button>
          )
        )}
      </label>

      {empty ? (
        <>
          {/* Maggiori variazioni di oggi tra i titoli più seguiti: schede scorrevoli. */}
          <p className="px-4 pb-3 pt-7 text-[15px] text-mut">Più mossi oggi tra i popolari</p>
          <div className="no-scrollbar flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1">
            {movers.length
              ? movers.map((r, i) => (
                  <button
                    key={r.ticker}
                    onClick={() => open(r)}
                    className="press page-in flex h-[172px] w-[148px] shrink-0 snap-start flex-col rounded-[18px] border border-sep p-4 text-left"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <Logo isin={r.isin ?? r.ticker} name={r.name} size={44} />
                    <p className="mt-auto line-clamp-2 text-[17px] font-bold leading-tight">{r.name}</p>
                    <p className={`num mt-2 text-[16px] font-medium ${r.change! > 0 ? "text-up" : "text-dn"}`}>
                      {r.change! > 0 ? "↗ " : "↘ "}
                      {fmtPct(Math.abs(r.change!))}
                    </p>
                  </button>
                ))
              : Array.from({ length: 3 }, (_, i) => <span key={i} className="skeleton h-[172px] w-[148px] shrink-0 rounded-[18px]" />)}
          </div>

          {recent.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-8 text-[15px] text-mut">Ultime ricerche</p>
              <ul className="stagger">
                {recent.map((r) => (
                  <li key={r.ticker} className="flex items-center">
                    <button onClick={() => open(r)} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3.5 py-2.5 pl-4 text-left active:bg-panel-2">
                      <Logo isin={r.isin ?? r.ticker} name={shortName(r.name)} size={44} />
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-semibold">{shortName(r.name)}</p>
                        <p className="flex items-center gap-2 text-[14px] text-mut">
                          <span className="num">{r.ticker.split(".")[0]}</span>
                          <TypeChip type={r.type} />
                        </p>
                      </div>
                    </button>
                    <button onClick={() => removeRecent(r.ticker)} aria-label={`Togli ${shortName(r.name)} dalle ricerche recenti`} className="flex h-11 w-12 shrink-0 items-center justify-center text-ink-2 active:opacity-50">
                      <X size={20} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="px-4 pb-1 pt-8 text-[15px] text-mut">Titoli popolari</p>
          <ul className="stagger">
            {POPULAR.slice(0, 10).map((p) => (
              <ResultRow key={p.ticker} r={asResult(p)} chip onClick={() => open(asResult(p))} />
            ))}
          </ul>
        </>
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <SectionHeader>Nel tuo portafoglio</SectionHeader>
              <ul className="stagger">
                {mine.map((i) => (
                  <li key={i.isin}>
                    <Link href={`/posizioni/${i.isin}`} className="flex min-h-[60px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
                      <Logo isin={i.isin} name={i.shortName ?? i.name} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-semibold">{i.shortName ?? i.name}</p>
                        <p className="num truncate text-[14px] text-mut">{i.ticker}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {(results.length > 0 || !busy) && <SectionHeader>Risultati</SectionHeader>}
          {results.length > 0 ? (
            <ul className="stagger">
              {results.map((r) => (
                <ResultRow key={r.ticker} r={r} onClick={() => open(r)} />
              ))}
            </ul>
          ) : (
            !busy && <p className="px-4 text-[15px] text-mut">Nessun risultato. Prova con l&apos;ISIN o il ticker.</p>
          )}
        </>
      )}
    </div>
  );
}

function ResultRow({ r, onClick, icon, chip }: { r: Result; onClick: () => void; icon?: boolean; chip?: boolean }) {
  const name = shortName(r.name);
  return (
    <li>
      <button onClick={onClick} className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-panel-2">
        <Logo isin={r.isin ?? r.ticker} name={name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">{name}</p>
          <p className="num flex items-center gap-2 truncate text-[14px] text-mut">
            <span>
              {r.ticker.split(".")[0]}
              {r.exchange ? ` · ${r.exchange}` : ""}
            </span>
            {(chip || !r.exchange) && <TypeChip type={r.type} />}
          </p>
        </div>
        {/* Nei recenti il prezzo sarebbe vecchio: si vede aprendo la scheda. */}
        {r.price !== null && !icon && (
          <div className="shrink-0 text-right">
            <p className="num text-[16px] font-medium">{fmtPrice(r.price, r.currency ?? "EUR")}</p>
            {r.change !== null && r.change !== undefined && (
              <p className={`num text-[13px] font-medium ${r.change > 0.00005 ? "text-up" : r.change < -0.00005 ? "text-dn" : "text-mut"}`}>{fmtSignedPct(r.change)}</p>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

function TypeChip({ type }: { type: string }) {
  const label = TYPE_LABEL[type];
  return label ? <span className="rounded-full bg-chip px-2 py-px text-[12px] font-medium text-mut">{label}</span> : null;
}
