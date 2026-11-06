"use client";

import { useCallback, useEffect, useState } from "react";

/** Stato delle notifiche push su questo dispositivo. */
export type PushStatus =
  | "unsupported" // il browser non le supporta
  | "needs-install" // iPhone: vanno attivate dalla web app nella schermata Home
  | "denied" // permesso negato nelle impostazioni
  | "off" // disponibili ma non attive
  | "on";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function registration() {
  registerServiceWorker();
  return navigator.serviceWorker.ready;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || isIos()) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

async function currentStatus(): Promise<PushStatus> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    currentStatus()
      .then(async (s) => {
        // Se il server non conosce più questo dispositivo, lo si iscrive di nuovo.
        if (s === "on") {
          const sub = await (await registration()).pushManager.getSubscription();
          const r = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub!.endpoint)}`).then((x) => x.json()).catch(() => null);
          if (r && !r.thisDevice) await send(sub!);
        }
        if (!stop) setStatus(s);
      })
      .catch(() => !stop && setStatus("unsupported"));
    return () => {
      stop = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Su iOS la richiesta deve partire direttamente dal tocco: per prima.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        return;
      }
      const { publicKey } = await fetch("/api/push/key").then((r) => {
        if (!r.ok) throw new Error("Il server non ha le chiavi per le notifiche");
        return r.json();
      });
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await send(sub);
      setStatus("on");
      await fetch("/api/push/test", { method: "POST" }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json());
      if (!r.sent) setError("Nessun dispositivo ha ricevuto la prova. Prova a disattivare e riattivare le notifiche.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, enable, disable, test };
}

async function send(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), device: deviceName() }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
}
