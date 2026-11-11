import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getComposition } from "@/lib/market/xray";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const isins = [...new Set((new URL(req.url).searchParams.get("isin") ?? "").split(",").filter((s) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)))].slice(0, 30);
  const results = await Promise.allSettled(isins.map(getComposition));
  return NextResponse.json({
    compositions: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    missing: isins.filter((_, i) => results[i].status === "rejected"),
  });
}
