"use client";

import { useEffect } from "react";
import { InfoRow, Panel, SectionHeader } from "@/components/ui";
import { fmtDate, fmtEur0, fmtN, fmtPct, fmtSignedPct } from "@/lib/format";
import type { RiskView } from "@/lib/risk-client";
import type { Window } from "@/lib/risk";

const monthYear = (iso: string) => fmtDate(iso, { month: "short", year: "2-digit" });

function monthsBetween(a: string, b: string) {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / (30.44 * 86400_000)));
}

/**
 * Rischio del portafoglio di oggi: quanto puoi perdere in un anno brutto (in euro),
 * come si distribuiscono tutti i periodi di 12 mesi, calo massimo, oscillazione
 * e rendimento per unità di rischio rispetto all'indice scelto.
 */
export function Rischio({ risk, loading, benchLabel, nowFromPeak }: { risk: RiskView | null; loading: boolean; benchLabel: string | null; nowFromPeak: number | null }) {
  const ready = !!risk?.report.worst;
  // Arrivando da "/analisi#rischio" (Home) si scende qui appena i dati ci sono.
  useEffect(() => {
    if (ready && window.location.hash === "#rischio") document.getElementById("rischio")?.scrollIntoView({ block: "start" });
  }, [ready]);

  if (!risk && !loading) return null;
  const head = (
    <SectionHeader id="rischio" right={<span className="text-[13px] text-mut">titoli di oggi · 10 anni</span>}>
      Rischio
    </SectionHeader>
  );
  if (!risk || !risk.report.worst) {
    return (
      <>
        {head}
        <div className="px-4" aria-label="Calcolo del rischio" role="status">
          <span className="skeleton block h-3.5 w-28" />
          <span className="skeleton mt-3 block h-8 w-40" />
          <span className="skeleton mt-3 block h-3.5 w-64" />
          <span className="skeleton mt-6 block h-[72px] w-full" />
        </div>
      </>
    );
  }

  const { report: r, bench: b, invested } = risk;
  const worst = r.worst!;
  const dd = r.drawdown;
  const ratio = r.cagr !== null && r.vol ? r.cagr / r.vol : null;
  const benchRatio = b?.cagr != null && b.vol ? b.cagr / b.vol : null;

  return (
    <>
      {head}
      <div className="px-4">
        <p className="text-[14px] text-mut">In un anno brutto</p>
        <p className="num sensitive mt-1 text-[34px] font-bold leading-none tracking-[-0.03em] text-dn">{fmtEur0(worst.ret * invested)}</p>
        <p className="mt-2 text-[14px] leading-snug text-mut">
          Il peggior anno degli ultimi {Math.round(r.years)}: <span className="num font-semibold text-ink-2">{fmtSignedPct(worst.ret)}</span>, da {monthYear(worst.from)} a {monthYear(worst.to)}.
          {r.bad !== null && r.bad < 0 && (
            <>
              {" "}
              Un anno su 20 va peggio di <span className="num font-semibold text-ink-2">{fmtSignedPct(r.bad)}</span>.
            </>
          )}
        </p>
      </div>

      <YearSpread windows={r.windows} />

      <Panel className="mt-5">
        {dd && (
          <InfoRow
            label="Calo massimo"
            hint={`${monthYear(dd.peak)} → ${monthYear(dd.trough)} · ${dd.recovered ? `risalito in ${monthsBetween(dd.trough, dd.recovered)} mesi` : "non ancora recuperato"}`}
            value={fmtSignedPct(dd.depth)}
            valueClass="text-dn"
          />
        )}
        {nowFromPeak !== null && (
          <InfoRow
            label="Oggi dal massimo"
            hint="Il tuo portafoglio, dal suo punto più alto"
            value={nowFromPeak > -0.0005 ? "Ai massimi" : fmtSignedPct(nowFromPeak)}
            valueClass={nowFromPeak > -0.0005 ? "text-up" : nowFromPeak < -0.1 ? "text-dn" : ""}
          />
        )}
        {r.vol !== null && (
          <InfoRow
            label="Oscillazione annua"
            hint={
              b?.vol && benchLabel
                ? `${benchLabel} ${fmtPct(b.vol)} · ${r.vol < b.vol * 0.97 ? "oscilli meno dell'indice" : r.vol > b.vol * 1.03 ? "oscilli più dell'indice" : "come l'indice"}`
                : "Quanto si muove in un anno tipico"
            }
            value={fmtPct(r.vol)}
          />
        )}
        {ratio !== null && (
          <InfoRow
            label="Rendimento per rischio"
            hint={
              benchRatio !== null && benchLabel
                ? `${benchLabel} ${fmtN(benchRatio, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} · ${ratio >= benchRatio ? "rendi di più per ogni punto di oscillazione" : "l'indice rende di più per ogni punto di oscillazione"}`
                : `${fmtSignedPct(r.cagr!)} l'anno con ${fmtPct(r.vol!)} di oscillazione`
            }
            value={fmtN(ratio, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
            valueClass={benchRatio === null ? "" : ratio >= benchRatio ? "text-up" : "text-dn"}
          />
        )}
      </Panel>
      <p className="px-4 pt-2 text-[13px] leading-snug text-mut">
        Titoli e pesi di oggi sui prezzi reali dal {fmtDate(r.from, { month: "long", year: "numeric" })}.
        {r.proxied >= 0.01 ? ` Per il ${fmtN(r.proxied * 100, { maximumFractionDigits: 0 })}% con uno storico più breve si usa un indice simile.` : ""}
      </p>
    </>
  );
}

/**
 * Tutti i periodi di 12 mesi, raggruppati a passi di 5 punti: a colpo d'occhio
 * quanto spesso un anno finisce in perdita e quanto male può andare.
 */
function YearSpread({ windows }: { windows: Window[] }) {
  if (windows.length < 12) return null;
  const min = Math.min(...windows.map((w) => w.ret));
  const max0 = Math.max(...windows.map((w) => w.ret));
  // Passo "tondo" per avere una quindicina di barre.
  const step = [0.01, 0.02, 0.025, 0.05, 0.1].find((s) => (max0 - min) / s <= 16) ?? 0.2;
  const lo = Math.floor(min / step);
  const hi = Math.floor(max0 / step);
  const buckets = Array.from({ length: hi - lo + 1 }, (_, k) => ({ from: (lo + k) * step, n: 0 }));
  for (const w of windows) buckets[Math.floor(w.ret / step) - lo].n++;
  const max = Math.max(...buckets.map((b) => b.n));
  const losing = windows.filter((w) => w.ret < 0).length / windows.length;
  const zeroAt = (-lo / buckets.length) * 100;

  return (
    <div className="mt-6 px-4">
      <div className="flex h-[64px] items-end gap-[3px]" aria-label={`Periodi di 12 mesi in perdita: ${fmtPct(losing)}`} role="img">
        {buckets.map((b) => (
          <span
            key={b.from}
            className={`grow-y flex-1 rounded-t-[4px] ${b.from < 0 ? "bg-dn" : "bg-up"}`}
            style={{ height: b.n ? `${Math.max(6, (b.n / max) * 100)}%` : 2, opacity: b.n ? 1 : 0.25, transformOrigin: "bottom" }}
          />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-mut">
        <span className="num absolute left-0">{axis(lo * step)}</span>
        {zeroAt > 12 && zeroAt < 88 && (
          <span className="num absolute -translate-x-1/2" style={{ left: `${zeroAt}%` }}>
            0%
          </span>
        )}
        <span className="num absolute right-0">{axis((hi + 1) * step)}</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-mut">
        Tutti i periodi di 12 mesi: <span className="num font-semibold text-dn">{fmtN(losing * 100, { maximumFractionDigits: 0 })}%</span> finiti in perdita.
      </p>
    </div>
  );
}

function axis(v: number) {
  const n = Math.round(v * 100);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;
}
