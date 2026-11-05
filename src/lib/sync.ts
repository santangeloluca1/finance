"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { PortfolioData } from "./store";
import { getCurrentData, getSyncMeta, setData, setSyncMeta, subscribeData } from "./store";

/**
 * Sincronizzazione del portafoglio con il server (Neon).
 * Copia locale per aprire subito l'app e lavorare offline; ogni modifica viene
 * inviata dopo un secondo, e al ritorno in primo piano si scaricano le novità.
 */

export type SyncState = "idle" | "syncing" | "ok" | "offline" | "error";

interface Status {
  state: SyncState;
  at: number | null;
  message?: string;
}

let status: Status = { state: "idle", at: null };
const statusListeners = new Set<() => void>();
function setStatus(next: Status) {
  status = next;
  statusListeners.forEach((l) => l());
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

type ServerDoc = { data: PortfolioData | null; updatedAt: string | null };

/** Unisce due versioni: movimenti, strumenti e conti per id; a parità di id vince la versione locale. */
export function merge(local: PortfolioData, remote: PortfolioData): PortfolioData {
  const byId = <T,>(a: T[], b: T[], key: (x: T) => string) => {
    const map = new Map(b.map((x) => [key(x), x]));
    for (const x of a) map.set(key(x), x);
    return [...map.values()];
  };
  return {
    accounts: byId(local.accounts, remote.accounts, (a) => a.id),
    instruments: byId(local.instruments, remote.instruments, (i) => i.isin),
    transactions: byId(local.transactions, remote.transactions, (t) => t.id),
    isDemo: false,
  };
}

let pushing = false;

async function push(retry = true): Promise<void> {
  const data = getCurrentData();
  if (data.isDemo || pushing) return;
  pushing = true;
  setStatus({ ...status, state: "syncing" });
  try {
    const res = await fetch("/api/portfolio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, baseUpdatedAt: getSyncMeta().updatedAt }),
    });
    if (res.status === 409 && retry) {
      // Modifiche arrivate da un altro dispositivo: unisco e riprovo.
      const remote = (await res.json()) as ServerDoc;
      if (remote.data) setData(merge(getCurrentData(), remote.data));
      setSyncMeta({ updatedAt: remote.updatedAt, dirty: true });
      pushing = false;
      return push(false);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { updatedAt } = (await res.json()) as { updatedAt: string };
    // Se nel frattempo ci sono state altre modifiche resta "dirty".
    const stillSame = getCurrentData() === data;
    setSyncMeta({ updatedAt, dirty: !stillSame });
    setStatus({ state: "ok", at: Date.now() });
    pushing = false;
    if (!stillSame) schedulePush();
  } catch (e) {
    pushing = false;
    setStatus({ state: navigator.onLine ? "error" : "offline", at: status.at, message: String(e) });
  }
}

async function pull(): Promise<void> {
  setStatus({ ...status, state: "syncing" });
  try {
    const res = await fetch("/api/portfolio", { cache: "no-store" });
    if (res.status === 401) return setStatus({ state: "idle", at: null });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = (await res.json()) as ServerDoc;
    const meta = getSyncMeta();
    const local = getCurrentData();

    if (!remote.data) {
      // Primo avvio: carico sul server quello che c'è già sul telefono.
      if (!local.isDemo) return push();
      return setStatus({ state: "ok", at: Date.now() });
    }
    if (meta.dirty && !local.isDemo) {
      if (remote.updatedAt !== meta.updatedAt) {
        setData(merge(local, remote.data));
        setSyncMeta({ updatedAt: remote.updatedAt, dirty: true });
      }
      return push();
    }
    if (remote.updatedAt !== meta.updatedAt || local.isDemo) {
      setData({ ...remote.data, isDemo: false }, { fromServer: true });
      setSyncMeta({ updatedAt: remote.updatedAt, dirty: false });
    }
    setStatus({ state: "ok", at: Date.now() });
  } catch (e) {
    setStatus({ state: navigator.onLine ? "error" : "offline", at: status.at, message: String(e) });
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void push(), 1000);
}

/** Da montare una volta nell'app (fuori dalla schermata di accesso). */
export function useCloudSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void pull();
    const unsub = subscribeData(() => {
      if (getSyncMeta().dirty) schedulePush();
    });
    const onVisible = () => document.visibilityState === "visible" && void pull();
    const onOnline = () => void pull();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled]);
}
