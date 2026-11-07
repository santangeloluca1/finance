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

interface TestResult {
  sent: number;
  devices: number;
  errors?: string[];
}

function explain(r: TestResult) {
  if (r.sent > 0) return null;
  if (!r.devices) return "Il server non ha nessun dispositivo iscritto: disattiva e riattiva le notifiche.";
  return `La prova non è arrivata a nessun dispositivo. ${r.errors?.length ? `Risposta del servizio push: ${r.errors.join(" · ")}` : ""}`.trim();
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      let s: PushStatus;
      try {
        s = await currentStatus();
      } catch {
        if (!stop) setStatus("unsupported");
        return;
      }
      // Lo stato del telefono si mostra subito; la verifica col server segue in background.
      if (!stop) setStatus(s);
      // "Attive" solo se anche il server conosce questo dispositivo: altrimenti lo si iscrive di nuovo.
      if (s === "on") {
        try {
          const sub = await (await registration()).pushManager.getSubscription();
          const r = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub!.endpoint)}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null));
          if (r && !r.thisDevice) await send(sub!);
        } catch (e) {
          if (!stop) setStatus("off");
          if (!stop) setError(`Questo dispositivo non risulta iscritto sul server (${e instanceof Error ? e.message : String(e)}). Riattiva le notifiche.`);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
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
      // Un'iscrizione fatta con chiavi diverse non funzionerebbe: si rifà da capo.
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe().catch(() => {});
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await send(sub);
      setStatus("on");
      const r = (await fetch("/api/push/test", { method: "POST" }).then((x) => x.json())) as TestResult;
      const why = explain(r);
      if (why) setError(why);
      else setNotice("Fatto: dovresti aver ricevuto una notifica di prova.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
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
    setNotice(null);
    try {
      const r = (await fetch("/api/push/test", { method: "POST" }).then((x) => x.json())) as TestResult;
      const why = explain(r);
      if (why) setError(why);
      else setNotice(`Inviata a ${r.sent} ${r.sent === 1 ? "dispositivo" : "dispositivi"}.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, notice, enable, disable, test };
}

async function send(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), device: deviceName() }),
  });
  if (!res.ok) throw new Error(`Iscrizione rifiutata dal server: ${(await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`}`);
}
