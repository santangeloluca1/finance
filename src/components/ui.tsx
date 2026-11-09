"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { fmtSignedEur, fmtSignedPct } from "@/lib/format";

/** Misura unica dei titoli di pagina (anche le schede della Home). */
export const PAGE_TITLE = "text-[26px] font-bold leading-tight tracking-[-0.03em]";

/** Titolo di pagina, con eventuali pulsanti tondi a destra. */
export function LargeTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 px-4 pb-3 pt-1">
      <h1 className={PAGE_TITLE}>{children}</h1>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * Pulsante tondo con icona (stile getquin): "+" per aggiungere, ingranaggio, ecc.
 * Stessa misura ovunque, nel titolo di pagina e nelle intestazioni di sezione.
 */
export function IconButton({ href, onClick, label, children }: { href?: string; onClick?: () => void; label: string; children: ReactNode }) {
  const cls = "press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-ink";
  return href ? (
    <Link href={href} aria-label={label} title={label} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>
      {children}
    </button>
  );
}

export function AddButton(props: { href?: string; onClick?: () => void; label: string }) {
  return (
    <IconButton {...props}>
      <Plus size={19} strokeWidth={2.4} />
    </IconButton>
  );
}

// ---- pagina precedente, per il pulsante "indietro" ----
// Pila delle pagine visitate: tornando alla penultima si toglie l'ultima.
const stack: string[] = [];

/** Da chiamare a ogni cambio di pagina (lo fa Shell). */
export function trackPath(path: string) {
  if (stack[stack.length - 1] === path) return;
  if (stack[stack.length - 2] === path) stack.pop();
  else stack.push(path);
  if (stack.length > 30) stack.shift();
}

const PAGE_NAMES: [RegExp, string][] = [
  [/^\/$/, "Home"],
  [/^\/analisi/, "Analisi"],
  [/^\/cerca/, "Cerca"],
  [/^\/consulente\/chat/, "Chat"],
  [/^\/consulente\/./, "Basis AI"],
  [/^\/consulente/, "Basis AI"],
  [/^\/posizioni\/./, "Titolo"],
  [/^\/posizioni/, "Titoli"],
  [/^\/fisco/, "Fisco"],
  [/^\/movimenti/, "Movimenti"],
  [/^\/ricorrenti/, "Ricorrenti"],
  [/^\/avvisi\/./, "Notifiche"],
  [/^\/avvisi/, "Avvisi"],
  [/^\/impostazioni/, "Impostazioni"],
  [/^\/obiettivi/, "Obiettivi"],
];

/**
 * "‹ Pagina precedente": torna da dove sei arrivato (es. Analisi), altrimenti
 * alla pagina indicata. Stile unico per tutte le pagine; i moduli usano "Annulla".
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [prev, setPrev] = useState<{ path: string; name: string } | null>(null);
  useEffect(() => {
    const p = stack[stack.length - 2];
    const name = p ? PAGE_NAMES.find(([re]) => re.test(p))?.[1] : undefined;
    if (p && name) setPrev({ path: p, name });
  }, []);
  return (
    <Link
      href={prev?.path ?? href}
      onClick={(e) => {
        if (!prev) return;
        e.preventDefault();
        router.back();
      }}
      className="-ml-1 inline-flex min-h-[44px] items-center px-3 text-[17px] text-accent active:opacity-50"
    >
      <ChevronLeft size={24} strokeWidth={2.2} className="-mr-0.5" />
      {prev?.name ?? label}
    </Link>
  );
}

/** Intestazione di sezione: più spazio sopra che sotto. */
export function SectionHeader({ children, right, id }: { children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-10">
      <h2 id={id} className="text-[22px] font-bold tracking-[-0.025em]">
        {children}
      </h2>
      {right}
    </div>
  );
}

/** Pannello raggruppato (inset grouped). */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-4 overflow-hidden rounded-[16px] bg-panel ${className}`}>{children}</div>;
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
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold transition-colors ${
        active ? "bg-chip text-ink" : "text-mut active:opacity-60"
      }`}
    >
      {children}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">{children}</div>;
}

/** Controllo segmentato iOS, con la pillola che scivola sull'opzione scelta. */
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
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" className={`relative flex rounded-[10px] bg-chip p-[3px] ${size === "sm" ? "text-[12px]" : "text-[13px]"}`}>
      <span
        aria-hidden
        className="slide-ind absolute bottom-[3px] left-[3px] top-[3px] rounded-[8px] bg-panel shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative flex-1 rounded-[8px] font-semibold transition-colors ${size === "sm" ? "px-2.5 py-1" : "px-2 py-1.5"} ${value === o.value ? "text-ink" : "text-mut"}`}
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
  display,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  variant?: "link" | "chip";
  /** Testo breve da mostrare al posto dell'opzione scelta (il menu resta completo). */
  display?: string;
}) {
  const current = display ?? options.find((o) => o.value === value)?.label;
  const cls =
    variant === "chip"
      ? `h-9 rounded-full px-3.5 text-[15px] font-semibold ${value === options[0].value ? "text-ink" : "bg-chip text-ink"}`
      : "min-h-[36px] text-[15px] font-semibold text-ink";
  return (
    <label className={`relative inline-flex shrink-0 items-center gap-1 ${cls}`}>
      <span>{current}</span>
      <ChevronDown size={16} strokeWidth={2.4} className="text-mut" />
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
    <span className={`num font-medium ${cls} ${size === "sm" ? "text-[14px]" : "text-[15px]"}`}>
      {arrow && (ref > eps ? "↗ " : ref < -eps ? "↘ " : "")}
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
      src={
        isin.startsWith("TICKER:")
          ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(isin.slice(7))}?format=png`
          : `https://assets.parqet.com/logos/isin/${isin}?format=png`
      }
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

/** Interruttore stile iOS. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-up" : "bg-mut/30"}`}
    >
      <span className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.2)] transition-transform ${checked ? "translate-x-[20px]" : ""}`} />
    </button>
  );
}

/**
 * Selettore del periodo sotto i grafici (stile getquin): etichette brevi in fila,
 * quella scelta su una pillola. Uguale in Home, Analisi e scheda titolo.
 */
export function RangePicker<T extends string>({ value, onChange, options, label = "Periodo del grafico" }: { value: T; onChange: (v: T) => void; options: readonly T[]; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; w: number } | null>(null);
  // La pillola scivola sotto il periodo scelto: posizione misurata sul pulsante.
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current?.querySelector<HTMLButtonElement>(`[data-r="${value}"]`);
      if (el) setPos({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);
  return (
    <div ref={box} role="group" aria-label={label} className="relative mt-4 flex justify-between px-3">
      {pos && <span aria-hidden className="slide-ind absolute left-0 top-0 h-8 rounded-full bg-chip" style={{ width: pos.w, transform: `translateX(${pos.x}px)` }} />}
      {options.map((r) => (
        <button
          key={r}
          data-r={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={`press num relative h-8 min-w-[44px] rounded-full px-2 text-[13px] font-semibold tracking-[0.01em] transition-colors ${value === r ? `text-ink ${pos ? "" : "bg-chip"}` : "text-mut active:text-ink"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/** Colonna della data nelle liste: "11 giu", con l'anno piccolo sotto se serve. */
export function DayCell({ date, year = false, className = "text-mut" }: { date: string; year?: boolean; className?: string }) {
  const d = new Date(`${date}T12:00:00`);
  return (
    <span className={`num w-[52px] shrink-0 whitespace-nowrap leading-tight ${className}`}>
      <span className="block text-[15px]">
        {d.getDate()} {MONTHS_SHORT[d.getMonth()]}
      </span>
      {year && <span className="block text-[12px] opacity-80">{date.slice(0, 4)}</span>}
    </span>
  );
}

const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
