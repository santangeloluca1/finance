"use client";

import { useId, useMemo, useRef, useState } from "react";

export interface ChartPoint {
  date: string;
  value: number;
}

interface Props {
  points: ChartPoint[];
  height?: number;
  onScrub?: (p: ChartPoint | null) => void;
  /** Valore di riferimento (es. inizio periodo) disegnato come linea tratteggiata. */
  reference?: number;
  loading?: boolean;
}

const W = 1000;

/**
 * Grafico ad area a tutta larghezza: si scorre col dito per leggere il valore
 * a una certa data. Verde se il periodo è in guadagno, rosso se in perdita.
 */
export function AreaChart({ points, height = 200, onScrub, reference, loading }: Props) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.value);
    if (reference !== undefined) vals.push(reference);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min || Math.abs(max) || 1) * 0.08;
    min -= pad;
    max += pad;
    const top = 8;
    const h = height - top - 4;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => top + h - ((v - min) / (max - min)) * h;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
    return { x, y, line, area: `${line}L${W},${height}L0,${height}Z` };
  }, [points, height, reference]);

  if (!geo) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        {loading ? <div className="h-[2px] w-1/2 animate-pulse rounded-full bg-chip" /> : <p className="text-[13px] text-mut">Nessun dato nel periodo</p>}
      </div>
    );
  }

  const up = points[points.length - 1].value >= (reference ?? points[0].value);
  const stroke = up ? "var(--up)" : "var(--dn)";

  const handle = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const i = Math.round(ratio * (points.length - 1));
    if (i !== active) {
      setActive(i);
      onScrub?.(points[i]);
    }
  };
  const end = () => {
    setActive(null);
    onScrub?.(null);
  };

  return (
    <div className="relative">
    <svg
      ref={ref}
      role="img"
      aria-label="Andamento nel periodo selezionato"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="block w-full touch-pan-y select-none"
      style={{ height }}
      onPointerDown={(e) => handle(e.clientX)}
      onPointerMove={(e) => (e.pointerType !== "mouse" || e.buttons || active !== null) && handle(e.clientX)}
      onPointerLeave={end}
      onPointerUp={(e) => e.pointerType !== "mouse" && end()}
      onPointerCancel={end}
    >
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {reference !== undefined && (
        <line x1="0" x2={W} y1={geo.y(reference)} y2={geo.y(reference)} stroke="var(--faint)" strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      )}
      <path d={geo.area} fill={`url(#fill-${id})`} />
      <path d={geo.line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {active !== null && (
        <>
          <line x1={geo.x(active)} x2={geo.x(active)} y1="0" y2={height} stroke="var(--faint)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
      {active !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg"
          style={{ left: `${(geo.x(active) / W) * 100}%`, top: geo.y(points[active].value), background: stroke }}
        />
      )}
    </div>
  );
}
