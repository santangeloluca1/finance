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
}

const AXIS_H = 24;
const EVENT_COLOR = { buy: "var(--accent)", sell: "var(--warn)", dividend: "var(--up)" } as const;
const EVENT_LABEL = { buy: "Acquisto", sell: "Vendita", dividend: "Cedola" } as const;

/**
 * Grafico navigabile:
 * - un dito (o il mouse) scorre sulla linea del tempo con una riga verticale allineata al punto;
 * - due dita (o trascinando col mouse) selezionano un intervallo e mostrano la variazione tra le due date;
 * - frecce ← → da tastiera quando il grafico ha il focus.
 */
export function InteractiveChart({ points, height = 220, format, formatAxis, reference, showInvested, events = [], marker, onSelect, loading, describePoint, describeRange, trend }: Props) {
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

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.value);
    if (showInvested) points.forEach((p) => p.invested !== undefined && vals.push(p.invested));
    const base = reference ?? points[0].value;
    vals.push(base);
    if (marker) vals.push(marker.value);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min || Math.abs(max) || 1) * 0.1;
    min -= pad;
    max += pad;
    const top = 14;
    const h = H - top - 6;
    const x = (i: number) => (i / (points.length - 1)) * width;
    const y = (v: number) => top + h - ((v - min) / (max - min)) * h;
    const path = (get: (p: SeriesPoint) => number | undefined) =>
      points
        .map((p, i) => [i, get(p)] as const)
        .filter(([, v]) => v !== undefined)
        .map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
        .join("");
    const line = path((p) => p.value);
    // Griglia: 3 livelli "tondi"
    const step = niceStep((max - min) / 3);
    const grid: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) grid.push(v);
    return {
      x,
      y,
      base,
      line,
      area: `${line}L${width},${H}L0,${H}Z`,
      invested: showInvested ? path((p) => p.invested) : null,
      grid,
    };
  }, [points, width, H, reference, showInvested, marker]);

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
      <div style={{ height }} className="flex items-center justify-center">
        {loading ? <div className="h-[2px] w-1/2 animate-pulse rounded-full bg-chip" /> : <p className="text-[13px] text-mut">Nessun dato nel periodo</p>}
      </div>
    );
  }

  const idxAt = (clientX: number) => {
    const rect = boxRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
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
  const xLabels = [0, Math.floor((points.length - 1) / 2), points.length - 1];

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
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`c-${gid}`}>
            <rect x={ranged ? geo.x(start) : 0} y="0" width={ranged ? geo.x(end) - geo.x(start) : width} height={H} />
          </clipPath>
        </defs>

        {geo.grid.map((v) => (
          <line key={v} x1="0" x2={width} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--sep)" strokeWidth="1" />
        ))}

        <line x1="0" x2={width} y1={geo.y(geo.base)} y2={geo.y(geo.base)} stroke="var(--faint)" strokeWidth="1.25" strokeDasharray="1 5" strokeLinecap="round" />
        {marker && <line x1="0" x2={width} y1={geo.y(marker.value)} y2={geo.y(marker.value)} stroke="var(--accent)" strokeOpacity="0.6" strokeDasharray="4 4" />}

        {/* Area: in un intervallo si colora solo la parte selezionata */}
        <path d={geo.area} fill={`url(#f-${gid})`} clipPath={`url(#c-${gid})`} />
        {geo.invested && <path d={geo.invested} fill="none" stroke="var(--mut)" strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" />}
        <path d={geo.line} fill="none" stroke={ranged ? "var(--faint)" : stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" opacity={ranged ? 0.5 : 1} />
        {ranged && <path d={geo.line} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#c-${gid})`} />}

        {/* Operazioni sulla linea del tempo */}
        {[...eventIdx.entries()].map(([i, evs]) => (
          <circle key={i} cx={geo.x(i)} cy={H - 5} r={tipIdx === i ? 4.5 : 3} fill={EVENT_COLOR[evs[0].kind]} />
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

        {/* Asse X */}
        {xLabels.map((i, k) => (
          <text
            key={k}
            x={k === 0 ? 4 : k === 2 ? width - 4 : width / 2}
            y={height - 6}
            textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
            className="num"
            fontSize="11"
            fill="var(--faint)"
          >
            {axisDate(points[i].date, points)}
          </text>
        ))}
      </svg>}

      {/* Etichette della griglia (asse Y, a destra) */}
      {!sel &&
        geo.grid.map((v) => (
          <span key={v} className="num pointer-events-none absolute right-2 -translate-y-full rounded bg-bg/60 px-1 pb-0.5 text-[10px] text-faint" style={{ top: geo.y(v) }}>
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
          style={{ left: clamp(geo.x(ranged ? (start + end) / 2 : end) - 80, 6, width - 166), minWidth: 160 }}
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

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function longDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function shortDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" });
}

function axisDate(d: string, points: SeriesPoint[]) {
  const span = (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) / 86400_000;
  const opts: Intl.DateTimeFormatOptions = span <= 40 ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" };
  return new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", opts);
}

function signed(v: number, f: (v: number) => string) {
  return (v >= 0 ? "+" : "−") + f(Math.abs(v));
}

function pct(n: number) {
  return (n >= 0 ? "+" : "−") + Math.abs(n * 100).toLocaleString("it-IT", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + "%";
}
