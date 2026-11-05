import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Controllo rapido sul cookie di sessione: senza sessione le pagine portano
 * all'accesso e le API rispondono 401. La verifica completa avviene lato server.
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
  matcher: ["/((?!accedi|api/auth|_next/|icon|apple-icon|manifest|favicon).*)"],
};
