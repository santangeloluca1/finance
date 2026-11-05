import type { ReactNode } from "react";
import { fmtSignedPct, tone } from "@/lib/format";

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3 pt-2">
      <div>
        {subtitle && <p className="text-[13px] font-medium text-muted">{subtitle}</p>}
        <h1 className="font-display text-[32px] font-bold leading-tight tracking-tight">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`card p-4 fade-up ${className}`} style={style}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {right}
    </div>
  );
}

export function Pill({ value, className = "" }: { value: number; className?: string }) {
  const bg = value > 0.00004 ? "bg-gain/12" : value < -0.00004 ? "bg-loss/12" : "bg-surface-3";
  return (
    <span className={`num inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${bg} ${tone(value * 100)} ${className}`}>
      {fmtSignedPct(value)}
    </span>
  );
}

export function Stat({ label, value, hint, valueClass = "" }: { label: string; value: ReactNode; hint?: ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={`num mt-0.5 truncate text-[17px] font-semibold ${valueClass}`}>{value}</p>
      {hint && <p className="num mt-0.5 text-[12px] text-faint">{hint}</p>}
    </div>
  );
}

export function AccountDot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-all ${
            value === o.value ? "bg-surface-3 text-text shadow-sm" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function InstrumentBadge({ label, color }: { label: string; color: string }) {
  const initials = label
    .replace(/[^A-Za-z0-9€ ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
    >
      {initials || "•"}
    </div>
  );
}
