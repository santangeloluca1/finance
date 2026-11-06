import { NextResponse } from "next/server";
import { vapidKeys } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chiave pubblica VAPID per iscrivere il dispositivo alle notifiche. */
export async function GET() {
  try {
    const { publicKey } = await vapidKeys();
    return NextResponse.json({ publicKey });
  } catch (e) {
    return NextResponse.json({ message: String(e) }, { status: 503 });
  }
}
