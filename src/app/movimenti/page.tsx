"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, Download, FileUp, RotateCcw, Scissors, Upload } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { AccountDot, Card, PageHeader } from "@/components/ui";
import { resetToDemo, setData, type PortfolioData } from "@/lib/store";
import { fmtDate, fmtEur, fmtNum, fmtPrice } from "@/lib/format";
import type { Transaction } from "@/lib/engine/types";

const META = {
  buy: { label: "Acquisto", icon: ArrowDownLeft, cls: "bg-accent/15 text-accent" },
  sell: { label: "Vendita", icon: ArrowUpRight, cls: "bg-warn/15 text-warn" },
  dividend: { label: "Cedola/dividendo", icon: Coins, cls: "bg-gain/15 text-gain" },
  split: { label: "Frazionamento", icon: Scissors, cls: "bg-surface-3 text-muted" },
} as const;

export default function Movimenti() {
  const { data } = usePortfolioCtx();
  const [filter, setFilter] = useState<string>("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const instruments = useMemo(() => new Map(data.instruments.map((i) => [i.isin, i])), [data.instruments]);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);

  const months = useMemo(() => {
    const txs = data.transactions.filter((t) => filter === "all" || t.account === filter).sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, Transaction[]>();
    for (const t of txs) {
      const k = t.date.slice(0, 7);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()];
  }, [data.transactions, filter]);

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
      if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.instruments) || !Array.isArray(parsed.accounts)) throw new Error("formato non valido");
      setData({ ...parsed, isDemo: false });
      setMsg(`Importate ${parsed.transactions.length} operazioni.`);
    } catch (e) {
      setMsg(`Impossibile leggere il file: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Movimenti" subtitle={`${data.transactions.length} operazioni`} />

      <Card>
        <p className="text-[14px] font-semibold">Importa dalla banca</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Presto potrai caricare qui gli export di Fineco, Isybank e Revolut: l&apos;app riconoscerà il formato e ricalcolerà prezzi medi e
          zainetto.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {data.accounts.map((a) => (
            <button key={a.id} disabled className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2 py-3 text-[12px] font-semibold text-muted opacity-70">
              <FileUp size={18} style={{ color: a.color }} />
              {a.name}
              <span className="text-[10px] font-medium text-faint">in arrivo</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] font-semibold">
          <button onClick={exportBackup} className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5 active:scale-95">
            <Download size={15} /> Backup
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5 active:scale-95">
            <Upload size={15} /> Ripristina
          </button>
          <button
            onClick={() => {
              if (confirm("Sostituire i dati con il portafoglio di esempio?")) resetToDemo();
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5 active:scale-95"
          >
            <RotateCcw size={15} /> Esempio
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
        {msg && <p className="mt-2 text-[12px] text-muted">{msg}</p>}
      </Card>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {[{ id: "all", name: "Tutti", color: "" }, ...data.accounts].map((a) => (
          <button
            key={a.id}
            onClick={() => setFilter(a.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold ${filter === a.id ? "bg-text text-bg" : "bg-surface-2 text-muted"}`}
          >
            {a.color && <AccountDot color={a.color} />}
            {a.name}
          </button>
        ))}
      </div>

      {months.map(([month, txs]) => (
        <section key={month}>
          <h2 className="mb-2 px-1 text-[13px] font-semibold capitalize text-muted">{fmtDate(`${month}-01`, { month: "long", year: "numeric" })}</h2>
          <Card className="px-3 py-1">
            <ul className="divide-y divide-line">
              {txs.map((t) => {
                const ins = instruments.get(t.isin);
                const m = META[t.type];
                const Icon = m.icon;
                const total = t.type === "dividend" ? t.amount ?? 0 : ((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1);
                return (
                  <li key={t.id} className="flex items-center gap-3 px-1 py-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${m.cls}`}>
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{ins?.shortName ?? ins?.name ?? t.isin}</p>
                      <p className="flex items-center gap-1.5 text-[12px] text-muted">
                        <AccountDot color={accounts.get(t.account)?.color ?? "#888"} />
                        {m.label} · {fmtDate(t.date, { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div className="num shrink-0 text-right">
                      <p className={`text-[14px] font-semibold ${t.type === "dividend" ? "text-gain" : ""}`}>
                        {t.type === "buy" ? "−" : t.type === "split" ? "" : "+"}
                        {t.type === "split" ? `× ${t.splitRatio}` : fmtEur(total)}
                      </p>
                      {(t.type === "buy" || t.type === "sell") && (
                        <p className="text-[11px] text-faint">
                          {fmtNum(t.quantity ?? 0)} × {fmtPrice(t.price ?? 0, ins?.currency ?? "EUR")}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
