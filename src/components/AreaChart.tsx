"use client";

import { useId, useMemo, useRef, useState } from "react";

export interface ChartPoint {
  date: string;
  value: number;
  /** Linea secondaria opzionale (es. capitale investito). */
  base?: number;
}

interface Props {
  points: ChartPoint[];
  height?: number;
  color?: string;
  onScrub?: (p: ChartPoint | null) => void;
}

const W = 1000;

export function AreaChart({ points, height = 180, color, onScrub }: Props) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.flatMap((p) => (p.base !== undefined ? [p.value, p.base] : [p.value]));
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min || Math.abs(max) || 1) * 0.12;
    min -= pad;
    max += pad;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => height - ((v - min) / (max - min)) * height;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
    const base = points.some((p) => p.base !== undefined)
      ? points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.base ?? p.value).toFixed(1)}`).join("")
      : null;
    return { x, y, line, area: `${line}L${W},${height}L0,${height}Z`, base };
  }, [points, height]);

  if (!geo) {
    return <div style={{ height }} className="flex items-center justify-center text-sm text-faint">Dati storici in arrivo…</div>;
  }

  const up = points[points.length - 1].value >= points[0].value;
  const stroke = color ?? (up ? "var(--gain)" : "var(--loss)");

  const handle = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const i = Math.round(ratio * (points.length - 1));
    setActive(i);
    onScrub?.(points[i]);
  };
  const end = () => {
    setActive(null);
    onScrub?.(null);
  };

  return (
    <svg
      ref={ref}
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
          <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={geo.area} fill={`url(#fill-${id})`} />
      {geo.base && (
        <path d={geo.base} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
      )}
      <path d={geo.line} fill="none" stroke={stroke} strokeWidth="2.25" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {active !== null && (
        <>
          <line x1={geo.x(active)} x2={geo.x(active)} y1="0" y2={height} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle cx={geo.x(active)} cy={geo.y(points[active].value)} r="5" fill={stroke} stroke="var(--bg)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}
