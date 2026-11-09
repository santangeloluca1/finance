"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, GripVertical, Minus, Plus, Trash2, X } from "lucide-react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { InteractiveChart } from "@/components/InteractiveChart";
import { ComeInvesti, DoveInvestire } from "@/components/Allocazione";
import { Chip, InfoRow, LargeTitle, Panel, SectionHeader, SelectButton } from "@/components/ui";
import { fmtDate, fmtEur0, fmtN } from "@/lib/format";
import { expectedReturn, fromSaved, groupOf, normalize, toSaved, type Group, type Weights } from "@/lib/allocation";
import { futureValue, monthsUntil, planGoals, type GoalPlan } from "@/lib/planning";
import { deleteGoal, newId, reorderGoals, saveGoal, savePlan, saveTargets, type Goal } from "@/lib/store";

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
 * Obiettivi come sequenza di domande:
 * 1. cosa vuoi raggiungere (gli obiettivi, in ordine di priorità, con una frase di stato ciascuno);
 * 2. quanto metti da parte al mese;
 * 3. come investi (da cui si stima il rendimento);
 * poi la proiezione e dove mettere il versamento di questo mese.
 */
export function Obiettivi({ embedded = false }: { embedded?: boolean }) {
  const { data, totals, views, state } = usePortfolioView();
  const [editing, setEditing] = useState<Goal | null>(null);

  // Quanto metti da parte: se non l'hai mai scelto, si parte dai PAC attivi.
  const pacTotal = (data.recurring ?? []).filter((r) => r.active && r.kind === "pac").reduce((a, r) => a + (r.budget ?? 0), 0);
  const [monthly, setMonthly] = useState(data.plan?.monthly ?? (pacTotal || 500));
  const [monthlyText, setMonthlyText] = useState(String(monthly));
  const setBoth = (v: number) => {
    const n = Math.max(0, Math.round(v));
    setMonthly(n);
    setMonthlyText(String(n));
  };

  // Composizione di oggi e composizione scelta.
  const now = useMemo<Weights>(() => {
    const raw: Partial<Record<Group, number>> = { liquidita: totals?.cashAvailable ?? 0 };
    for (const v of views) {
      const g = groupOf(v.instrument.assetClass);
      raw[g] = (raw[g] ?? 0) + v.value;
    }
    return normalize(raw);
  }, [views, totals?.cashAvailable]);
  const [weights, setWeights] = useState<Weights | null>(() => fromSaved(data.targets));
  const chosen = weights ?? now;
  const rate = expectedReturn(chosen);
  const [years, setYears] = useState(data.plan?.years ?? 20);

  // Salvataggio con un attimo di ritardo, mentre si tocca.
  useEffect(() => {
    const t = setTimeout(() => {
      const p = data.plan;
      if (!p || p.monthly !== monthly || Math.abs(p.expectedReturn - rate) > 1e-9 || p.years !== years) savePlan({ monthly, expectedReturn: rate, years });
    }, 600);
    return () => clearTimeout(t);
  }, [monthly, rate, years, data.plan]);
  useEffect(() => {
    if (!weights) return;
    const t = setTimeout(() => {
      const next = toSaved(weights);
      if (JSON.stringify(next) !== JSON.stringify(data.targets ?? {})) saveTargets(next);
    }, 600);
    return () => clearTimeout(t);
  }, [weights, data.targets]);

  const goals = useMemo(() => data.goals ?? [], [data.goals]);
  const plans = useMemo(() => {
    if (!totals) return new Map<string, GoalPlan & { pool: number }>();
    const pool = (scope: string) => {
      if (scope === "tutto") return totals.value;
      if (scope === "liquidita") return totals.cashAvailable;
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
          <h2 className="text-[22px] font-bold tracking-[-0.025em]">Cosa vuoi raggiungere</h2>
        </div>
      ) : (
        <LargeTitle>Cosa vuoi raggiungere</LargeTitle>
      )}

      {goals.length > 0 && (
        <p className="px-4 text-[16px] leading-snug text-ink-2">
          Con <b className="num font-semibold text-ink">{fmtEur0(monthly)}</b> al mese{" "}
          {reached === goals.length ? (
            <b className="font-semibold text-up">{goals.length === 1 ? "ci arrivi in tempo" : `li raggiungi tutti e ${goals.length}`}</b>
          ) : (
            <>
              ne raggiungi in tempo <b className="num font-semibold text-warn">{reached} su {goals.length}</b>
            </>
          )}
          .
        </p>
      )}

      {goals.length === 0 ? (
        <div className="px-4 pt-1">
          <p className="text-[15px] leading-snug text-mut">Aggiungi un traguardo con importo e data: ti diciamo se ci arrivi e quanto mettere da parte. Parti da uno di questi:</p>
          <div className="-mx-1 mt-2 flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <Chip key={s.name} onClick={() => newGoal({ name: s.name, target: s.target, date: `${new Date().getFullYear() + s.years}-12-31`, scope: s.scope })}>
                <Plus size={15} strokeWidth={2.4} /> {s.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        <GoalList goals={goals} plans={plans} scopeLabel={scopeLabel} onOpen={setEditing} />
      )}

      {goals.length > 0 && (
        <button onClick={() => newGoal()} className="mx-4 mt-1 flex min-h-[48px] items-center gap-2 text-[16px] font-semibold text-accent active:opacity-60">
          <Plus size={19} strokeWidth={2.4} /> Aggiungi obiettivo
        </button>
      )}

      {/* Quanto metti da parte */}
      <SectionHeader>Quanto metti da parte al mese</SectionHeader>
      <div className="flex items-center justify-between gap-3 px-4">
        <button aria-label="50 € in meno" onClick={() => setBoth(monthly - 50)} disabled={monthly <= 0} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-chip text-ink-2 active:opacity-60 disabled:opacity-30">
          <Minus size={20} strokeWidth={2.4} />
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
          <span className="sr-only">Versamento mensile in euro</span>
          <input
            inputMode="numeric"
            value={monthlyText}
            onChange={(e) => {
              setMonthlyText(e.target.value);
              setMonthly(parseAmount(e.target.value));
            }}
            onBlur={() => setMonthlyText(String(monthly))}
            className="num w-full min-w-0 bg-transparent text-right text-[34px] font-bold tracking-[-0.03em] outline-none"
            style={{ maxWidth: `${Math.max(2, monthlyText.length) + 0.5}ch` }}
          />
          <span className="text-[34px] font-bold tracking-[-0.03em]">€</span>
        </label>
        <button aria-label="50 € in più" onClick={() => setBoth(monthly + 50)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-chip text-ink-2 active:opacity-60">
          <Plus size={20} strokeWidth={2.4} />
        </button>
      </div>
      {pacTotal > 0 && pacTotal !== monthly ? (
        <button onClick={() => setBoth(pacTotal)} className="mx-auto mt-1 flex min-h-[44px] items-center px-4 text-[14px] text-accent active:opacity-60">
          I tuoi PAC fanno {fmtEur0(pacTotal)} al mese: usa questo importo
        </button>
      ) : (
        <p className="mt-1 min-h-[44px] px-4 pt-2.5 text-center text-[14px] text-mut">{pacTotal > 0 ? "Come i tuoi PAC attivi" : "Quello che investi o accantoni ogni mese"}</p>
      )}

      {totals && <ComeInvesti weights={chosen} now={now} rate={rate} onChange={setWeights} />}

      {totals && <Proiezione start={totals.value} monthly={monthly} rate={rate} years={years} setYears={setYears} goals={goals} plans={plans} />}

      {totals && <DoveInvestire views={views} cash={totals.cashAvailable} weights={chosen} monthly={monthly} />}

      {editing && (
        <Sheet onClose={() => setEditing(null)} title={goals.some((g) => g.id === editing.id) ? "Modifica obiettivo" : "Nuovo obiettivo"}>
          <GoalForm key={editing.id} initial={editing} accounts={data.accounts} isNew={!goals.some((g) => g.id === editing.id)} onDone={() => setEditing(null)} />
        </Sheet>
      )}
    </div>
  );
}

/**
 * Obiettivi in ordine di priorità: si riordinano trascinando la maniglia.
 * Patrimonio e versamento vanno prima ai primi della lista.
 */
function GoalList({
  goals,
  plans,
  scopeLabel,
  onOpen,
}: {
  goals: Goal[];
  plans: Map<string, GoalPlan & { pool: number }>;
  scopeLabel: (s: string) => string;
  onOpen: (g: Goal) => void;
}) {
  const refs = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; rects: { id: string; top: number; h: number }[] } | null>(null);

  // Ordine mentre si trascina: posizione in base al centro dell'elemento spostato.
  const order = useMemo(() => {
    if (!drag) return goals.map((g) => g.id);
    const me = drag.rects.find((r) => r.id === drag.id)!;
    const center = me.top + me.h / 2 + drag.dy;
    const others = drag.rects.filter((r) => r.id !== drag.id);
    const idx = others.filter((r) => r.top + r.h / 2 < center).length;
    const ids = others.map((r) => r.id);
    ids.splice(idx, 0, drag.id);
    return ids;
  }, [drag, goals]);

  const offset = (id: string) => {
    if (!drag) return 0;
    const top0 = drag.rects[0].top;
    const h = new Map(drag.rects.map((r) => [r.id, r.h]));
    let slot = top0;
    for (const o of order) {
      if (o === id) break;
      slot += h.get(o)!;
    }
    const orig = drag.rects.find((r) => r.id === id)!.top;
    return id === drag.id ? orig + drag.dy - slot : 0;
  };

  const start = (id: string, e: RPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rects = goals.map((g) => {
      const r = refs.current.get(g.id)!.getBoundingClientRect();
      return { id: g.id, top: r.top, h: r.height };
    });
    setDrag({ id, startY: e.clientY, dy: 0, rects });
  };
  const move = (e: RPointerEvent) => drag && setDrag({ ...drag, dy: e.clientY - drag.startY });
  const end = () => {
    if (!drag) return;
    if (order.join() !== goals.map((g) => g.id).join()) reorderGoals(order);
    setDrag(null);
  };

  const byId = new Map(goals.map((g) => [g.id, g]));
  return (
    <>
      {goals.length > 1 && <p className="px-4 pb-1 pt-4 text-[13px] text-mut">In ordine di priorità · trascina per riordinare</p>}
      <ul className="mt-1">
        {order.map((id, idx) => {
          const g = byId.get(id)!;
          const p = plans.get(id);
          if (!p) return null;
          const progress = g.target > 0 ? Math.min(1, p.allocated / g.target) : 0;
          const dragging = drag?.id === id;
          const good = p.status === "done" || p.status === "ok";
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) refs.current.set(id, el);
                else refs.current.delete(id);
              }}
              className={`relative after:pointer-events-none after:absolute after:bottom-0 after:left-[78px] after:right-0 after:h-px after:bg-sep last:after:hidden ${drag ? "select-none " : ""}${dragging ? "z-10 after:hidden" : ""}`}
              style={{ transform: dragging ? `translateY(${offset(id)}px)` : undefined }}
            >
              <div className={`flex items-center bg-bg transition-shadow ${dragging ? "rounded-[16px] shadow-xl ring-1 ring-sep" : ""}`}>
                <button onClick={() => onOpen(g)} className="flex min-h-[76px] min-w-0 flex-1 items-center gap-3.5 py-3 pl-4 pr-1 text-left active:bg-panel-2">
                  <Ring value={progress} good={good} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">
                        {goals.length > 1 && <span className="num mr-1.5 font-medium text-faint">{idx + 1}</span>}
                        {g.name}
                      </p>
                      <p className="num sensitive shrink-0 text-[15px] font-medium text-ink-2">{fmtEur0(g.target)}</p>
                    </div>
                    <p className="mt-0.5 text-[14px] leading-[1.4] text-mut">
                      <GoalLine p={p} target={g.target} date={g.date} scope={g.scope === "tutto" ? null : scopeLabel(g.scope)} />
                    </p>
                  </div>
                </button>
                {goals.length > 1 && (
                  <button
                    aria-label={`Trascina per cambiare la priorità di ${g.name}`}
                    onPointerDown={(e) => start(id, e)}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                    className="flex h-[76px] w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center text-faint active:cursor-grabbing active:text-ink-2"
                  >
                    <GripVertical size={18} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Anello di avanzamento con la percentuale al centro. */
function Ring({ value, good }: { value: number; good: boolean }) {
  const r = 19;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--chip)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={good ? "var(--up)" : "var(--warn)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.02, value) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      {value >= 1 ? <Check size={18} strokeWidth={3} className="text-up" /> : <span className="num text-[11px] font-semibold text-ink-2">{Math.round(value * 100)}%</span>}
    </span>
  );
}

/** Ritardo breve: "8 mesi", "~2 anni". */
function lateBy(months: number) {
  if (months < 12) return `${months} ${months === 1 ? "mese" : "mesi"}`;
  const y = Math.round(months / 12);
  return `${months % 12 ? "~" : ""}${y} ${y === 1 ? "anno" : "anni"}`;
}

/** Stato in due righe brevi: com'è messo e cosa serve. */
function GoalLine({ p, target, date, scope }: { p: GoalPlan; target: number; date: string; scope: string | null }) {
  const when = fmtDate(date, { month: "short", year: "numeric" });
  const tail = scope ? <span className="text-faint"> · {scope}</span> : null;
  if (p.status === "done")
    return (
      <span className="block">
        <span className="font-medium text-up">Raggiunto</span>
        {tail}
      </span>
    );
  if (p.status === "expired")
    return (
      <>
        <span className="block">
          <span className="font-medium text-warn">Scaduto</span> · era {when}
          {tail}
        </span>
        <span className="block">
          Mancano <span className="num sensitive">{fmtEur0(target - p.allocated)}</span>
        </span>
      </>
    );
  if (p.status === "ok")
    return (
      <>
        <span className="block">
          <span className="font-medium text-up">In tempo</span> · {when}
          {tail}
        </span>
        {p.funded > 0 && (
          <span className="block">
            <span className="num">{fmtEur0(p.funded)}</span> al mese del tuo versamento
          </span>
        )}
      </>
    );
  const delay = p.monthsAtPace != null ? p.monthsAtPace - monthsUntil(date) : null;
  return (
    <>
      <span className="block">
        <span className="font-medium text-warn">{delay != null && delay > 0 ? `${lateBy(delay)} in ritardo` : "In ritardo"}</span> · {when}
        {tail}
      </span>
      <span className="block">
        Servono <span className="num font-medium text-ink-2">+{fmtEur0(p.extra)}</span> al mese in più
      </span>
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

function GoalForm({ initial, accounts, isNew, onDone }: { initial: Goal; accounts: { id: string; name: string; color: string }[]; isNew: boolean; onDone: () => void }) {
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
      <SectionHeader>Dove arrivi</SectionHeader>
      <div className="px-4 pt-1">
        <p className="text-[14px] text-mut">
          Tra {years} anni, nel {new Date().getFullYear() + years}
        </p>
        <p className="hero-number num mt-1">{fmtEur0(end)}</p>
        <p className="mt-2 text-[14px] text-mut">
          <span className="num font-semibold text-ink-2">{fmtEur0(start)}</span> di oggi,{" "}
          <span className="num font-semibold text-ink-2">{fmtEur0(paid - start)}</span> di nuovi versamenti e{" "}
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
          describePoint={(i) => `${fmtEur0(points[i].value)} · senza crescita ${fmtEur0(contributed[i])}`}
          describeRange={(a, b) => `+${fmtEur0(points[b].value - points[a].value)}`}
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-3 text-[13px] text-mut">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-up" /> Valore atteso
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-accent" /> Oggi + versamenti
        </span>
        {goals.length > 0 && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rotate-45 bg-up" /> Obiettivo in tempo
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
        <InfoRow label={`Se rende il ${fmtN(Math.max(0, rate - 0.02) * 100, { maximumFractionDigits: 1 })}%`} hint="Scenario prudente" value={fmtEur0(low)} />
        <InfoRow label={`Se rende il ${fmtN((rate + 0.02) * 100, { maximumFractionDigits: 1 })}%`} hint="Scenario ottimista" value={fmtEur0(high)} />
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
