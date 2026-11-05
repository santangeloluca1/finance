import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icona della schermata Home dell'iPhone: iOS arrotonda gli angoli da sé, quindi il fondo è pieno. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#000" }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <rect x="40" y="98" width="25" height="44" rx="7" fill="#3c3f47" />
          <rect x="77.5" y="52" width="25" height="90" rx="7" fill="#f5f6f8" />
          <rect x="115" y="76" width="25" height="66" rx="7" fill="#3c3f47" />
          <line x1="30" y1="86" x2="150" y2="86" stroke="#3bd98a" strokeWidth="7" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
