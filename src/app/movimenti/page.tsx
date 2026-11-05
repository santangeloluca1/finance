"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, FileUp, Plus, Scissors, Wallet } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BankDot, Chip, ChipRow, LargeTitle, Logo, Panel } from "@/components/ui";
import { fmtDate, fmtEur, fmtNum, fmtPrice } from "@/lib/format";
import type { Transaction } from "@/lib/engine/types";

const META = {
  buy: { label: "Acquisto", icon: ArrowDownLeft },
  sell: { label: "Vendita", icon: ArrowUpRight },
  dividend: { label: "Cedola/dividendo", icon: Coins },
  split: { label: "Frazionamento", icon: Scissors },
  cash: { label: "Saldo liquidità", icon: Wallet },
} as const;

type Kind = "all" | Transaction["type"];

export default function Movimenti() {
  const { data } = usePortfolioCtx();
  const [account, setAccount] = useState("all");
  const [kind, setKind] = useState<Kind>("all");

  const instruments = useMemo(() => new Map(data.instruments.map((i) => [i.isin, i])), [data.instruments]);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);

  const months = useMemo(() => {
    const txs = data.transactions
      .filter((t) => (account === "all" || t.account === account) && (kind === "all" || t.type === kind))
      .sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, Transaction[]>();
    for (const t of txs) map.set(t.date.slice(0, 7), [...(map.get(t.date.slice(0, 7)) ?? []), t]);
    return [...map.entries()];
  }, [data.transactions, account, kind]);

  return (
    <div>
      <LargeTitle
        right={
          <Link
            href="/movimenti/nuovo"
            aria-label="Aggiungi movimento"
            className="mb-1.5 flex h-10 items-center gap-1.5 rounded-full bg-ink pl-3 pr-4 text-[15px] font-semibold text-bg active:opacity-80"
          >
            <Plus size={18} strokeWidth={2.6} /> Aggiungi
          </Link>
        }
      >
        Movimenti
      </LargeTitle>

      <Panel className="mb-5">
        <div className="px-4 pt-4">
          <p className="text-[17px] font-semibold">Importa dalla banca</p>
          <p className="mt-1 text-[14px] leading-snug text-mut">
            Carica l&apos;export dei movimenti titoli: prezzi medi e zainetto si ricalcolano da soli. Nel frattempo puoi aggiungere i movimenti a mano con il pulsante Aggiungi.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4">
          {data.accounts.map((a) => (
            <button
              key={a.id}
              disabled
              aria-label={`Importa da ${a.name}, in arrivo`}
              className="flex flex-col items-center gap-1 rounded-[12px] bg-panel-2 py-3 text-[13px] font-semibold text-ink-2 disabled:opacity-60"
            >
              <FileUp size={20} style={{ color: a.color }} />
              {a.name}
              <span className="text-[11px] font-medium text-mut">in arrivo</span>
            </button>
          ))}
        </div>
      </Panel>

      <ChipRow>
        <Chip active={account === "all"} onClick={() => setAccount("all")}>
          Tutti i conti
        </Chip>
        {data.accounts.map((a) => (
          <Chip key={a.id} active={account === a.id} onClick={() => setAccount(a.id)}>
            <BankDot color={a.color} />
            {a.name}
          </Chip>
        ))}
      </ChipRow>
      <div className="mt-2">
        <ChipRow>
          {(["all", "buy", "sell", "dividend", "cash"] as Kind[]).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {k === "all" ? "Tutte le operazioni" : k === "buy" ? "Acquisti" : k === "sell" ? "Vendite" : k === "dividend" ? "Cedole" : "Liquidità"}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {months.length === 0 && <p className="px-4 py-10 text-center text-[15px] text-mut">Nessuna operazione con questi filtri.</p>}

      {months.map(([month, txs]) => (
        <section key={month}>
          <h2 className="px-4 pb-2 pt-6 text-[20px] font-bold capitalize tracking-[-0.02em]">{fmtDate(`${month}-01`, { month: "long", year: "numeric" })}</h2>
          <Panel>
            {txs.map((t) => {
              const ins = instruments.get(t.isin);
              const m = META[t.type];
              const Icon = m.icon;
              const total = t.type === "dividend" || t.type === "cash" ? t.amount ?? 0 : ((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1);
              const name = t.type === "cash" ? "Liquidità" : ins?.shortName ?? ins?.name ?? t.isin;
              return (
                <Link
                  href={t.id.startsWith("demo-") ? "#" : `/movimenti/nuovo?id=${t.id}`}
                  key={t.id}
                  className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0 active:bg-panel-2"
                >
                  <div className="relative">
                    {t.type === "cash" ? (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chip text-ink">
                        <Wallet size={18} />
                      </span>
                    ) : (
                      <Logo isin={t.isin} name={name} size={40} />
                    )}
                    <span
                      className={`absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-panel ${
                        t.type === "dividend" ? "bg-up text-white" : t.type === "sell" ? "bg-warn text-white" : "bg-ink text-bg"
                      }`}
                    >
                      <Icon size={10} strokeWidth={3} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mut">
                      <BankDot color={accounts.get(t.account)?.color ?? "#888"} size={7} />
                      {m.label} · {fmtDate(t.date, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <div className="num shrink-0 text-right">
                    <p className={`text-[16px] font-semibold ${t.type === "dividend" ? "text-up" : ""}`}>
                      {t.type === "split" ? `× ${t.splitRatio}` : `${t.type === "buy" ? "−" : "+"}${fmtEur(total)}`}
                    </p>
                    {(t.type === "buy" || t.type === "sell") && (
                      <p className="text-[12px] text-mut">
                        {fmtNum(t.quantity ?? 0)} × {fmtPrice(t.price ?? 0, ins?.currency ?? "EUR")}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </Panel>
        </section>
      ))}
    </div>
  );
}
