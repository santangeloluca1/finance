"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Repeat } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BankDot, LargeTitle, SelectButton } from "@/components/ui";
import { fmtDate, fmtEur, fmtNum, fmtPrice } from "@/lib/format";
import type { Transaction } from "@/lib/engine/types";

const META = {
  buy: { verb: "Acquistato" },
  sell: { verb: "Venduto" },
  dividend: { verb: "Cedola o dividendo" },
  split: { verb: "Frazionamento" },
  cash: { verb: "Saldo del conto" },
  deposit: { verb: "Versamento" },
  withdrawal: { verb: "Prelievo" },
  transfer: { verb: "Bonifico" },
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
      .filter((t) => (account === "all" || t.account === account || t.toAccount === account) && (kind === "all" || t.type === kind))
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
            className="mb-1 flex h-11 items-center gap-1 rounded-full bg-chip pl-3 pr-4 text-[15px] font-semibold text-ink active:opacity-70"
          >
            <Plus size={18} strokeWidth={2.6} /> Aggiungi
          </Link>
        }
      >
        Movimenti
      </LargeTitle>

      <div className="flex items-center gap-5 px-4">
        <span className="flex items-center gap-1.5">
          {accounts.get(account) && <BankDot color={accounts.get(account)!.color} />}
          <SelectButton
            label="Conto"
            value={account}
            onChange={setAccount}
            options={[{ value: "all", label: "Tutti i conti" }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]}
          />
        </span>
        <SelectButton
          label="Tipo di operazione"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "Tutte le operazioni" },
            { value: "buy", label: "Acquisti" },
            { value: "sell", label: "Vendite" },
            { value: "dividend", label: "Cedole" },
            { value: "deposit", label: "Versamenti" },
            { value: "withdrawal", label: "Prelievi" },
            { value: "transfer", label: "Bonifici" },
            { value: "cash", label: "Saldi" },
          ]}
        />
        <Link href="/ricorrenti" className="ml-auto flex min-h-[36px] items-center gap-1 text-[15px] font-semibold text-accent">
          <Repeat size={17} /> Ricorrenti
        </Link>
      </div>

      {months.length === 0 && <p className="px-4 py-10 text-center text-[15px] text-mut">Nessuna operazione con questi filtri.</p>}

      {months.map(([month, txs]) => (
        <section key={month}>
          <h2 className="px-4 pb-1 pt-7 text-[15px] font-medium capitalize text-mut">{fmtDate(`${month}-01`, { month: "long", year: "numeric" })}</h2>
          <ul>
            {txs.map((t) => {
              const ins = instruments.get(t.isin);
              const m = META[t.type];
              const cashTx = t.type === "cash" || t.type === "deposit" || t.type === "withdrawal" || t.type === "transfer";
              const total = t.type === "dividend" || cashTx ? t.amount ?? 0 : ((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1);
              const name = t.type === "transfer" ? "Bonifico" : t.type === "deposit" ? "Versamento" : t.type === "withdrawal" ? "Prelievo" : t.type === "cash" ? "Liquidità" : ins?.shortName ?? ins?.name ?? t.isin;
              const detail =
                t.type === "buy" || t.type === "sell"
                  ? `${m.verb} ${fmtNum(t.quantity ?? 0)} a ${fmtPrice(t.price ?? 0, ins?.currency ?? "EUR")}`
                  : t.type === "split"
                    ? `Frazionamento ${t.splitRatio}:1`
                    : t.type === "transfer"
                      ? `${accounts.get(t.account)?.name ?? t.account} → ${accounts.get(t.toAccount ?? "")?.name ?? t.toAccount}`
                      : t.note || m.verb;
              return (
                <li key={t.id}>
                  <Link
                    href={t.id.startsWith("demo-") ? "#" : `/movimenti/nuovo?id=${t.id}`}
                    className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2"
                  >
                    <span className="num w-[42px] shrink-0 text-[15px] text-mut">{fmtDate(t.date, { day: "2-digit", month: "2-digit" }).replace("/", ".")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-mut">
                        <BankDot color={accounts.get(t.account)?.color ?? "#888"} size={7} />
                        <span className="num truncate">{detail}</span>
                      </p>
                    </div>
                    <p className={`num sensitive shrink-0 text-[17px] font-medium ${t.type === "dividend" || t.type === "sell" || t.type === "deposit" ? "text-up" : ""}`}>
                      {t.type === "split" ? "" : t.type === "cash" || t.type === "transfer" ? fmtEur(total) : `${t.type === "buy" || t.type === "withdrawal" ? "−" : "+"}${fmtEur(total)}`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
