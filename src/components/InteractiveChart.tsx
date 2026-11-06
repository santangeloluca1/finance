"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface SeriesPoint {
  date: string;
  value: number;
  /** Capitale investito (linea opzionale). */
  invested?: number;
}

export interface ChartEvent {
  date: string;
  kind: "buy" | "sell" | "dividend";
  label: string;
}

/** Selezione corrente: un punto (a) oppure un intervallo (a → b). */
export interface Selection {
  a: number;
  b: number | null;
}

interface Props {
  points: SeriesPoint[];
  height?: number;
  format: (v: number) => string;
  /** Formato breve per le etichette dell'asse (es. "58k"). */
  formatAxis?: (v: number) => string;
  /** Linea tratteggiata di riferimento; di default il primo valore. */
  reference?: number;
  showInvested?: boolean;
  events?: ChartEvent[];
  /** Linea orizzontale etichettata (es. prezzo medio di carico). */
  marker?: { value: number; label: string };
  onSelect?: (s: Selection | null) => void;
  loading?: boolean;
  /** Riga principale della bolla per un punto (default: valore formattato). */
  describePoint?: (i: number) => string;
  /** Riga principale della bolla per un intervallo (default: differenza e %). */
  describeRange?: (a: number, b: number) => string;
  /** Andamento tra due indici (positivo = verde). Di default la differenza di valore. */
  trend?: (a: number, b: number) => number;
  /** Seconda serie da confrontare (es. un indice), stessa lunghezza dei punti. */
  compare?: (number | null)[];
}

/** Altezza dell'asse delle date e larghezza della colonna dei valori a destra. */
const AXIS_H = 34;
const GUTTER = 50;
const EVENT_COLOR = { buy: "var(--accent)", sell: "var(--warn)", dividend: "var(--up)" } as const;
const EVENT_LABEL = { buy: "Acquisto", sell: "Vendita", dividend: "Cedola" } as const;

/**
 * Grafico navigabile:
 * - un dito (o il mouse) scorre sulla linea del tempo con una riga verticale allineata al punto;
 * - due dita (o trascinando col mouse) selezionano un intervallo e mostrano la variazione tra le due date;
 * - frecce ← → da tastiera quando il grafico ha il focus.
 */
export function InteractiveChart({ points, height = 220, format, formatAxis, reference, showInvested, events = [], marker, onSelect, loading, describePoint, describeRange, trend, compare }: Props) {
  const gid = useId().replace(/:/g, "");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<Selection | null>(null);
  const pointers = useRef(new Map<number, number>());
  const dragAnchor = useRef<number | null>(null);

  // Il contenitore compare solo quando ci sono dati: lo misuriamo appena esiste.
  useEffect(() => {
    if (!box) return;
    setWidth(box.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const H = height - AXIS_H;
  const plotW = Math.max(0, width - GUTTER);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.value);
    if (showInvested) points.forEach((p) => p.invested !== undefined && vals.push(p.invested));
    const base = reference ?? points[0].value;
    vals.push(base);
    if (marker) vals.push(marker.value);
    compare?.forEach((v) => v !== null && Number.isFinite(v) && vals.push(v));
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min || Math.abs(max) || 1) * 0.1;
    min -= pad;
    max += pad;
    const top = 14;
    const h = H - top - 6;
    const x = (i: number) => (i / (points.length - 1)) * plotW;
    const y = (v: number) => top + h - ((v - min) / (max - min)) * h;
    const path = (get: (p: SeriesPoint) => number | undefined) =>
      points
        .map((p, i) => [i, get(p)] as const)
        .filter(([, v]) => v !== undefined)
        .map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
        .join("");
    const line = path((p) => p.value);
    const compareLine = compare
      ? compare
          .map((v, i) => [i, v] as const)
          .filter(([, v]) => v !== null && Number.isFinite(v))
          .map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
          .join("")
      : null;
    // Griglia: 3 livelli "tondi"
    const step = niceStep((max - min) / 3);
    const grid: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) grid.push(v);
    return {
      x,
      y,
      base,
      line,
      area: `${line}L${plotW},${H}L0,${H}Z`,
      invested: showInvested ? path((p) => p.invested) : null,
      compareLine,
      grid,
    };
  }, [points, plotW, H, reference, showInvested, marker, compare]);

  const eventIdx = useMemo(() => {
    const map = new Map<number, ChartEvent[]>();
    if (!points.length) return map;
    for (const ev of events) {
      if (ev.date < points[0].date || ev.date > points[points.length - 1].date) continue;
      let i = points.findIndex((p) => p.date >= ev.date);
      if (i < 0) i = points.length - 1;
      map.set(i, [...(map.get(i) ?? []), ev]);
    }
    return map;
  }, [events, points]);

  const update = useCallback(
    (s: Selection | null) => {
      setSel(s);
      onSelect?.(s);
    },
    [onSelect],
  );

  if (!geo) {
    return (
      <div style={{ height }} className={loading ? "" : "flex items-center justify-center"}>
        {loading ? (
          <ChartSkeleton height={height} />
        ) : (
          <p className="max-w-[260px] text-center text-[13px] leading-snug text-mut">
            {points.length === 1 ? "Il grafico si disegna dal prossimo giorno di borsa: per ora c'è solo il valore di oggi." : "Nessun dato nel periodo."}
          </p>
        )}
      </div>
    );
  }

  const idxAt = (clientX: number) => {
    const rect = boxRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / (plotW || rect.width)));
    return Math.round(ratio * (points.length - 1));
  };

  const fromPointers = () => {
    const xs = [...pointers.current.values()];
    if (xs.length >= 2) {
      const [i, j] = [idxAt(xs[0]), idxAt(xs[1])].sort((a, b) => a - b);
      update({ a: i, b: j });
    } else if (xs.length === 1) {
      const i = idxAt(xs[0]);
      if (dragAnchor.current !== null && dragAnchor.current !== i) {
        const [a, b] = [dragAnchor.current, i].sort((m, n) => m - n);
        update({ a, b });
      } else update({ a: i, b: null });
    }
  };

  const onDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, e.clientX);
    if (e.pointerType === "mouse") dragAnchor.current = idxAt(e.clientX);
    fromPointers();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && !pointers.current.has(e.pointerId)) {
      update({ a: idxAt(e.clientX), b: null }); // hover
      return;
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, e.clientX);
    fromPointers();
  };
  const onUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    dragAnchor.current = null;
    if (e.pointerType !== "mouse" && pointers.current.size === 0) update(null);
  };
  const onLeave = () => {
    pointers.current.clear();
    dragAnchor.current = null;
    update(null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Escape") return;
    e.preventDefault();
    if (e.key === "Escape") return update(null);
    const cur = sel?.a ?? points.length - 1;
    const next = Math.min(points.length - 1, Math.max(0, cur + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1)));
    update({ a: next, b: null });
  };

  const end = sel ? (sel.b ?? sel.a) : points.length - 1;
  const start = sel?.b !== null && sel ? sel.a : 0;
  const up = trend ? trend(start, end) >= 0 : points[end].value >= (sel?.b != null ? points[start].value : geo.base);
  const stroke = up ? "var(--up)" : "var(--dn)";
  const ranged = sel?.b != null;
  const tipIdx = sel ? (sel.b ?? sel.a) : null;
  const tipEvents = tipIdx !== null ? eventIdx.get(tipIdx) ?? [] : [];
  const axisFmt = formatAxis ?? format;
  const ticks = timeTicks(points, geo.x);

  return (
    <div
      ref={(n) => {
        boxRef.current = n;
        setBox(n);
      }}
      role="application"
      aria-label="Grafico navigabile: frecce sinistra e destra per scorrere, Esc per uscire"
      tabIndex={0}
      onKeyDown={onKey}
      onBlur={() => update(null)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onLeave}
      onPointerLeave={onLeave}
      className="relative select-none outline-none"
      style={{ height, touchAction: "pan-y" }}
    >
      {width > 0 && <svg width={width} height={height} className="block" aria-hidden>
        <defs>
          <linearGradient id={`f-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`c-${gid}`}>
            <rect x={ranged ? geo.x(start) : 0} y="0" width={ranged ? geo.x(end) - geo.x(start) : plotW} height={H} />
          </clipPath>
        </defs>

        <line x1="0" x2={plotW} y1={geo.y(geo.base)} y2={geo.y(geo.base)} stroke="var(--mut)" strokeOpacity="0.6" strokeWidth="1.25" strokeDasharray="1 5" strokeLinecap="round" />
        {marker && <line x1="0" x2={plotW} y1={geo.y(marker.value)} y2={geo.y(marker.value)} stroke="var(--accent)" strokeOpacity="0.6" strokeDasharray="4 4" />}

        {/* Area solo sull'intervallo selezionato */}
        {ranged && <path d={geo.area} fill={`url(#f-${gid})`} clipPath={`url(#c-${gid})`} />}
        {geo.compareLine && (
          <path d={geo.compareLine} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeDasharray="6 4" strokeLinejoin="round" opacity="0.9" />
        )}
        {geo.invested && <path d={geo.invested} fill="none" stroke="var(--mut)" strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" />}
        <path d={geo.line} fill="none" stroke={ranged ? "var(--faint)" : stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity={ranged ? 0.5 : 1} />
        {ranged && <path d={geo.line} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#c-${gid})`} />}

        {/* Operazioni sulla linea del tempo */}
        {[...eventIdx.entries()].map(([i, evs]) => (
          <circle key={i} cx={geo.x(i)} cy={H - 4} r={tipIdx === i ? 4 : 2.5} fill={EVENT_COLOR[evs[0].kind]} />
        ))}

        {/* Righe verticali allineate al punto */}
        {sel && (
          <>
            {ranged && <line x1={geo.x(start)} x2={geo.x(start)} y1="0" y2={H} stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1" />}
            <line x1={geo.x(end)} x2={geo.x(end)} y1="0" y2={H} stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1" />
            {showInvested && points[end].invested !== undefined && (
              <circle cx={geo.x(end)} cy={geo.y(points[end].invested!)} r="3.5" fill="var(--mut)" />
            )}
            {ranged && <circle cx={geo.x(start)} cy={geo.y(points[start].value)} r="5" fill={stroke} stroke="var(--bg)" strokeWidth="2.5" />}
            <circle cx={geo.x(end)} cy={geo.y(points[end].value)} r="6" fill={stroke} stroke="var(--bg)" strokeWidth="3" />
          </>
        )}

        {/* Asse X: una tacca per mese, trimestre o anno a seconda del periodo */}
        {ticks.map((t) => (
          <g key={t.i}>
            <text x={t.x} y={H + 20} textAnchor="middle" className="num" fontSize="11" fill="var(--mut)">
              {t.label}
            </text>
          </g>
        ))}
      </svg>}

      {/* Etichette della griglia (asse Y, a destra) */}
      {geo.grid.map((v) => (
          <span key={v} className="num pointer-events-none absolute right-0 -translate-y-1/2 text-right text-[11px] text-mut" style={{ top: geo.y(v), width: GUTTER - 8 }}>
            {axisFmt(v)}
          </span>
        ))}

      {marker && !sel && (
        <span className="pointer-events-none absolute left-3 rounded-lg bg-chip px-2 py-0.5 text-[11px] font-semibold text-ink-2" style={{ top: Math.min(H - 24, geo.y(marker.value) + 5) }}>
          {marker.label}
        </span>
      )}

      {/* Bolla */}
      {sel && tipIdx !== null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-xl bg-ink px-3 py-1.5 text-bg shadow-lg"
          style={{ left: clamp(geo.x(ranged ? (start + end) / 2 : end) - 80, 0, width - 166), minWidth: 160 }}
        >
          {ranged ? (
            <>
              <p className="text-[11px] opacity-70">
                {shortDate(points[start].date)} → {shortDate(points[end].date)}
              </p>
              <p className="num text-[13px] font-semibold">
                {describeRange
                  ? describeRange(start, end)
                  : `${signed(points[end].value - points[start].value, format)} · ${pct((points[end].value - points[start].value) / Math.abs(points[start].value || 1))}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] opacity-70">{longDate(points[end].date)}</p>
              <p className="num text-[13px] font-semibold">{describePoint ? describePoint(end) : format(points[end].value)}</p>
              {tipEvents.map((ev, k) => (
                <p key={k} className="text-[11px]">
                  <span style={{ color: EVENT_COLOR[ev.kind] }}>●</span> {EVENT_LABEL[ev.kind]} · {ev.label}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Grafico in caricamento: stessa impaginazione di quello vero (griglia, asse dei
 * valori a destra, date in basso) con una curva fantasma su cui scorre un riflesso.
 * Quando arrivano i dati niente si sposta.
 */
function ChartSkeleton({ height }: { height: number }) {
  const gid = useId().replace(/:/g, "");
  const H = height - AXIS_H;
  // Curva morbida in coordinate 0..100 × 0..H, disegnata con preserveAspectRatio="none".
  const pts = [0.62, 0.55, 0.6, 0.46, 0.5, 0.38, 0.44, 0.3, 0.36, 0.26, 0.3];
  const d = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * 100;
      const y = 12 + v * (H - 24);
      if (!i) return `M0,${y}`;
      const px = ((i - 1) / (pts.length - 1)) * 100;
      const py = 12 + pts[i - 1] * (H - 24);
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    })
    .join("");
  return (
    <div role="status" aria-label="Caricamento del grafico" className="relative h-full">
      <div className="flex" style={{ height: H }}>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {[0.25, 0.5, 0.75].map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-dashed border-sep" style={{ top: `${f * 100}%` }} />
          ))}
          <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id={`sk-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--chip)" stopOpacity="0.9" />
                <stop offset="1" stopColor="var(--chip)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${d}L100,${H}L0,${H}Z`} fill={`url(#sk-fill-${gid})`} className="anim-breathe" />
            <path d={d} fill="none" stroke="var(--chip)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Riflesso: una fascia chiara che attraversa il grafico. */}
          <div
            className="anim-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2"
            style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--bg) 70%, transparent), transparent)" }}
          />
        </div>
        <div className="flex shrink-0 flex-col justify-around pl-3" style={{ width: GUTTER }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton h-2.5 w-7" />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-around" style={{ height: AXIS_H, paddingRight: GUTTER }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton h-2.5 w-8" />
        ))}
      </div>
    </div>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Le date intraday sono istanti completi ("2026-11-05T08:00:00Z"), le altre solo giorni. */
const isInstant = (d: string) => d.length > 10;
const toDate = (d: string) => new Date(isInstant(d) ? d : `${d}T12:00:00`);
const hhmm = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function longDate(d: string) {
  if (isInstant(d)) return `${toDate(d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" })}, ${hhmm(toDate(d))}`;
  return toDate(d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function shortDate(d: string) {
  if (isInstant(d)) return hhmm(toDate(d));
  return toDate(d).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" });
}

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/**
 * Tacche dell'asse del tempo: giorni per una settimana, settimane per un mese,
 * mesi fino a 4 mesi, trimestri fino a ~16 mesi, semestri e poi anni.
 * Le etichette troppo vicine tra loro vengono saltate.
 */
function timeTicks(points: SeriesPoint[], x: (i: number) => number) {
  if (points.length < 2) return [];
  if (isInstant(points[0].date)) {
    // Intraday: una tacca ogni due ore piene.
    const out: { i: number; x: number; label: string }[] = [];
    let lastHour = -1;
    points.forEach((p, i) => {
      const d = toDate(p.date);
      const h = d.getHours();
      if (h % 2 === 0 && h !== lastHour && d.getMinutes() < 15) {
        lastHour = h;
        const px = x(i);
        if (px >= 18 && (!out.length || px - out[out.length - 1].x >= 44)) out.push({ i, x: px, label: `${h}:00` });
      }
    });
    return out;
  }
  const first = new Date(`${points[0].date}T12:00:00`);
  const last = new Date(`${points[points.length - 1].date}T12:00:00`);
  const span = (last.getTime() - first.getTime()) / 86400_000;
  const dates: { date: string; label: string }[] = [];
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (span <= 45) {
    const step = span <= 10 ? 2 : 7;
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + step)) {
      dates.push({ date: iso(d), label: `${d.getDate()} ${MONTHS[d.getMonth()]}` });
    }
  } else {
    const step = span <= 130 ? 1 : span <= 500 ? 3 : span <= 1000 ? 6 : 12;
    const d = new Date(first.getFullYear(), first.getMonth() + 1, 1, 12);
    while (d.getMonth() % step !== 0) d.setMonth(d.getMonth() + 1);
    for (; d <= last; d.setMonth(d.getMonth() + step)) {
      const m = d.getMonth();
      const label = m === 0 ? String(d.getFullYear()) : `${MONTHS[m]}${step >= 3 ? ` ${String(d.getFullYear()).slice(2)}` : ""}`;
      dates.push({ date: iso(d), label });
    }
  }

  const out: { i: number; x: number; label: string }[] = [];
  for (const t of dates) {
    const i = points.findIndex((p) => p.date >= t.date);
    if (i < 0) continue;
    const px = x(i);
    if (px < 18 || (out.length && px - out[out.length - 1].x < 44)) continue;
    out.push({ i, x: px, label: t.label });
  }
  const end = x(points.length - 1);
  if (out.length && end - out[out.length - 1].x < 18) out.pop();
  return out;
}

function signed(v: number, f: (v: number) => string) {
  return (v >= 0 ? "+" : "−") + f(Math.abs(v));
}

function pct(n: number) {
  return (n >= 0 ? "+" : "−") + Math.abs(n * 100).toLocaleString("it-IT", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + "%";
}
