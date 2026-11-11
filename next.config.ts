import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. Senza nonce Next ha bisogno di 'unsafe-inline' per gli
 * script (idratazione, script di avvio del tema) e per gli stili; 'unsafe-eval' e
 * i websocket servono solo a `next dev`. Immagini aperte a https: i loghi dei titoli
 * arrivano da assets.parqet.com e un'origine in più non vale una pagina rotta;
 * data:/blob: per l'immagine di condivisione generata nel browser (wrap-image).
 * Tutto il resto solo dalla stessa origine: le API esterne le chiama il server.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Appunti, condivisione e notifiche push non sono toccati: restano permessi alla stessa origine.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
