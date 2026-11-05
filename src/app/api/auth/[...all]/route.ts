import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth, authConfigured, ensureAuthSchema } from "@/lib/auth";

export const runtime = "nodejs";

const handler = toNextJsHandler(auth);

async function guard(req: Request, next: (req: Request) => Promise<Response>) {
  if (!authConfigured) {
    return NextResponse.json({ message: "Accesso non ancora configurato: manca il database o il segreto." }, { status: 503 });
  }
  await ensureAuthSchema();
  return next(req);
}

export const GET = (req: Request) => guard(req, handler.GET);
export const POST = (req: Request) => guard(req, handler.POST);
