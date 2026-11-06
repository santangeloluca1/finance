"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Repeat, Trash2 } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BackLink, BankDot, InfoRow, LargeTitle, Logo, Panel, SectionHeader, Segmented, SelectButton, AddButton } from "@/components/ui";
import type { Instrument, Transaction } from "@/lib/engine/types";
import { fmtDate, fmtEur } from "@/lib/format";
import { detectPac } from "@/lib/pac";
import { lastAmount, pacQuantity, pendingOccurrences, priceOn, type HolidayRule, type Occurrence, type RecurringKind, type RecurringPlan } from "@/lib/recurring";
import { deleteRecurring, newId, SaveError, saveRecurring, saveTransaction, skipOccurrence } from "@/lib/store";

const KIND_LABEL: Record<RecurringKind, string> = { deposit: "Versamento", transfer: "Bonifico tra conti", pac: "PAC" };
const HOLIDAY_LABEL: Record<HolidayRule, string> = { same: "Sempre quel giorno", next: "Primo giorno di Borsa dopo", previous: "Ultimo giorno di Borsa prima" };

export default function RicorrentiPage() {
  // I dati stanno nel browser: la pagina parte dopo il montaggio.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? <Ricorrenti /> : null;
}

function Ricorrenti() {
  const { data, state } = usePortfolioCtx();
  const [editing, setEditing] = useState<RecurringPlan | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const plans = data.recurring ?? [];
  const pending = useMemo(() => pendingOccurrences(plans, data.transactions, data.recurringSkipped ?? [], today), [plans, data.transactions, data.recurringSkipped, today]);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const instruments = useMemo(() => new Map(data.instruments.map((i) => [i.isin, i])), [data.instruments]);

  // PAC riconosciuti negli acquisti ma senza un piano: si possono creare con un tocco.
  const suggestions = useMemo(() => {
    const open = (state?.positions ?? []).filter((p) => p.quantity > 0);
    return open
      .map((p) => ({ p, pac: detectPac(data.transactions, p.isin, p.account) }))
      .filter(({ p, pac }) => pac && !plans.some((x) => x.kind === "pac" && x.isin === p.isin && x.account === p.account));
  }, [state, data.transactions, plans]);

  const blank = (kind: RecurringKind): RecurringPlan => ({
    id: newId(),
    kind,
    label: kind === "deposit" ? "Stipendio" : kind === "transfer" ? "Bonifico" : "PAC",
    day: kind === "pac" ? 15 : 10,
    holiday: kind === "pac" ? "next" : "same",
    account: data.accounts[0]?.id ?? "",
    toAccount: kind === "transfer" ? data.accounts[1]?.id : undefined,
    since: today,
    active: true,
  });

  return (
    <div>
      <BackLink href="/movimenti" label="Movimenti" />
      <LargeTitle
        right={
          !editing && (
            <AddButton label="Nuovo piano ricorrente" onClick={() => setEditing(blank("deposit"))} />
          )
        }
      >
        Ricorrenti
      </LargeTitle>

      {editing ? (
        <PlanForm key={editing.id} initial={editing} isNew={!plans.some((p) => p.id === editing.id)} onDone={() => setEditing(null)} />
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <p className="px-4 pb-2 text-[15px] text-mut">
                {pending.length === 1 ? "Una rata da confermare" : `${pending.length} rate da confermare`}: controlla i valori con quelli della banca.
              </p>
              <div className="space-y-3">
                {pending.map((o, i) => (
                  <PendingCard key={o.id} occ={o} first={i === 0} />
                ))}
              </div>
            </>
          )}

          {plans.length === 0 ? (
            // Pagina vuota: solo il messaggio e un'azione, senza intestazioni.
            <div className="flex flex-col items-center px-8 pt-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chip text-ink-2">
                <Repeat size={24} />
              </span>
              <p className="mt-4 text-[17px] font-semibold">Nessuna operazione ricorrente</p>
              <p className="mt-1 text-[15px] leading-snug text-mut">
                Aggiungi lo stipendio, un bonifico ricorrente o un PAC: a ogni scadenza l&apos;app prepara la rata e tu la confermi.
              </p>
              <button onClick={() => setEditing(blank("deposit"))} className="mt-5 h-11 rounded-full bg-ink px-5 text-[15px] font-semibold text-bg active:opacity-80">
                Crea il primo piano
              </button>
            </div>
          ) : (
            <>
            <SectionHeader>Piani</SectionHeader>
            <ul>
              {plans.map((p) => {
                const ins = p.isin ? instruments.get(p.isin) : undefined;
                return (
                  <li key={p.id}>
                    <button onClick={() => setEditing(p)} className={`flex min-h-[64px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-panel-2 ${p.active ? "" : "opacity-50"}`}>
                      {ins ? (
                        <Logo isin={ins.isin} name={ins.shortName ?? ins.name} size={44} />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-ink-2">
                          {p.kind === "transfer" ? <ArrowRight size={19} /> : <Repeat size={19} />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-semibold">{p.label}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[14px] text-mut">
                          <BankDot color={accounts.get(p.account)?.color ?? "#888"} size={7} />
                          {p.kind === "transfer" ? `${accounts.get(p.account)?.name} → ${accounts.get(p.toAccount ?? "")?.name}` : accounts.get(p.account)?.name} · il {p.day}
                          {p.active ? "" : " · in pausa"}
                        </p>
                      </div>
                      <p className="num shrink-0 text-[17px] font-medium">
                        {p.kind === "pac" ? `fino a ${fmtEur(p.budget ?? 0)}` : p.amount ? (p.kind === "deposit" ? `~${fmtEur(p.amount)}` : fmtEur(p.amount)) : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}

          {suggestions.length > 0 && (
            <>
              <SectionHeader>Riconosciuti negli acquisti</SectionHeader>
              <ul>
                {suggestions.map(({ p, pac }) => {
                  const ins = instruments.get(p.isin)!;
                  return (
                    <li key={`${p.account}-${p.isin}`} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
                      <Logo isin={ins.isin} name={ins.shortName ?? ins.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-semibold">PAC {ins.shortName ?? ins.name}</p>
                        <p className="num mt-0.5 text-[14px] text-mut">
                          circa {fmtEur(pac!.monthly)} al mese · {pac!.installments} rate
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setEditing({
                            ...blank("pac"),
                            label: `PAC ${ins.shortName ?? ins.name}`,
                            account: p.account,
                            isin: p.isin,
                            budget: Math.ceil(pac!.monthly / 10) * 10,
                            day: Number(pac!.last.slice(8, 10)),
                          })
                        }
                        className="h-9 shrink-0 rounded-full bg-chip px-3.5 text-[14px] font-semibold active:opacity-70"
                      >
                        Crea
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Una rata da confermare, precompilata con la stima. */
function PendingCard({ occ, first }: { occ: Occurrence; first: boolean }) {
  const { data, state, priceSeries, quotes, fx } = usePortfolioCtx();
  const plan = occ.plan;
  const ins: Instrument | undefined = plan.isin ? data.instruments.find((i) => i.isin === plan.isin) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const account = data.accounts.find((a) => a.id === plan.account);
  const to = data.accounts.find((a) => a.id === plan.toAccount);

  const estPrice = ins ? (occ.date === today && quotes[ins.ticker]?.price) || priceOn(priceSeries[ins.ticker], occ.date) : undefined;
  const [date, setDate] = useState(occ.date);
  const [amount, setAmount] = useState(() => {
    const v = plan.kind === "deposit" ? lastAmount(plan, data.transactions) : plan.amount;
    return v ? String(v).replace(".", ",") : "";
  });
  const [price, setPrice] = useState(estPrice ? estPrice.toFixed(2).replace(".", ",") : "");
  const [qty, setQty] = useState(estPrice && plan.budget ? String(pacQuantity(plan.budget, estPrice)) : "");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // I prezzi storici arrivano dopo: la stima si compila appena c'è, se non hai già scritto.
  useEffect(() => {
    if (touched || !estPrice || plan.kind !== "pac") return;
    setPrice(estPrice.toFixed(2).replace(".", ","));
    if (plan.budget) setQty(String(pacQuantity(plan.budget, estPrice)));
  }, [estPrice, touched, plan.kind, plan.budget]);

  const p = num(price);
  const q = num(qty);
  const fxRate = ins && ins.currency !== "EUR" ? fx[ins.currency] : undefined;
  const total = plan.kind === "pac" ? (q * p) / (fxRate ?? 1) : num(amount);
  const available = state?.cash[plan.account]?.amount;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && (plan.kind === "pac" ? q > 0 && p > 0 && !!ins : num(amount) > 0);

  const confirm = () => {
    if (!valid) return;
    const tx: Transaction =
      plan.kind === "pac"
        ? { id: newId(), date, account: plan.account, type: "buy", isin: ins!.isin, quantity: q, price: p, ...(fxRate ? { fxRate } : {}), plan: occ.id }
        : plan.kind === "transfer"
          ? { id: newId(), date, account: plan.account, toAccount: plan.toAccount, type: "transfer", isin: "", amount: num(amount), note: plan.label, plan: occ.id }
          : { id: newId(), date, account: plan.account, type: "deposit", isin: "", amount: num(amount), note: plan.label, plan: occ.id };
    try {
      saveTransaction(tx);
    } catch (e) {
      setError(e instanceof SaveError ? e.message : "Registrazione non riuscita.");
    }
  };

  return (
    <Panel className={first ? "" : "opacity-95"}>
      <div className="flex items-center gap-3 px-4 pb-2 pt-3.5">
        {ins ? <Logo isin={ins.isin} name={ins.shortName ?? ins.name} size={36} /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">{plan.label}</p>
          <p className="flex items-center gap-1.5 text-[14px] text-mut">
            <BankDot color={account?.color ?? "#888"} size={7} />
            {plan.kind === "transfer" ? `${account?.name} → ${to?.name}` : account?.name} · previsto il {fmtDate(occ.date, { day: "numeric", month: "long" })}
          </p>
        </div>
      </div>
      <div className="border-t border-sep">
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        {plan.kind === "pac" ? (
          <>
            <div className="grid grid-cols-2">
              <Field label="Quote">
                <input inputMode="decimal" value={qty} onChange={(e) => (setTouched(true), setQty(e.target.value))} placeholder="0" className={inputCls} />
              </Field>
              <Field label={`Prezzo (${ins?.currency ?? "EUR"})`} border>
                <input inputMode="decimal" value={price} onChange={(e) => (setTouched(true), setPrice(e.target.value))} placeholder="0,00" className={inputCls} />
              </Field>
            </div>
            <InfoRow
              label="Totale"
              hint={estPrice ? `Stima: quote intere entro ${fmtEur(plan.budget ?? 0)} alla chiusura del giorno` : "Prezzo del giorno non disponibile: inseriscilo"}
              value={fmtEur(total)}
            />
          </>
        ) : (
          <Field label={plan.kind === "deposit" ? "Importo ricevuto (€)" : "Importo (€)"}>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={inputCls} />
          </Field>
        )}
      </div>
      {(plan.kind === "pac" || plan.kind === "transfer") && available !== undefined && (
        <p className={`px-4 pt-2 text-[14px] ${valid && total > available + 0.005 ? "font-semibold text-dn" : "text-mut"}`}>
          Liquidità su {account?.name}: <span className="num">{fmtEur(available)}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="px-4 pt-2 text-[14px] text-dn">
          {error}
        </p>
      )}
      <div className="flex gap-2 p-4">
        <button onClick={() => skipOccurrence(occ.id)} className="h-11 flex-1 rounded-[12px] bg-chip text-[15px] font-semibold text-ink-2 active:opacity-70">
          Salta
        </button>
        <button
          onClick={confirm}
          disabled={!valid}
          className="flex h-11 flex-[2] items-center justify-center gap-1.5 rounded-[12px] bg-ink text-[15px] font-semibold text-bg active:opacity-80 disabled:opacity-40"
        >
          <Check size={17} strokeWidth={2.6} /> Conferma
        </button>
      </div>
    </Panel>
  );
}

function PlanForm({ initial, isNew, onDone }: { initial: RecurringPlan; isNew: boolean; onDone: () => void }) {
  const { data } = usePortfolioCtx();
  const [plan, setPlan] = useState(initial);
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount).replace(".", ",") : "");
  const [budget, setBudget] = useState(initial.budget ? String(initial.budget).replace(".", ",") : "");
  const set = (p: Partial<RecurringPlan>) => setPlan({ ...plan, ...p });
  const accountOptions = data.accounts.map((a) => ({ value: a.id, label: a.name }));
  const etfs = data.instruments;
  const valid =
    plan.label.trim() &&
    plan.day >= 1 &&
    plan.day <= 31 &&
    plan.account &&
    /^\d{4}-\d{2}-\d{2}$/.test(plan.since) &&
    (plan.kind === "pac" ? plan.isin && num(budget) > 0 : plan.kind === "transfer" ? plan.toAccount && plan.toAccount !== plan.account && num(amount) > 0 : true);

  return (
    <div className="pb-4">
      {isNew && (
        <div className="px-4 pb-4">
          <Segmented
            value={plan.kind}
            onChange={(kind) =>
              set({
                kind,
                label: kind === "deposit" ? "Stipendio" : kind === "transfer" ? "Bonifico" : "PAC",
                day: kind === "pac" ? 15 : 10,
                holiday: kind === "pac" ? "next" : "same",
                toAccount: kind === "transfer" ? data.accounts.find((a) => a.id !== plan.account)?.id : undefined,
              })
            }
            options={(Object.keys(KIND_LABEL) as RecurringKind[]).map((k) => ({ value: k, label: k === "transfer" ? "Bonifico" : KIND_LABEL[k] }))}
          />
        </div>
      )}
      <Panel>
        <Field label="Nome">
          <input value={plan.label} onChange={(e) => set({ label: e.target.value })} className={inputCls} />
        </Field>
        <Row label={plan.kind === "transfer" ? "Da" : plan.kind === "pac" ? "Conto" : "Entra su"}>
          <SelectButton label="Conto" value={plan.account} onChange={(account) => set({ account })} options={accountOptions} />
        </Row>
        {plan.kind === "transfer" && (
          <Row label="Verso">
            <SelectButton label="Conto di destinazione" value={plan.toAccount ?? ""} onChange={(toAccount) => set({ toAccount })} options={accountOptions} />
          </Row>
        )}
        {plan.kind === "pac" && (
          <Row label="Titolo">
            <SelectButton
              label="Titolo del PAC"
              value={plan.isin ?? ""}
              onChange={(isin) => set({ isin, label: plan.label === "PAC" || plan.label.startsWith("PAC ") ? `PAC ${etfs.find((i) => i.isin === isin)?.shortName ?? ""}` : plan.label })}
              options={[{ value: "", label: "Scegli…" }, ...etfs.map((i) => ({ value: i.isin, label: i.shortName ?? i.name }))]}
            />
          </Row>
        )}
        {plan.kind === "pac" ? (
          <Field label="Importo massimo per rata (€)" hint="Ogni rata propone le quote intere che ci stanno">
            <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="300" className={inputCls} />
          </Field>
        ) : (
          <Field label={plan.kind === "deposit" ? "Importo indicativo (€)" : "Importo (€)"} hint={plan.kind === "deposit" ? "Lo correggi a ogni rata se cambia" : undefined}>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={inputCls} />
          </Field>
        )}
        <Field label="Giorno del mese">
          <input inputMode="numeric" value={plan.day || ""} onChange={(e) => set({ day: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) })} className={inputCls} />
        </Field>
        <Row label="Se è festivo">
          <SelectButton
            label="Se il giorno è festivo"
            value={plan.holiday}
            onChange={(holiday) => set({ holiday })}
            options={(Object.keys(HOLIDAY_LABEL) as HolidayRule[]).map((k) => ({ value: k, label: HOLIDAY_LABEL[k] }))}
          />
        </Row>
        <Field label="Prima rata da proporre dal">
          <input type="date" value={plan.since} onChange={(e) => set({ since: e.target.value })} className={inputCls} />
        </Field>
        {!isNew && (
          <Row label="Attivo">
            <SelectButton
              label="Stato del piano"
              value={plan.active ? "si" : "no"}
              onChange={(v) => set({ active: v === "si" })}
              options={[
                { value: "si", label: "Attivo" },
                { value: "no", label: "In pausa" },
              ]}
            />
          </Row>
        )}
      </Panel>
      <div className="flex gap-2 px-4 pt-5">
        <button onClick={onDone} className="h-[50px] flex-1 rounded-[16px] bg-chip text-[16px] font-semibold text-ink-2 active:opacity-70">
          Annulla
        </button>
        <button
          disabled={!valid}
          onClick={() => {
            saveRecurring({
              ...plan,
              label: plan.label.trim(),
              amount: plan.kind === "pac" ? undefined : num(amount) || undefined,
              budget: plan.kind === "pac" ? num(budget) : undefined,
              isin: plan.kind === "pac" ? plan.isin : undefined,
              toAccount: plan.kind === "transfer" ? plan.toAccount : undefined,
            });
            onDone();
          }}
          className="flex h-[50px] flex-[2] items-center justify-center gap-2 rounded-[16px] bg-ink text-[16px] font-semibold text-bg active:opacity-80 disabled:opacity-40"
        >
          <Check size={18} strokeWidth={2.6} /> Salva
        </button>
      </div>
      {!isNew && (
        <button
          onClick={() => {
            if (!confirm("Eliminare il piano? Le rate già registrate restano.")) return;
            deleteRecurring(initial.id);
            onDone();
          }}
          className="mx-auto mt-2 flex min-h-[44px] items-center gap-2 px-4 text-[15px] font-semibold text-dn"
        >
          <Trash2 size={16} /> Elimina piano
        </button>
      )}
    </div>
  );
}

const inputCls = "h-7 w-full min-w-0 bg-transparent text-[17px] text-ink outline-none placeholder:text-faint";

function Field({ label, hint, border, children }: { label: string; hint?: string; border?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block border-b border-sep px-4 pb-2.5 pt-3 focus-within:bg-panel-2 ${border ? "border-l" : ""}`}>
      <span className="block text-[12px] font-medium text-mut">{label}</span>
      <span className="mt-0.5 block">{children}</span>
      {hint && <span className="mt-0.5 block text-[12px] text-mut">{hint}</span>}
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-sep px-4">
      <span className="text-[16px]">{label}</span>
      {children}
    </div>
  );
}

function num(v: string) {
  const s = v.trim().replace(/\s|€/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

