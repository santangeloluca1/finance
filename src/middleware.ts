import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Solo un controllo preliminare veloce: guarda che il cookie di sessione esista,
 * non che sia valido (un cookie inventato passa). Senza cookie le pagine portano
 * all'accesso e le API rispondono 401; ogni API verifica poi davvero la sessione
 * con sessionUserId/requireUser (src/lib/session.ts).
 */
export function middleware(req: NextRequest) {
  if (getSessionCookie(req)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Accesso richiesto" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/accedi";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!accedi|api/auth|api/notify/run|sw\.js|_next/|icon|apple-icon|manifest|favicon).*)"],
};
