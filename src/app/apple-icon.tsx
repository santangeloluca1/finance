import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 20%, #1a2340, #07090f 70%)",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6d8dff" />
              <stop offset="1" stopColor="#9b7bff" />
            </linearGradient>
          </defs>
          <path d="M8 46 L22 32 L32 40 L54 16" fill="none" stroke="url(#g)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="54" cy="16" r="5" fill="#3ddc97" />
        </svg>
      </div>
    ),
    size,
  );
}
