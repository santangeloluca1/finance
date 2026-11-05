"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtSignedEur, fmtSignedPct } from "@/lib/format";

/** Titolo grande stile iOS. */
export function LargeTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between px-4 pb-3 pt-2">
      <h1 className="text-[34px] font-bold leading-tight tracking-[-0.025em]">{children}</h1>
      {right}
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-1 inline-flex items-center px-3 py-2 text-[17px] text-accent active:opacity-50">
      <ChevronLeft size={24} strokeWidth={2.2} className="-mr-0.5" />
      {label}
    </Link>
  );
}

/** Intestazione di sezione: più spazio sopra che sotto. */
export function SectionHeader({ children, right, id }: { children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-7">
      <h2 id={id} className="text-[22px] font-bold tracking-[-0.02em]">
        {children}
      </h2>
      {right}
    </div>
  );
}

/** Pannello raggruppato (inset grouped). */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-4 overflow-hidden rounded-[18px] bg-panel shadow-panel ${className}`}>{children}</div>;
}

/** Riga etichetta/valore dentro un pannello. */
export function InfoRow({ label, value, valueClass = "", hint }: { label: ReactNode; value: ReactNode; valueClass?: string; hint?: ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-4 border-b border-sep px-4 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[15px] text-ink-2">{label}</p>
        {hint && <p className="text-[12px] text-mut">{hint}</p>}
      </div>
      <p className={`num shrink-0 text-right text-[15px] font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

export function NavRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 active:bg-panel-2">
      {children}
      <ChevronRight size={18} className="shrink-0 text-faint" />
    </Link>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors ${
        active ? "bg-ink text-bg" : "bg-chip text-ink-2 active:opacity-70"
      }`}
    >
      {children}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">{children}</div>;
}

/** Controllo segmentato iOS. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={`flex rounded-[10px] bg-chip p-[3px] ${size === "sm" ? "text-[12px]" : "text-[13px]"}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[8px] font-semibold transition-all ${size === "sm" ? "px-2.5 py-1" : "px-2 py-1.5"} ${
            value === o.value ? "bg-panel text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-mut"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Menu a tendina nativo (picker iOS) presentato come testo con freccia. */
export function SelectButton<T extends string>({
  value,
  options,
  onChange,
  label,
  variant = "link",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  variant?: "link" | "chip";
}) {
  const current = options.find((o) => o.value === value)?.label;
  const cls =
    variant === "chip"
      ? `h-9 rounded-full px-3.5 text-[14px] font-semibold ${value === options[0].value ? "bg-chip text-ink-2" : "bg-ink text-bg"}`
      : "text-[15px] font-semibold text-accent";
  return (
    <label className={`relative inline-flex shrink-0 items-center gap-1 ${cls}`}>
      <span>{current}</span>
      <ChevronDown size={15} strokeWidth={2.5} />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Change({ abs, pct, size = "md", arrow = false }: { abs?: number; pct: number; size?: "sm" | "md"; arrow?: boolean }) {
  // Soglie: mezzo centesimo per gli importi, 0,005% per le percentuali.
  const [ref, eps] = abs !== undefined ? [abs, 0.005] : [pct, 0.00005];
  const cls = ref > eps ? "text-up" : ref < -eps ? "text-dn" : "text-mut";
  return (
    <span className={`num font-semibold ${cls} ${size === "sm" ? "text-[13px]" : "text-[15px]"}`}>
      {arrow && (ref >= 0 ? "▲ " : "▼ ")}
      {abs !== undefined && `${fmtSignedEur(abs)} · `}
      {fmtSignedPct(pct)}
    </span>
  );
}

export function BankDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />;
}

/** Logo dell'emittente/azienda per ISIN, con iniziali come ripiego. */
export function Logo({ isin, name, size = 40 }: { isin: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-chip font-bold text-mut"
        style={{ width: size, height: size, fontSize: size * 0.34 }}
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.parqet.com/logos/isin/${isin}?format=png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-chip object-cover"
      style={{ width: size, height: size }}
    />
  );
}
