"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { BankDot, InfoRow, Panel, SectionHeader, Switch } from "@/components/ui";
import type { Account, Transaction } from "@/lib/engine/types";
import { fmtDate, fmtEur0, fmtN } from "@/lib/format";
import type { RecurringPlan } from "@/lib/recurring";
import { openPeriod, spendingAccounts, spendingByMonth, spendingSummary, type SpendingMonth } from "@/lib/spending";
import { setSpendingAccount } from "@/lib/store";

/**
 * Spese mensili ricavate dai saldi dei conti usati per le spese quotidiane:
 * entrate, soldi investiti, spese e quanto è rimasto sul conto.
 */

const PARTS = [
  { key: "spent", label: "Spese", color: "var(--sp-spent)" },
  { key: "invested", label: "Investito", color: "var(--sp-invested)" },
  { key: "saved", label: "Rimasto sul conto", color: "var(--sp-kept)" },
] as const;

export function Spese({ accounts, transactions, recurring, isDemo }: { accounts: Account[]; transactions: Transaction[]; recurring: RecurringPlan[]; isDemo: boolean }) {
  const spending = spendingAccounts(accounts);
  const months = useMemo(() => spendingByMonth(transactions, accounts), [transactions, accounts]);
  const summary = useMemo(() => spendingSummary(months), [months]);
  const open = useMemo(() => spending.map((a) => ({ a, p: openPeriod(transactions, a.id) })), [spending, transactions]);
  const noSalary = spending.filter((a) => !recurring.some((p) => p.kind === "deposit" && p.account === a.id && p.active));

  return (
    <div>
      {!spending.length ? (
        <div className="flex flex-col items-center px-8 pt-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-ink-2">
            <Wallet size={24} />
          </span>
          <p className="mt-4 text-[17px] font-semibold">Quanto spendi ogni mese?</p>
          <p className="mt-1 text-[15px] leading-snug text-mut">
            Scegli qui sotto il conto che usi anche per le spese quotidiane. Quando confermi lo stipendio ti chiederemo il saldo del conto: dalla differenza con il mese prima ricaviamo le spese, senza registrare i singoli pagamenti.
          </p>
        </div>
      ) : !months.length ? (
        <p className="px-4 pt-6 text-[15px] leading-snug text-mut">
          Il primo resoconto arriva quando ci sono due saldi. Alla prossima conferma dello stipendio in{" "}
          <Link href="/ricorrenti" className="font-semibold text-accent">
            Ricorrenti
          </Link>{" "}
          inserisci anche il saldo del conto{open.some((o) => o.p) ? "" : ", oppure aggiungi un saldo da Movimenti"}.
        </p>
      ) : (
        summary && <Summary summary={summary} />
      )}

      {noSalary.length > 0 && (
        <Panel className="mt-5">
          <Link href="/ricorrenti" className="flex min-h-[56px] items-center gap-3 px-4 py-3 active:bg-panel-2">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Aggiungi lo stipendio</p>
              <p className="text-[13px] leading-snug text-mut">
                Su {noSalary.map((a) => a.name).join(" e ")} non c&apos;è uno stipendio ricorrente: con la sua conferma ogni mese ti chiediamo il saldo.
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-faint" />
          </Link>
        </Panel>
      )}

      {open.some((o) => o.p && (o.p.income || o.p.invested)) && (
        <>
          <SectionHeader>In corso</SectionHeader>
          <Panel>
            {open.map(({ a, p }) =>
              p && (p.income || p.invested) ? (
                <InfoRow
                  key={a.id}
                  label={`${a.name} dal ${fmtDate(p.from, { day: "numeric", month: "short" })}`}
                  hint="Le spese si calcolano al prossimo saldo"
                  value={
                    <>
                      {p.income ? `+${fmtEur0(p.income)} entrate` : ""}
                      {p.income && p.invested ? " · " : ""}
                      {p.invested ? `${fmtEur0(p.invested)} investiti` : ""}
                    </>
                  }
                />
              ) : null,
            )}
          </Panel>
        </>
      )}

      {months.length > 0 && (
        <>
          <SectionHeader>Mese per mese</SectionHeader>
          <Legend />
          <ul className="pt-1">
            {months.map((m) => (
              <MonthRow key={m.month} m={m} />
            ))}
          </ul>
        </>
      )}

      <SectionHeader>Conti per le spese</SectionHeader>
      <Panel>
        {accounts.map((a) => (
          <div key={a.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-sep px-4 last:border-0">
            <span className="flex items-center gap-2 text-[16px]">
              <BankDot color={a.color} />
              {a.name}
            </span>
            <Switch checked={!!a.spending} onChange={(v) => setSpendingAccount(a.id, v)} label={`Uso ${a.name} per le spese`} disabled={isDemo} />
          </div>
        ))}
      </Panel>
      <p className="px-4 pt-2 text-[13px] leading-snug text-mut">
        {isDemo
          ? "Disponibile quando inserisci i tuoi movimenti."
          : "Su questi conti il saldo si aggiorna a mano: gli acquisti non vengono bloccati e non ricevi avvisi di saldo negativo."}
      </p>
    </div>
  );
}

function Summary({ summary }: { summary: NonNullable<ReturnType<typeof spendingSummary>> }) {
  const per = (n: number) => n / summary.months;
  return (
    <>
      <div className="px-4 pt-6">
        <p className="text-[14px] text-mut">
          Spese medie al mese{summary.months > 1 ? `, ultimi ${summary.months} mesi` : ""}
        </p>
        <p className="num mt-1 text-[34px] font-bold tracking-[-0.03em]">{fmtEur0(per(summary.spent))}</p>
        {summary.savingsRate !== null && (
          <p className="mt-0.5 text-[15px] text-ink-2">
            Metti da parte il <span className="num font-semibold">{fmtN(Math.max(0, summary.savingsRate) * 100, { maximumFractionDigits: 0 })}%</span> di quello che entra
          </p>
        )}
      </div>
      <Panel className="mt-4">
        <InfoRow label="Entrate" value={fmtEur0(per(summary.income))} />
        <InfoRow label="Investito" hint="Bonifici verso altri conti e acquisti di titoli" value={fmtEur0(per(summary.invested))} />
        <InfoRow label="Rimasto sul conto" value={fmtEur0(per(summary.saved))} />
      </Panel>
    </>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-1 text-[13px] text-mut">
      {PARTS.map((p) => (
        <span key={p.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden />
          {p.label}
        </span>
      ))}
    </div>
  );
}

function MonthRow({ m }: { m: SpendingMonth }) {
  // La barra divide le entrate (o il totale delle uscite, se maggiore) tra le tre voci positive.
  const parts = PARTS.map((p) => ({ ...p, value: m[p.key] }));
  const positive = parts.filter((p) => p.value > 0);
  const total = positive.reduce((a, p) => a + p.value, 0);
  const label = fmtDate(`${m.month}-15`, { month: "long", year: "numeric" });
  return (
    <li className="border-b border-sep px-4 py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[17px] font-semibold capitalize-first">{label}</p>
        <p className="num text-[15px] text-ink-2">+{fmtEur0(m.income)}</p>
      </div>
      <p className="text-[13px] text-mut">
        Dal {fmtDate(m.from, { day: "numeric", month: "short" })} al {fmtDate(m.to, { day: "numeric", month: "short" })}
      </p>
      {total > 0 && (
        <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={parts.map((p) => `${p.label} ${fmtEur0(p.value)}`).join(", ")}>
          {positive.map((p) => (
            <span key={p.key} title={`${p.label}: ${fmtEur0(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
        </div>
      )}
      <div className="num mt-1.5 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
        {parts.map((p) => (
          <span key={p.key}>
            <span className="text-mut">{p.label}</span> {fmtEur0(p.value)}
          </span>
        ))}
      </div>
      {m.spent < 0 && <p className="mt-1 text-[13px] text-warn">Il saldo è più alto del previsto: manca qualche entrata da registrare?</p>}
    </li>
  );
}
