import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

/**
 * Verifica il token OIDC che GitHub Actions emette per ogni esecuzione:
 * così il workflow delle notifiche si autentica senza secret salvati su GitHub.
 * Accetta solo token del repository indicato (GITHUB_CRON_REPO, di default quello dell'app).
 */

const ISSUER = "https://token.actions.githubusercontent.com";
export const OIDC_AUDIENCE = "basis-notify";
const REPO = process.env.GITHUB_CRON_REPO ?? "santangeloluca1/finance";

let jwks: { at: number; keys: (JsonWebKey & { kid?: string })[] } | null = null;

async function keys(force = false) {
  if (!force && jwks && Date.now() - jwks.at < 3600_000) return jwks.keys;
  const res = await fetch(`${ISSUER}/.well-known/jwks`, { cache: "no-store" });
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
  jwks = { at: Date.now(), keys: ((await res.json()) as { keys: (JsonWebKey & { kid?: string })[] }).keys };
  return jwks.keys;
}

const b64 = (s: string) => Buffer.from(s, "base64url");

export async function verifyGithubOidc(token: string, now = Date.now()): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let header: { alg?: string; kid?: string };
  let claims: { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; repository?: string };
  try {
    header = JSON.parse(b64(parts[0]).toString());
    claims = JSON.parse(b64(parts[1]).toString());
  } catch {
    return false;
  }
  if (header.alg !== "RS256" || !header.kid) return false;
  let jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await keys(true)).find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), b64(parts[2]));
  if (!ok) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const t = now / 1000;
  return claims.iss === ISSUER && aud.includes(OIDC_AUDIENCE) && claims.repository === REPO && (claims.exp ?? 0) > t && (claims.nbf ?? 0) <= t + 60;
}
