"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste, Download, History, RotateCcw, Upload } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BackLink, LargeTitle, Panel, SectionHeader } from "@/components/ui";
import { resetToDemo, setData } from "@/lib/store";
import { merge, replaceAndPush, useSyncStatus } from "@/lib/sync";
import { reviveFrom } from "@/lib/merge";
import { validatePortfolioData, validatePortfolioShape } from "@/lib/validate";
import type { SnapshotInfo } from "@/lib/snapshots";
import { fmtN, fmtTime } from "@/lib/format";

/**
 * Legge un backup anche se arriva "sporco": testo codificato come URL (%7B…),
 * con spazi o caratteri attorno, o incollato da una chat. Un PDF viene segnalato.
 */
function parseBackup(raw: string): unknown {
  let text = raw.replace(/^\uFEFF/, "").trim();
  if (text.startsWith("%PDF")) throw new Error("hai scelto un PDF, non il file .json");
  if (/^%7B/i.test(text) || /^data:/i.test(text)) {
    try {
      text = decodeURIComponent(text.replace(/^data:[^,]*,/i, ""));
    } catch {}
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("nel testo non c'è un backup");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("il file è danneggiato o incompleto (JSON non leggibile)");
  }
}

export default function DatiBackup() {
  const { data } = usePortfolioCtx();
  const sync = useSyncStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `basis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importText = (text: string) => {
    try {
      const checked = validatePortfolioData(parseBackup(text));
      if (!checked.ok) throw new Error(checked.error);
      const parsed = checked.data;
      // Con dati reali già presenti il file si aggiunge (a parità di id vince il file),
      // così importare una sola banca non cancella le altre.
      if (data.isDemo) {
        setData({ ...parsed, isDemo: false });
        setMsg(`Importate ${parsed.transactions.length} operazioni.`);
      } else {
        // Quello che c'è nel file torna anche se qui era stato eliminato.
        const next = merge(parsed, reviveFrom(data, parsed));
        setData(next);
        setMsg(`Importate ${parsed.transactions.length} operazioni (${next.transactions.length - data.transactions.length} nuove), unite a quelle già presenti.`);
      }
    } catch (e) {
      setMsg(`Ripristino non riuscito: ${(e as Error).message}. Nessun dato è stato modificato.`);
    }
  };

  const importFile = async (file: File) => importText(await file.text());

  const importClipboard = async () => {
    try {
      importText(await navigator.clipboard.readText());
    } catch {
      setMsg("Non riesco a leggere gli appunti: copia il contenuto del file e riprova, consentendo l'accesso quando Safari lo chiede.");
    }
  };

  const row = "flex w-full items-center gap-3 border-b border-sep px-4 py-3.5 text-left text-[16px] last:border-0 active:bg-panel-2";

  return (
    <div>
      <BackLink href="/impostazioni" label="Impostazioni" />
      <LargeTitle>Dati e backup</LargeTitle>
      <Panel>
        <button onClick={exportBackup} className={row}>
          <Download size={20} className="text-accent" /> Esporta backup
        </button>
        <button onClick={() => fileRef.current?.click()} className={row}>
          <Upload size={20} className="text-accent" /> Importa da file
        </button>
        <button onClick={importClipboard} className={row}>
          <ClipboardPaste size={20} className="text-accent" /> Incolla dagli appunti
        </button>
      </Panel>
      <Panel className="mt-6">
        <button
          onClick={() => {
            if (confirm("Mostrare il portafoglio di esempio su questo dispositivo? I tuoi dati restano salvati nel tuo account e torneranno alla prossima sincronizzazione.")) resetToDemo();
          }}
          className={`${row} text-dn`}
        >
          <RotateCcw size={20} /> Carica portafoglio di esempio
        </button>
      </Panel>
      {/* Senza "accept": su iOS il filtro application/json rende i file .json non selezionabili. */}
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importFile(f);
        }}
      />
      {msg && <p className="px-8 pt-2 text-[13px] text-mut">{msg}</p>}
      <p className="flex items-center gap-2 px-8 pt-2 text-[13px] leading-snug text-mut">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            sync.state === "ok" ? "bg-up" : sync.state === "syncing" ? "animate-pulse bg-accent" : sync.state === "idle" ? "bg-faint" : "bg-warn"
          }`}
        />
        {data.isDemo
          ? "Stai vedendo l'esempio: i tuoi dati si sincronizzano dal primo movimento che inserisci."
          : sync.state === "syncing"
            ? "Sincronizzazione in corso…"
            : sync.state === "ok"
              ? `Sincronizzato con il tuo account${sync.at ? ` alle ${fmtTime(sync.at)}` : ""}. I dati sono disponibili su tutti i tuoi dispositivi.`
              : sync.state === "offline"
                ? "Sei offline: le modifiche restano sul telefono e verranno inviate appena torni online."
                : sync.state === "error"
                  ? `Sincronizzazione non riuscita${sync.message ? ` (${sync.message})` : ""}: riprovo automaticamente. Le modifiche restano sul telefono.`
                  : "In attesa di sincronizzazione."}
      </p>
      {!data.isDemo && <Versions />}
    </div>
  );
}

type VersionsState = { kind: "loading" } | { kind: "offline" } | { kind: "error"; message: string } | { kind: "ready"; list: SnapshotInfo[] };

const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Versioni precedenti salvate sul server (vedi lib/snapshots.ts). Ripristinarne
 * una sostituisce i dati e la invia subito, chiedendo al server di conservare
 * anche la versione che viene sostituita: il ripristino si può annullare.
 */
function Versions() {
  const [state, setState] = useState<VersionsState>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return setState({ kind: "offline" });
    setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    try {
      const res = await fetch("/api/portfolio/snapshots", { cache: "no-store" });
      if (res.status === 503) return setState({ kind: "error", message: "Il database non è configurato: le versioni precedenti non sono disponibili." });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { snapshots } = (await res.json()) as { snapshots: SnapshotInfo[] };
      setState({ kind: "ready", list: snapshots });
    } catch (e) {
      setState(navigator.onLine ? { kind: "error", message: `Non riesco a caricare le versioni (${(e as Error).message}).` } : { kind: "offline" });
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [load]);

  const restore = async (v: SnapshotInfo) => {
    const when = fmtStamp(v.createdAt);
    if (!confirm(`Ripristinare la versione del ${when} (${fmtN(v.transactions)} movimenti)? I dati attuali verranno sostituiti su tutti i dispositivi, ma restano tra le versioni precedenti.`)) return;
    setBusy(v.id);
    setNote(null);
    try {
      const res = await fetch(`/api/portfolio/snapshots?id=${encodeURIComponent(v.id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 404 ? "versione non trovata" : `HTTP ${res.status}`);
      const { data } = (await res.json()) as { data: unknown };
      const checked = validatePortfolioShape(data);
      if (!checked.ok) throw new Error(`la versione salvata non è leggibile (${checked.error})`);
      const sent = await replaceAndPush(checked.data);
      setNote(
        sent
          ? `Ripristinata la versione del ${when}. Quella sostituita è ora la prima dell'elenco.`
          : `Versione del ${when} ripristinata su questo dispositivo, ma l'invio al server non è riuscito: riprovo con la prossima sincronizzazione.`,
      );
      await load();
    } catch (e) {
      setNote(`Ripristino non riuscito: ${(e as Error).message}. Nessun dato è stato modificato.`);
    } finally {
      setBusy(null);
    }
  };

  const row = "flex min-h-[56px] items-center justify-between gap-3 border-b border-sep px-4 py-2.5 last:border-0";

  return (
    <section>
      <SectionHeader>Versioni precedenti</SectionHeader>
      <Panel>
        {state.kind === "loading" && (
          <div className={row}>
            <span className="skeleton h-4 w-40 rounded" />
          </div>
        )}
        {state.kind === "offline" && <p className="px-4 py-3.5 text-[15px] text-mut">Non disponibile offline: le versioni sono salvate sul server.</p>}
        {state.kind === "error" && <p className="px-4 py-3.5 text-[15px] text-mut">{state.message}</p>}
        {state.kind === "ready" && !state.list.length && (
          <p className="px-4 py-3.5 text-[15px] text-mut">Ancora nessuna versione: la prima viene salvata alla prossima modifica.</p>
        )}
        {state.kind === "ready" &&
          state.list.map((v) => (
            <div key={v.id} className={row}>
              <div className="min-w-0">
                <p className="text-[15px] text-ink-2">{fmtStamp(v.createdAt)}</p>
                <p className="text-[12px] text-mut">
                  {fmtN(v.transactions)} {v.transactions === 1 ? "movimento" : "movimenti"} · {fmtN(v.instruments)} {v.instruments === 1 ? "titolo" : "titoli"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void restore(v)}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-[14px] font-semibold text-accent active:opacity-60 disabled:opacity-40"
              >
                <History size={15} /> {busy === v.id ? "Ripristino…" : "Ripristina"}
              </button>
            </div>
          ))}
      </Panel>
      <p className="px-8 pt-2 text-[13px] leading-snug text-mut">
        {note ?? "Il server conserva una copia prima delle modifiche (al massimo ogni 6 ore, e sempre quando spariscono dei movimenti). Restano le ultime 30."}
      </p>
    </section>
  );
}
