"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { PortfolioData } from "./store";
import { getCurrentData, getSyncMeta, setData, setSyncMeta, subscribeData } from "./store";
import { merge } from "./merge";

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

export { merge } from "./merge";

interface PushOpts {
  /** Chiede al server di salvare una versione precedente prima di sovrascriverla. */
  snapshot?: boolean;
  /** In caso di conflitto sostituisce la versione del server invece di unirla (ripristino). */
  overwrite?: boolean;
}

let inflight: Promise<boolean> | null = null;

/** Invia i dati locali; un solo invio alla volta (gli altri aspettano quello in corso). */
function push(opts: PushOpts = {}): Promise<boolean> {
  if (getCurrentData().isDemo) return Promise.resolve(false);
  inflight ??= send(opts).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function send(opts: PushOpts, retry = true): Promise<boolean> {
  const data = getCurrentData();
  setStatus({ ...status, state: "syncing" });
  try {
    const res = await fetch("/api/portfolio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, baseUpdatedAt: getSyncMeta().updatedAt, ...(opts.snapshot ? { snapshot: true } : {}) }),
    });
    if (res.status === 409 && retry) {
      const remote = (await res.json()) as ServerDoc;
      // Modifiche arrivate da un altro dispositivo: unisco e riprovo. Un ripristino invece
      // deve sostituire la versione del server (che resta tra le versioni precedenti).
      if (remote.data && !opts.overwrite) setData(merge(getCurrentData(), remote.data));
      setSyncMeta({ updatedAt: remote.updatedAt, dirty: true });
      return send(opts, false);
    }
    // Il server spiega cosa non va (es. "Dati non validi: Movimento 12: manca la data").
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
    const { updatedAt } = (await res.json()) as { updatedAt: string };
    // Se nel frattempo ci sono state altre modifiche resta "dirty".
    const stillSame = getCurrentData() === data;
    setSyncMeta({ updatedAt, dirty: !stillSame });
    setStatus({ state: "ok", at: Date.now() });
    if (!stillSame) schedulePush();
    return true;
  } catch (e) {
    setStatus({ state: navigator.onLine ? "error" : "offline", at: status.at, message: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/**
 * Sostituisce i dati con quelli indicati (es. una versione precedente) e li invia
 * subito, chiedendo al server di conservare la versione che viene sostituita.
 * Restituisce false se l'invio non è riuscito: i dati restano comunque sul dispositivo
 * e partono con la prossima sincronizzazione (unendosi però alle novità del server).
 */
export async function replaceAndPush(next: PortfolioData): Promise<boolean> {
  if (timer) clearTimeout(timer);
  // Aspetta l'invio in corso; da qui a push() niente await, così nessun altro invio si inserisce.
  while (inflight) await inflight.catch(() => false);
  setData({ ...next, isDemo: false });
  // setData ha programmato un invio normale: lo sostituisce quello forzato.
  if (timer) clearTimeout(timer);
  return push({ snapshot: true, overwrite: true });
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
      if (!local.isDemo) return void (await push());
      return setStatus({ state: "ok", at: Date.now() });
    }
    if (meta.dirty && !local.isDemo) {
      if (remote.updatedAt !== meta.updatedAt) {
        setData(merge(local, remote.data));
        setSyncMeta({ updatedAt: remote.updatedAt, dirty: true });
      }
      return void (await push());
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
