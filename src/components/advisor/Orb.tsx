/** La sfera dell'oracolo: colori che girano lentamente; più veloce mentre il consulente ragiona. */
export function Orb({ size = 120, active = false, className = "" }: { size?: number; active?: boolean; className?: string }) {
  return <span aria-hidden className={`orb block ${active ? "orb-active" : ""} ${className}`} style={{ width: size, height: size, ["--orb-size" as string]: `${size}px` }} />;
}
