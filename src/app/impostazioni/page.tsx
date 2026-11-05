"use client";

import { useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BackLink, LargeTitle, Panel, SectionHeader, Segmented } from "@/components/ui";
import { resetToDemo, setData, type PortfolioData } from "@/lib/store";
import { useTheme, type ThemePref } from "@/lib/theme";

export default function Impostazioni() {
  const { data } = usePortfolioCtx();
  const [theme, setTheme] = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `portafoglio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as PortfolioData;
      if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.instruments) || !Array.isArray(parsed.accounts)) throw new Error("il file non è un backup di Portafoglio");
      setData({ ...parsed, isDemo: false });
      setMsg(`Ripristinate ${parsed.transactions.length} operazioni.`);
    } catch (e) {
      setMsg(`Ripristino non riuscito: ${(e as Error).message}. Scegli un file .json esportato da qui.`);
    }
  };

  const row = "flex w-full items-center gap-3 border-b border-sep px-4 py-3.5 text-left text-[16px] last:border-0 active:bg-panel-2";

  return (
    <div>
      <BackLink href="/" label="Home" />
      <LargeTitle>Impostazioni</LargeTitle>

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
          <Upload size={20} className="text-accent" /> Ripristina da backup
        </button>
        <button
          onClick={() => {
            if (confirm("Sostituire i tuoi dati con il portafoglio di esempio? L'operazione non si può annullare senza un backup.")) resetToDemo();
          }}
          className={`${row} text-dn`}
        >
          <RotateCcw size={20} /> Carica portafoglio di esempio
        </button>
      </Panel>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
      {msg && <p className="px-8 pt-2 text-[13px] text-mut">{msg}</p>}
      <p className="px-8 pt-2 text-[13px] leading-snug text-mut">I dati restano su questo dispositivo. La sincronizzazione tra dispositivi arriverà in seguito.</p>

      <SectionHeader>Fonti</SectionHeader>
      <Panel>
        <p className="px-4 py-3.5 text-[14px] leading-relaxed text-ink-2">
          Quotazioni Yahoo Finance aggiornate ogni 5 minuti, cambi BCE, loghi Parqet. Le borse europee hanno circa 15 minuti di ritardo.
        </p>
      </Panel>
    </div>
  );
}
