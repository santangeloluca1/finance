"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { InteractiveChart } from "@/components/InteractiveChart";
import { Ribilanciamento } from "@/components/Ribilanciamento";
import { Chip, InfoRow, LargeTitle, Panel, SectionHeader, Segmented, SelectButton, AddButton } from "@/components/ui";
import { fmtDate, fmtEur0, fmtN } from "@/lib/format";
import { futureValue, planGoals, type GoalPlan } from "@/lib/planning";
import { deleteGoal, moveGoal, newId, saveGoal, savePlan, type Goal, type Plan } from "@/lib/store";

const RETURNS = [
  { value: "0.03", label: "Prudente 3%" },
  { value: "0.05", label: "Bilanciato 5%" },
  { value: "0.07", label: "Dinamico 7%" },
];

const SUGGESTIONS = [
  { name: "Fondo emergenza", target: 10000, years: 1, scope: "liquidita" },
  { name: "Casa", target: 50000, years: 5, scope: "tutto" },
  { name: "Libertà finanziaria", target: 500000, years: 20, scope: "tutto" },
];

/** Mese e anno tra `months` mesi, es. "giu 2031". */
function inMonths(months: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1, 12);
  return fmtDate(d.toISOString().slice(0, 10), { month: "short", year: "numeric" });
}

/**
 * Obiettivi: in cima il piano (quanto versi e quanto pensi che renda), poi gli
 * obiettivi in ordine di priorità con lo stato rispetto al piano, la proiezione
 * con gli obiettivi segnati e, in fondo, come investire il versamento.
 */
export function Obiettivi({ embedded = false }: { embedded?: boolean }) {
  const { data, totals, views, state } = usePortfolioView();
  const [editing, setEditing] = useState<Goal | null>(null);
  const saved: Plan = data.plan ?? { monthly: 500, expectedReturn: 0.05, years: 20 };

  // Il piano si sceglie una volta sola qui e vale per tutta la pagina.
  const [monthlyText, setMonthlyText] = useState(String(saved.monthly));
  const [rateText, setRateText] = useState(String(saved.expectedReturn));
  const [years, setYears] = useState(saved.years);
  const monthly = parseAmount(monthlyText);
  const rate = Number(rateText);
  useEffect(() => {
    const t = setTimeout(() => {
      if (monthly !== saved.monthly || rate !== saved.expectedReturn || years !== saved.years) savePlan({ monthly, expectedReturn: rate, years });
    }, 600);
    return () => clearTimeout(t);
  }, [monthly, rate, years, saved]);

  const goals = useMemo(() => data.goals ?? [], [data.goals]);
  const plans = useMemo(() => {
    if (!totals) return new Map<string, GoalPlan & { pool: number }>();
    const pool = (scope: string) => {
      if (scope === "tutto") return totals.value;
      if (scope === "liquidita") return totals.cash;
      return views.filter((v) => v.position.account === scope).reduce((a, v) => a + v.value, 0) + (state?.cash[scope]?.amount ?? 0);
    };
    return new Map(planGoals(goals, pool, monthly, rate).map((p, i) => [p.id, { ...p, pool: pool(goals[i].scope) }]));
  }, [goals, totals, views, state, monthly, rate]);

  const reached = [...plans.values()].filter((p) => p.status === "done" || p.status === "ok").length;
  const newGoal = (g?: Partial<Goal>) => setEditing({ id: newId(), name: "", target: 0, date: `${new Date().getFullYear() + 3}-12-31`, scope: "tutto", ...g });
  const scopeLabel = (scope: string) =>
    scope === "tutto" ? "Tutto il patrimonio" : scope === "liquidita" ? "Liquidità" : data.accounts.find((a) => a.id === scope)?.name ?? scope;

  return (
    <div>
      {embedded ? (
        <div className="px-4 pb-1 pt-6">
          <h2 className="text-[22px] font-bold tracking-[-0.025em]">Il tuo piano</h2>
        </div>
      ) : (
        <LargeTitle>Il tuo piano</LargeTitle>
      )}

      {/* Sintesi: la risposta alla domanda "ce la faccio?" */}
      <p className="px-4 text-[16px] leading-snug text-ink-2">
        {goals.length === 0 ? (
          <>Aggiungi un obiettivo per vedere se il piano basta.</>
        ) : (
          <>
            Con <b className="num font-semibold text-ink">{fmtEur0(monthly)}</b> al mese raggiungi{" "}
            <b className={`num font-semibold ${reached === goals.length ? "text-up" : "text-warn"}`}>
              {reached === goals.length ? (goals.length === 1 ? "il tuo obiettivo" : `tutti i ${goals.length} obiettivi`) : `${reached} obiettivi su ${goals.length}`}
            </b>
            .
          </>
        )}
      </p>

      <Panel className="mt-4">
        <Field label="Versamento mensile (€)">
          <input inputMode="decimal" value={monthlyText} onChange={(e) => setMonthlyText(e.target.value)} placeholder="500" className={inputCls} />
        </Field>
        <div className="px-4 py-3">
          <span className="text-[12px] font-medium text-mut">Rendimento atteso</span>
          <div className="mt-2">
            <Segmented size="sm" value={rateText} onChange={setRateText} options={RETURNS} />
          </div>
        </div>
      </Panel>

      <SectionHeader right={<AddButton label="Nuovo obiettivo" onClick={() => newGoal()} />}>Obiettivi</SectionHeader>

      {goals.length === 0 ? (
        <div className="px-4">
          <p className="text-[15px] leading-snug text-mut">Nessun obiettivo. Scegline uno per iniziare:</p>
          <div className="-mx-1 mt-2 flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <Chip key={s.name} onClick={() => newGoal({ name: s.name, target: s.target, date: `${new Date().getFullYear() + s.years}-12-31`, scope: s.scope })}>
                <Plus size={15} strokeWidth={2.4} /> {s.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        <>
          {goals.length > 1 && <p className="px-4 pb-1 text-[13px] leading-snug text-mut">In ordine di priorità: il patrimonio e il versamento vanno prima ai primi della lista.</p>}
          <ul>
            {goals.map((g, idx) => {
              const p = plans.get(g.id);
              if (!p) return null;
              const progress = g.target > 0 ? Math.min(1, p.allocated / g.target) : 0;
              const shared = p.status !== "done" && p.pool > p.allocated + 1;
              return (
                <li key={g.id}>
                  <button onClick={() => setEditing(g)} className="block w-full px-4 py-3.5 text-left active:bg-panel-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">
                          {goals.length > 1 && <span className="num mr-1.5 text-mut">{idx + 1}.</span>}
                          {g.name}
                        </p>
                        <p className="mt-0.5 text-[14px] text-mut">
                          {scopeLabel(g.scope)} · entro {fmtDate(g.date, { month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <div className="num shrink-0 text-right">
                        <p className="sensitive text-[17px] font-medium">{fmtEur0(p.allocated)}</p>
                        <p className="text-[14px] text-mut">di {fmtEur0(g.target)}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-chip">
                      <div
                        className={`h-full rounded-full ${p.status === "done" || p.status === "ok" ? "bg-up" : "bg-warn"}`}
                        style={{ width: `${Math.max(2, progress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[14px] leading-snug text-mut">
                      <GoalStatus p={p} />
                    </p>
                    {shared && <p className="mt-0.5 text-[13px] text-faint">Il resto di {scopeLabel(g.scope).toLowerCase()} va agli obiettivi prima di questo.</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {totals && <Proiezione start={totals.value} monthly={monthly} rate={rate} years={years} setYears={setYears} goals={goals} plans={plans} />}

      {totals && <Ribilanciamento views={views} targets={data.targets} monthly={monthly} />}

      {editing && (
        <Sheet onClose={() => setEditing(null)} title={goals.some((g) => g.id === editing.id) ? "Modifica obiettivo" : "Nuovo obiettivo"}>
          <GoalForm
            key={editing.id}
            initial={editing}
            accounts={data.accounts}
            isNew={!goals.some((g) => g.id === editing.id)}
            index={goals.findIndex((g) => g.id === editing.id)}
            count={goals.length}
            onDone={() => setEditing(null)}
          />
        </Sheet>
      )}
    </div>
  );
}

function GoalStatus({ p }: { p: GoalPlan }) {
  if (p.status === "done") return <span className="font-semibold text-up">Raggiunto</span>;
  const pace = p.monthsAtPace != null ? `, oppure ci arrivi a ${inMonths(p.monthsAtPace)}` : "";
  if (p.status === "expired")
    return (
      <>
        <span className="font-semibold text-warn">Scadenza passata</span> · sposta la data o rivedi l&apos;importo
      </>
    );
  if (p.status === "ok")
    return (
      <>
        <span className="font-semibold text-up">In linea</span> · gli vanno <b className="num font-semibold text-ink">{fmtEur0(p.need)}</b> del versamento mensile
      </>
    );
  return (
    <>
      <span className="font-semibold text-warn">In ritardo</span> · servono <b className="num font-semibold text-ink">+{fmtEur0(p.extra)}</b> al mese{pace}
    </>
  );
}

/** Pannello che sale dal basso, sopra la pagina. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  // Sul body: un antenato animato (transform) intrappolerebbe il "fixed" sotto la barra delle schede.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Chiudi" onClick={onClose} className="fade-in absolute inset-0 bg-black/40" />
      <div className="page-in relative max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] bg-bg pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <h2 className="text-[19px] font-bold tracking-[-0.02em]">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="flex h-11 w-11 items-center justify-center rounded-full text-mut active:bg-chip">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function GoalForm({ initial, accounts, isNew, index, count, onDone }: { initial: Goal; accounts: { id: string; name: string; color: string }[]; isNew: boolean; index: number; count: number; onDone: () => void }) {
  const [name, setName] = useState(initial.name);
  const [target, setTarget] = useState(initial.target ? String(initial.target) : "");
  const [date, setDate] = useState(initial.date);
  const [scope, setScope] = useState(initial.scope);
  const value = parseAmount(target);
  const valid = name.trim() && value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div>
      <Panel>
        <Field label="Nome">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Fondo emergenza" className={inputCls} />
        </Field>
        <Field label="Obiettivo (€)">
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10.000" className={inputCls} />
        </Field>
        <Field label="Entro il">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex min-h-[56px] items-center justify-between gap-3 px-4">
          <span className="text-[16px]">Cosa conta</span>
          <SelectButton
            label="Cosa conta per l'obiettivo"
            value={scope}
            onChange={setScope}
            options={[
              { value: "tutto", label: "Tutto il patrimonio" },
              { value: "liquidita", label: "Solo liquidità" },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
        {!isNew && count > 1 && (
          <div className="flex min-h-[56px] items-center justify-between gap-3 border-t border-sep px-4">
            <span className="text-[16px]">
              Priorità <span className="num text-mut">· {index + 1}ª di {count}</span>
            </span>
            <span className="flex gap-1">
              <button aria-label="Più importante" disabled={index <= 0} onClick={() => moveGoal(initial.id, -1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-chip text-ink-2 active:opacity-70 disabled:opacity-30">
                <ChevronUp size={20} />
              </button>
              <button aria-label="Meno importante" disabled={index >= count - 1} onClick={() => moveGoal(initial.id, 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-chip text-ink-2 active:opacity-70 disabled:opacity-30">
                <ChevronDown size={20} />
              </button>
            </span>
          </div>
        )}
      </Panel>
      <div className="flex gap-2 px-4 pt-5">
        <button onClick={onDone} className="h-[50px] flex-1 rounded-[16px] bg-chip text-[16px] font-semibold text-ink-2 active:opacity-70">
          Annulla
        </button>
        <button
          disabled={!valid}
          onClick={() => {
            saveGoal({ id: initial.id, name: name.trim(), target: value, date, scope });
            onDone();
          }}
          className="flex h-[50px] flex-[2] items-center justify-center gap-2 rounded-[16px] bg-ink text-[16px] font-semibold text-bg active:opacity-80 disabled:opacity-40"
        >
          <Check size={18} strokeWidth={2.6} /> Salva obiettivo
        </button>
      </div>
      {!isNew && (
        <button
          onClick={() => {
            if (confirm("Eliminare questo obiettivo?")) {
              deleteGoal(initial.id);
              onDone();
            }
          }}
          className="mx-auto mt-2 flex min-h-[44px] items-center gap-2 px-4 text-[15px] font-semibold text-dn"
        >
          <Trash2 size={16} /> Elimina obiettivo
        </button>
      )}
    </div>
  );
}

function Proiezione({
  start,
  monthly,
  rate,
  years,
  setYears,
  goals,
  plans,
}: {
  start: number;
  monthly: number;
  rate: number;
  years: number;
  setYears: (y: number) => void;
  goals: Goal[];
  plans: Map<string, GoalPlan>;
}) {
  const points = useMemo(() => {
    const now = new Date();
    return Array.from({ length: years * 12 + 1 }, (_, m) => {
      const d = new Date(now.getFullYear(), now.getMonth() + m, 1, 12);
      return { date: d.toISOString().slice(0, 10), value: futureValue(start, monthly, rate, m) };
    });
  }, [start, monthly, rate, years]);
  const contributed = useMemo(() => points.map((_, m) => start + monthly * m), [points, start, monthly]);
  const marks = useMemo(
    () => goals.map((g) => ({ date: g.date, value: g.target, met: ["done", "ok"].includes(plans.get(g.id)?.status ?? "") })),
    [goals, plans],
  );
  const beyond = goals.filter((g) => points.length && g.date > points[points.length - 1].date).length;

  const end = futureValue(start, monthly, rate, years * 12);
  const low = futureValue(start, monthly, Math.max(0, rate - 0.02), years * 12);
  const high = futureValue(start, monthly, rate + 0.02, years * 12);
  const paid = start + monthly * years * 12;

  return (
    <>
      <SectionHeader>Proiezione</SectionHeader>
      <div className="px-4 pt-1">
        <p className="text-[14px] text-mut">
          Tra {years} anni, nel {new Date().getFullYear() + years}
        </p>
        <p className="hero-number num mt-1">{fmtEur0(end)}</p>
        <p className="mt-2 text-[14px] text-mut">
          di cui <span className="num font-semibold text-ink-2">{fmtEur0(paid)}</span> versati e{" "}
          <span className="num font-semibold text-up">{fmtEur0(end - paid)}</span> di crescita
        </p>
      </div>

      <div className="mt-6 pl-4 pr-3">
        <InteractiveChart
          points={points}
          height={220}
          compare={contributed}
          goals={marks}
          format={fmtEur0}
          formatAxis={(v) => (v >= 1_000_000 ? `${fmtN(v / 1_000_000, { maximumFractionDigits: 1 })}M €` : `${Math.round(v / 1000)}k €`)}
          describePoint={(i) => `${fmtEur0(points[i].value)} · versati ${fmtEur0(contributed[i])}`}
          describeRange={(a, b) => `+${fmtEur0(points[b].value - points[a].value)}`}
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-3 text-[13px] text-mut">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-up" /> Valore atteso
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-accent" /> Versato
        </span>
        {goals.length > 0 && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rotate-45 bg-up" /> Obiettivo in linea
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rotate-45 border-2 border-warn" /> In ritardo
            </span>
          </>
        )}
      </p>
      {beyond > 0 && (
        <p className="px-4 pt-1.5 text-[13px] text-mut">
          {beyond === 1 ? "Un obiettivo scade" : `${beyond} obiettivi scadono`} oltre l&apos;orizzonte: allungalo per vederli.
        </p>
      )}

      <Panel className="mt-5">
        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-mut">Orizzonte</span>
            <span className="num text-[15px] font-semibold">{years} anni</span>
          </div>
          <input type="range" min={1} max={40} value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="Orizzonte in anni" className="mt-2 w-full" />
        </div>
      </Panel>

      <Panel className="mt-3">
        <InfoRow label={`Se rende il ${fmtN(Math.max(0, rate - 0.02) * 100)}%`} hint="Scenario prudente" value={fmtEur0(low)} />
        <InfoRow label={`Se rende il ${fmtN((rate + 0.02) * 100)}%`} hint="Scenario ottimista" value={fmtEur0(high)} />
      </Panel>
      <p className="px-6 pb-2 pt-4 text-center text-[12px] leading-relaxed text-mut">Proiezione al lordo di tasse e inflazione, a rendimento costante.</p>
    </>
  );
}

const inputCls = "h-7 w-full min-w-0 bg-transparent text-[17px] text-ink outline-none placeholder:text-faint";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block border-b border-sep px-4 pb-2.5 pt-3 last:border-0 focus-within:bg-panel-2">
      <span className="block text-[12px] font-medium text-mut">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

function parseAmount(v: string) {
  const s = v.trim().replace(/\s|€/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s);
  return Number.isFinite(n) ? n : 0;
}
