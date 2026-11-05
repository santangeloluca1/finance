/** Marchio di Basis: tre acquisti a prezzi diversi e la linea del prezzo medio. */
export function BasisMark({ size = 40, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" role="img" aria-label="Basis">
      <rect width="180" height="180" rx={rounded ? 40 : 0} fill="#000" />
      <rect x="40" y="98" width="25" height="44" rx="7" fill="#3c3f47" />
      <rect x="77.5" y="52" width="25" height="90" rx="7" fill="#f5f6f8" />
      <rect x="115" y="76" width="25" height="66" rx="7" fill="#3c3f47" />
      <line x1="30" y1="86" x2="150" y2="86" stroke="#3bd98a" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}
