"use client";

import { useRef, useState } from "react";
import { Download, LogOut, RotateCcw, Upload } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BackLink, LargeTitle, Panel, SectionHeader, Segmented } from "@/components/ui";
import { clearLocalData, resetToDemo, setData, type PortfolioData } from "@/lib/store";
import { merge, useSyncStatus } from "@/lib/sync";
import { fmtTime } from "@/lib/format";
import { useTheme, type ThemePref } from "@/lib/theme";
import { BasisMark } from "@/components/BasisMark";

export default function Impostazioni() {
  const { data } = usePortfolioCtx();
  const [theme, setTheme] = useTheme();
  const { data: session } = authClient.useSession();
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

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as PortfolioData;
      if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.instruments) || !Array.isArray(parsed.accounts)) throw new Error("il file non è un backup di Basis");
      // Con dati reali già presenti il file si aggiunge (a parità di id vince il file),
      // così importare una sola banca non cancella le altre.
      if (data.isDemo) {
        setData({ ...parsed, isDemo: false });
        setMsg(`Importate ${parsed.transactions.length} operazioni.`);
      } else {
        const next = merge(parsed, data);
        setData(next);
        setMsg(`Importate ${parsed.transactions.length} operazioni (${next.transactions.length - data.transactions.length} nuove), unite a quelle già presenti.`);
      }
    } catch (e) {
      setMsg(`Ripristino non riuscito: ${(e as Error).message}. Scegli un file .json di Basis.`);
    }
  };

  const row = "flex w-full items-center gap-3 border-b border-sep px-4 py-3.5 text-left text-[16px] last:border-0 active:bg-panel-2";

  return (
    <div>
      <BackLink href="/" label="Home" />
      <LargeTitle>Impostazioni</LargeTitle>

      {session?.user && (
        <>
          <SectionHeader>Account</SectionHeader>
          <Panel>
            <div className="flex items-center gap-3 border-b border-sep px-4 py-3.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-chip text-[17px] font-semibold">
                {(session.user.name || session.user.email)[0]?.toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{session.user.name}</p>
                <p className="truncate text-[13px] text-mut">{session.user.email}</p>
              </div>
            </div>
            <button
              onClick={async () => {
                await authClient.signOut();
                clearLocalData();
                window.location.replace("/accedi");
              }}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[16px] text-dn active:bg-panel-2"
            >
              <LogOut size={20} /> Esci
            </button>
          </Panel>
        </>
      )}

      <SectionHeader>Aspetto</SectionHeader>
      <div className="px-4">
        <Segmented<ThemePref>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "auto", label: "Automatico" },
            { value: "light", label: "Chiaro" },
            { value: "dark", label: "Scuro" },
          ]}
        />
        <p className="px-1 pt-2 text-[13px] text-mut">Automatico segue l&apos;impostazione dell&apos;iPhone.</p>
      </div>

      <SectionHeader>Dati</SectionHeader>
      <Panel>
        <button onClick={exportBackup} className={row}>
          <Download size={20} className="text-accent" /> Esporta backup
        </button>
        <button onClick={() => fileRef.current?.click()} className={row}>
          <Upload size={20} className="text-accent" /> Importa da file
        </button>
        <button
          onClick={() => {
            if (confirm("Mostrare il portafoglio di esempio su questo dispositivo? I tuoi dati restano salvati nel tuo account e torneranno alla prossima sincronizzazione.")) resetToDemo();
          }}
          className={`${row} text-dn`}
        >
          <RotateCcw size={20} /> Carica portafoglio di esempio
        </button>
      </Panel>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
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
                  ? "Sincronizzazione non riuscita: riprovo automaticamente. Le modifiche restano sul telefono."
                  : "In attesa di sincronizzazione."}
      </p>

      <div className="flex flex-col items-center px-8 pb-2 pt-10 text-center">
        <span className="overflow-hidden rounded-[15px] shadow-[0_0_0_1px_var(--sep),0_8px_24px_rgb(0_0_0/0.18)]">
          <BasisMark size={64} />
        </span>
        <p className="mt-3 text-[20px] font-semibold tracking-[-0.03em]">Basis</p>
        <p className="mt-1 text-[13px] leading-snug text-mut">Il prezzo medio di carico, per banca, come lo calcolano le banche italiane.</p>
      </div>

      <SectionHeader>Fonti</SectionHeader>
      <Panel>
        <p className="px-4 py-3.5 text-[14px] leading-relaxed text-ink-2">
          Quotazioni Yahoo Finance aggiornate ogni 5 minuti, cambi BCE, loghi Parqet. Le borse europee hanno circa 15 minuti di ritardo.
        </p>
      </Panel>
    </div>
  );
}
