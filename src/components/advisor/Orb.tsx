/**
 * Basis AI: sfera di vetro scuro con colori liquidi che si muovono dentro,
 * luce speculare, bordo luminoso e alone. Più veloce mentre ragiona.
 */
export function Orb({ size = 120, active = false, className = "" }: { size?: number; active?: boolean; className?: string }) {
  const big = size >= 64;
  return (
    <span aria-hidden className={`orb3d ${big ? "float" : ""} ${active ? "active" : ""} ${className}`} style={{ ["--s" as string]: `${size}px` }}>
      {big && <span className="orb3d-shadow" />}
      <span className="orb3d-glow" />
      <span className="orb3d-body">
        <span className="orb3d-blob a" />
        <span className="orb3d-blob b" />
        <span className="orb3d-blob c" />
        <span className="orb3d-blob d" />
        <span className="orb3d-sheen" />
      </span>
      <span className="orb3d-light" />
    </span>
  );
}

/** Nome dell'assistente. */
export const ASSISTANT = "Basis AI";
