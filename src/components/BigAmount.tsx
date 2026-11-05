import { fmtEur } from "@/lib/format";

/** Importo grande con i decimali in apice, come Revolut e Scalable. */
export function BigAmount({ value, className = "" }: { value: number; className?: string }) {
  const parts = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(value);
  const int = parts.filter((p) => p.type !== "fraction" && p.type !== "decimal").map((p) => p.value).join("");
  const dec = parts.find((p) => p.type === "fraction")?.value ?? "00";
  return (
    <p className={`hero-number sensitive ${className}`} aria-label={fmtEur(value)}>
      {int}
      <span className="dec">,{dec} €</span>
    </p>
  );
}
