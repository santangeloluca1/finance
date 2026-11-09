"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Logo } from "@/components/ui";
import type { Instrument } from "@/lib/engine/types";
import { fmtDate, fmtEur0, fmtN, fmtSignedPct } from "@/lib/format";
import type { MonthWrap } from "@/lib/wrap";

export const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Durata di ogni schermata. */
const STEP_MS = 6000;

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const signedEur = (n: number) => `${n >= 0 ? "+" : "−"}${fmtEur0(Math.abs(n))}`;
/** "A ottobre" ma "Ad aprile". */
const inMonth = (m: string) => `${/^[aeiou]/.test(m) ? "Ad" : "A"} ${m}`;

const BG = {
  cover: "radial-gradient(120% 80% at 10% 0%, #8b5cf6 0%, transparent 60%), radial-gradient(100% 70% at 100% 100%, #ec4899 0%, transparent 55%), #1e1145",
  up: "radial-gradient(110% 70% at 0% 0%, #34d399 0%, transparent 60%), radial-gradient(90% 60% at 100% 100%, #0ea5e9 0%, transparent 60%), #052e22",
  down: "radial-gradient(110% 70% at 0% 0%, #fb7185 0%, transparent 60%), radial-gradient(90% 60% at 100% 100%, #f59e0b 0%, transparent 60%), #3b0a14",
  bench: "radial-gradient(110% 70% at 100% 0%, #6366f1 0%, transparent 60%), radial-gradient(90% 60% at 0% 100%, #22d3ee 0%, transparent 60%), #0b1440",
  star: "radial-gradient(110% 70% at 50% 0%, #2dd4bf 0%, transparent 60%), radial-gradient(90% 60% at 100% 100%, #a3e635 0%, transparent 55%), #062a2a",
  days: "radial-gradient(110% 70% at 0% 100%, #f97316 0%, transparent 60%), radial-gradient(90% 60% at 100% 0%, #facc15 0%, transparent 55%), #2a1205",
  income: "radial-gradient(110% 70% at 100% 0%, #fbbf24 0%, transparent 60%), radial-gradient(90% 60% at 0% 100%, #f472b6 0%, transparent 55%), #33200a",
  activity: "radial-gradient(110% 70% at 0% 0%, #60a5fa 0%, transparent 60%), radial-gradient(90% 60% at 100% 100%, #a78bfa 0%, transparent 55%), #0c1630",
  end: "radial-gradient(120% 80% at 50% 0%, #7c5cff 0%, transparent 60%), #0b0b12",
};

interface Slide {
  id: string;
  bg: string;
  body: ReactNode;
}

/** Entrata a cascata degli elementi di una schermata. */
function In({ i = 0, className = "", children }: { i?: number; className?: string; children: ReactNode }) {
  return (
    <div className={`wrap-in ${className}`} style={{ animationDelay: `${120 + i * 160}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

const Kicker = ({ children }: { children: ReactNode }) => <p className="text-[15px] font-semibold uppercase tracking-[0.14em] text-white/70">{children}</p>;
const Huge = ({ children }: { children: ReactNode }) => <p className="num sensitive text-[64px] font-extrabold leading-[1.02] tracking-[-0.04em]">{children}</p>;
const Line = ({ children }: { children: ReactNode }) => <p className="text-[22px] font-semibold leading-snug tracking-[-0.01em]">{children}</p>;
const Note = ({ children }: { children: ReactNode }) => <p className="text-[17px] leading-snug text-white/75">{children}</p>;

/**
 * Racconto del mese a schermo intero, a schermate come le storie: tocco a
 * destra per andare avanti, a sinistra per tornare, dito appoggiato per
 * fermare. Avanza da solo.
 */
export function MonthStory({ wrap, bench, instruments, onClose }: { wrap: MonthWrap; bench: { label: string; ret: number } | null; instruments: Instrument[]; onClose: () => void }) {
  const month = MONTHS[Number(wrap.key.slice(5, 7)) - 1];
  const year = wrap.key.slice(0, 4);
  const names = useMemo(() => new Map(instruments.map((i) => [i.isin, i])), [instruments]);
  const nameOf = (isin: string) => names.get(isin)?.shortName ?? names.get(isin)?.name ?? isin;

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const up = wrap.ret >= 0;
    out.push({
      id: "cover",
      bg: BG.cover,
      body: (
        <>
          <In><Kicker>Il tuo</Kicker></In>
          <In i={1}><p className="text-[76px] font-extrabold leading-[0.95] tracking-[-0.05em]">{cap(month)}</p></In>
          <In i={2}><p className="num text-[40px] font-bold tracking-[-0.03em] text-white/60">{year}</p></In>
          <In i={4} className="mt-10"><Note>Un mese di portafoglio, in poche schermate.</Note></In>
        </>
      ),
    });

    const rankLine = !wrap.rank
      ? null
      : wrap.rank.pos === 1
        ? `Il mese migliore del ${year}, finora.`
        : wrap.rank.pos === wrap.rank.of
          ? `Il mese più difficile del ${year}.`
          : `${wrap.rank.pos}° mese su ${wrap.rank.of} nel ${year}.`;
    out.push({
      id: "ret",
      bg: up ? BG.up : BG.down,
      body: (
        <>
          <In><Line>{inMonth(month)} il portafoglio ha fatto</Line></In>
          <In i={1} className="mt-4"><Huge>{fmtSignedPct(wrap.ret)}</Huge></In>
          <In i={2} className="mt-2"><p className="num sensitive text-[30px] font-bold tracking-[-0.02em] text-white/85">{signedEur(wrap.gain)}</p></In>
          {rankLine && <In i={4} className="mt-10"><Note>{rankLine}</Note></In>}
        </>
      ),
    });

    if (bench) {
      const diff = wrap.ret - bench.ret;
      const points = fmtN(Math.abs(diff * 100), { maximumFractionDigits: 1 });
      out.push({
        id: "bench",
        bg: BG.bench,
        body: (
          <>
            <In><Kicker>Tu contro il mercato</Kicker></In>
            <In i={1} className="mt-6 space-y-5">
              <div>
                <p className="text-[17px] text-white/70">Il tuo portafoglio</p>
                <p className="num text-[44px] font-extrabold tracking-[-0.03em]">{fmtSignedPct(wrap.ret)}</p>
              </div>
              <div>
                <p className="text-[17px] text-white/70">{bench.label}</p>
                <p className="num text-[44px] font-extrabold tracking-[-0.03em] text-white/70">{fmtSignedPct(bench.ret)}</p>
              </div>
            </In>
            <In i={3} className="mt-10">
              <Line>{Math.abs(diff) < 0.0005 ? "Pari con il mercato." : diff > 0 ? `Hai battuto il mercato di ${points} punti percentuali.` : `Il mercato ha fatto meglio di ${points} punti percentuali.`}</Line>
            </In>
          </>
        ),
      });
    }

    const top = wrap.titles[0];
    const worst = wrap.titles.at(-1);
    if (top && top.change > 0) {
      out.push({
        id: "star",
        bg: BG.star,
        body: (
          <>
            <In><Kicker>Il protagonista</Kicker></In>
            <In i={1} className="mt-8">
              <div className="inline-flex rounded-full bg-white p-1.5 shadow-2xl">
                <Logo isin={top.isin} name={nameOf(top.isin)} size={84} />
              </div>
            </In>
            <In i={2} className="mt-6"><p className="text-[34px] font-extrabold leading-tight tracking-[-0.03em]">{nameOf(top.isin)}</p></In>
            <In i={3} className="mt-2"><p className="num sensitive text-[30px] font-bold">{signedEur(top.change)}</p></In>
            <In i={3}><Note>{fmtSignedPct(top.pct)} nel mese</Note></In>
            {worst && worst !== top && worst.change < 0 && (
              <In i={5} className="mt-10">
                <Note>
                  Ha frenato <b className="text-white">{nameOf(worst.isin)}</b>, <span className="num sensitive">{signedEur(worst.change)}</span>.
                </Note>
              </In>
            )}
          </>
        ),
      });
    }

    if (wrap.bestDay) {
      const day = (d: string) => fmtDate(d, { weekday: "long", day: "numeric", month: "long" });
      out.push({
        id: "days",
        bg: BG.days,
        body: (
          <>
            <In><Kicker>Il giorno migliore</Kicker></In>
            <In i={1} className="mt-4"><Line>{cap(day(wrap.bestDay.date))}</Line></In>
            <In i={2} className="mt-2"><Huge>{signedEur(wrap.bestDay.gain)}</Huge></In>
            <In i={2}><Note>{fmtSignedPct(wrap.bestDay.pct)} in una seduta</Note></In>
            {wrap.worstDay && (
              <In i={4} className="mt-12">
                <p className="text-[15px] font-semibold uppercase tracking-[0.14em] text-white/60">Il più difficile</p>
                <p className="mt-1 text-[19px] font-semibold">
                  {cap(day(wrap.worstDay.date))}, <span className="num sensitive">{signedEur(wrap.worstDay.gain)}</span>
                </p>
              </In>
            )}
          </>
        ),
      });
    }

    if (wrap.dividends.total > 0) {
      const payers = [...new Set(wrap.dividends.items.map((d) => d.isin))];
      out.push({
        id: "income",
        bg: BG.income,
        body: (
          <>
            <In><Line>Ti hanno pagato</Line></In>
            <In i={1} className="mt-3"><Huge>{fmtEur0(wrap.dividends.total)}</Huge></In>
            <In i={2}><Note>di cedole e dividendi, già netti.</Note></In>
            <In i={4} className="mt-10 flex flex-wrap gap-2">
              {payers.map((isin) => (
                <span key={isin} className="rounded-full bg-white/15 px-3.5 py-1.5 text-[15px] font-semibold">
                  {nameOf(isin)}
                </span>
              ))}
            </In>
          </>
        ),
      });
    }

    if (wrap.bought.count || wrap.sold.count || wrap.deposits > 0) {
      out.push({
        id: "activity",
        bg: BG.activity,
        body: (
          <>
            <In><Kicker>Le tue mosse</Kicker></In>
            <div className="mt-8 space-y-7">
              {wrap.bought.count > 0 && (
                <In i={1}>
                  <p className="num sensitive text-[44px] font-extrabold tracking-[-0.03em]">{fmtEur0(wrap.bought.total)}</p>
                  <Note>investiti in {wrap.bought.count === 1 ? "un acquisto" : `${wrap.bought.count} acquisti`}</Note>
                </In>
              )}
              {wrap.sold.count > 0 && (
                <In i={2}>
                  <p className="num sensitive text-[44px] font-extrabold tracking-[-0.03em]">{fmtEur0(wrap.sold.total)}</p>
                  <Note>incassati con {wrap.sold.count === 1 ? "una vendita" : `${wrap.sold.count} vendite`}</Note>
                </In>
              )}
              {wrap.deposits > 0 && (
                <In i={3}>
                  <p className="num sensitive text-[44px] font-extrabold tracking-[-0.03em]">{fmtEur0(wrap.deposits)}</p>
                  <Note>versati sui conti</Note>
                </In>
              )}
            </div>
          </>
        ),
      });
    }

    const stats: [string, string][] = [
      ["Rendimento", fmtSignedPct(wrap.ret)],
      ["Guadagno", signedEur(wrap.gain)],
      ["Patrimonio a fine mese", fmtEur0(wrap.endValue)],
      ...(wrap.dividends.total > 0 ? [["Cedole", fmtEur0(wrap.dividends.total)] as [string, string]] : []),
      ...(top && top.change > 0 ? [["Protagonista", nameOf(top.isin)] as [string, string]] : []),
    ];
    out.push({
      id: "end",
      bg: BG.end,
      body: (
        <>
          <In><Kicker>{cap(month)} {year}</Kicker></In>
          <In i={1} className="mt-2"><p className="text-[40px] font-extrabold leading-tight tracking-[-0.03em]">In una schermata</p></In>
          <In i={2} className="mt-8 overflow-hidden rounded-[20px] bg-white/10">
            {stats.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-white/10 px-5 py-3.5 last:border-0">
                <span className="text-[16px] text-white/70">{k}</span>
                <span className="num sensitive truncate text-[19px] font-bold">{v}</span>
              </div>
            ))}
          </In>
          <In i={4} className="mt-8">
            <button onClick={onClose} className="h-12 w-full rounded-full bg-white text-[17px] font-bold text-[#0b0b12] active:opacity-80">
              Chiudi
            </button>
          </In>
        </>
      ),
    });
    return out;
    // nameOf dipende solo da names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrap, bench, names, month, year, onClose]);

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const pressedAt = useRef(0);
  const lastIdx = slides.length - 1;

  const next = useCallback(() => setIdx((i) => Math.min(i + 1, lastIdx)), [lastIdx]);
  const prev = useCallback(() => setIdx((i) => Math.max(i - 1, 0)), []);

  // Tastiera e scorrimento della pagina sotto bloccato.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [next, prev, onClose]);

  const slide = slides[idx];
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Il tuo ${month} ${year}`} className="fixed inset-0 z-[100] text-white" style={{ background: slide.bg, transition: "background 0.5s ease" }}>
      {/* Barre di avanzamento */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
        {slides.map((s, i) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            {i < idx && <div className="h-full w-full bg-white" />}
            {i === idx && (
              <div
                key={`${s.id}-${idx}`}
                className="wrap-bar h-full w-full bg-white"
                style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: paused || idx === lastIdx ? "paused" : "running" }}
                onAnimationEnd={next}
              />
            )}
          </div>
        ))}
      </div>
      <button
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute right-2 z-30 flex h-11 w-11 items-center justify-center text-white/90 active:opacity-60"
        style={{ top: "calc(env(safe-area-inset-top) + 18px)" }}
      >
        <X size={24} />
      </button>

      {/* Zone di tocco: sinistra indietro, destra avanti; dito appoggiato = pausa. */}
      <div
        className="absolute inset-0 z-10"
        onPointerDown={() => {
          pressedAt.current = Date.now();
          setPaused(true);
        }}
        onPointerUp={(e) => {
          setPaused(false);
          if (Date.now() - pressedAt.current > 300) return;
          const x = e.clientX / window.innerWidth;
          if (x < 0.3) prev();
          else next();
        }}
        onPointerCancel={() => setPaused(false)}
        aria-hidden
      />

      <div key={slide.id} className="relative z-20 mx-auto flex h-full max-w-[480px] flex-col justify-center px-7 pb-16 pt-24 [&_button]:pointer-events-auto" style={{ pointerEvents: "none" }}>
        {slide.body}
      </div>

      <span className="sr-only" aria-live="polite">
        Schermata {idx + 1} di {slides.length}
      </span>
    </div>,
    document.body,
  );
}
