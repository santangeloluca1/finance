"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Gli obiettivi ora sono una scheda della Home. */
export default function ObiettiviRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/#obiettivi"), [router]);
  return null;
}
