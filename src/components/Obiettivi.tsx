"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { InteractiveChart } from "@/components/InteractiveChart";
import { Ribilanciamento } from "@/components/Ribilanciamento";
import { Chip, InfoRow, LargeTitle, Panel, SectionHeader, Segmented, SelectButton } from "@/components/ui";
import { fmtDate, fmtEur0 } from "@/lib/format";
import { futureValue, monthsUntil, requiredMonthly } from "@/lib/planning";
import { deleteGoal, newId, saveGoal, savePlan, type Goal, type Plan } from "@/lib/store";

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

export function Obiettivi({ embedded = false }: { embedded?: boolean }) {
  const { data, totals, views, state } = usePortfolioView();
  const [editing, setEditing] = useState<Goal | null>(null);
  const plan: Plan = data.plan ?? { monthly: 500, expectedReturn: 0.05, years: 20 };

  const scopeValue = (scope: string) => {
    if (!totals) return 0;
    if (scope === "tutto") return totals.value;
    if (scope === "liquidita") return totals.cash;
    return views.filter((v) => v.position.account === scope).reduce((a, v) => a + v.value, 0) + (state?.cash[scope]?.amount ?? 0);
  };

  const goals = data.goals ?? [];

  return (
    <div>
      {embedded ? (
        !editing && (
          <div className="flex items-center justify-between px-4 pb-1 pt-6">
            <h2 className="text-[22px] font-bold tracking-[-0.025em]">I tuoi obiettivi</h2>
            <button
              onClick={() => setEditing({ id: newId(), name: "", target: 0, date: `${new Date().getFullYear() + 3}-12-31`, scope: "tutto" })}
              className="flex min-h-[44px] items-center gap-1 text-[15px] font-semibold text-accent active:opacity-60"
            >
              <Plus size={17} strokeWidth={2.4} /> Nuovo
            </button>
          </div>
        )
      ) : (
      <LargeTitle
        right={
          !editing && (
            <button
              onClick={() => setEditing({ id: newId(), name: "", target: 0, date: `${new Date().getFullYear() + 3}-12-31`, scope: "tutto" })}
              className="mb-1 flex h-11 items-center gap-1 rounded-full bg-chip pl-3 pr-4 text-[15px] font-semibold text-ink active:opacity-70"
            >
              <Plus size={18} strokeWidth={2.6} /> Nuovo
            </button>
          )
        }
      >
        Obiettivi
      </LargeTitle>
      )}

      {editing && <GoalForm key={editing.id} initial={editing} accounts={data.accounts} isNew={!goals.some((g) => g.id === editing.id)} onDone={() => setEditing(null)} />}

      {!editing && goals.length === 0 && (
        <div className="px-4">
          <p className="text-[15px] leading-snug text-mut">Nessun obiettivo. Scegline uno per iniziare:</p>
          <div className="-mx-1 mt-2 flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <Chip
                key={s.name}
                onClick={() =>
                  setEditing({ id: newId(), name: s.name, target: s.target, date: `${new Date().getFullYear() + s.years}-12-31`, scope: s.scope })
                }
              >
                <Plus size={15} strokeWidth={2.4} /> {s.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <ul className={editing ? "hidden" : ""}>
        {goals.map((g) => {
          const current = scopeValue(g.scope);
          const progress = g.target > 0 ? Math.min(1, current / g.target) : 0;
          const months = monthsUntil(g.date);
          const need = requiredMonthly(current, g.target, plan.expectedReturn, months);
          const done = current >= g.target;
          const scopeLabel = g.scope === "tutto" ? "Tutto il patrimonio" : g.scope === "liquidita" ? "Liquidità" : data.accounts.find((a) => a.id === g.scope)?.name ?? g.scope;
          return (
            <li key={g.id}>
            <button onClick={() => setEditing(g)} className="block w-full px-4 py-3.5 text-left active:bg-panel-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{g.name}</p>
                    <p className="mt-0.5 text-[14px] text-mut">
                      {scopeLabel} · entro {fmtDate(g.date, { month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="num shrink-0 text-right">
                    <p className="sensitive text-[17px] font-medium">{fmtEur0(current)}</p>
                    <p className="text-[14px] text-mut">di {fmtEur0(g.target)}</p>
                  </div>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-chip">
                  <div className={`h-full rounded-full ${done ? "bg-up" : "bg-accent"}`} style={{ width: `${Math.max(2, progress * 100)}%` }} />
                </div>
                <p className="mt-2 text-[14px] leading-snug text-mut">
                  {done ? (
                    <span className="font-semibold text-up">Obiettivo raggiunto.</span>
                  ) : months === 0 ? (
                    "La scadenza è arrivata: sposta la data o rivedi l'importo."
                  ) : (
                    <>
                      {Math.round(progress * 100)}% · versa <b className="num font-semibold text-ink">{fmtEur0(need)}</b> al mese per arrivarci
                    </>
                  )}
                </p>
            </button>
            </li>
          );
        })}
      </ul>

      {!editing && totals && <Ribilanciamento views={views} targets={data.targets} monthly={plan.monthly} />}

      {!editing && totals && <Pianificazione start={totals.value} plan={plan} />}
    </div>
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
    <div className="mb-5">
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

function Pianificazione({ start, plan }: { start: number; plan: Plan }) {
  const [monthly, setMonthly] = useState(String(plan.monthly));
  const [r, setR] = useState(String(plan.expectedReturn));
  const [years, setYears] = useState(plan.years);

  const pmt = parseAmount(monthly);
  const rate = Number(r);

  // Salva le scelte (con un attimo di ritardo mentre si scrive).
  useEffect(() => {
    const t = setTimeout(() => {
      if (pmt !== plan.monthly || rate !== plan.expectedReturn || years !== plan.years) savePlan({ monthly: pmt, expectedReturn: rate, years });
    }, 600);
    return () => clearTimeout(t);
  }, [pmt, rate, years, plan]);

  const points = useMemo(() => {
    const now = new Date();
    return Array.from({ length: years * 12 + 1 }, (_, m) => {
      const d = new Date(now.getFullYear(), now.getMonth() + m, 1, 12);
      return { date: d.toISOString().slice(0, 10), value: futureValue(start, pmt, rate, m) };
    });
  }, [start, pmt, rate, years]);
  const contributed = useMemo(() => points.map((_, m) => start + pmt * m), [points, start, pmt]);

  const end = futureValue(start, pmt, rate, years * 12);
  const low = futureValue(start, pmt, Math.max(0, rate - 0.02), years * 12);
  const high = futureValue(start, pmt, rate + 0.02, years * 12);
  const paid = start + pmt * years * 12;

  return (
    <>
      <SectionHeader>Pianificazione</SectionHeader>
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
          format={fmtEur0}
          formatAxis={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}M €` : `${Math.round(v / 1000)}k €`)}
          describePoint={(i) => `${fmtEur0(points[i].value)} · versati ${fmtEur0(contributed[i])}`}
          describeRange={(a, b) => `+${fmtEur0(points[b].value - points[a].value)}`}
        />
      </div>
      <p className="flex items-center gap-4 px-4 pt-3 text-[13px] text-mut">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-up" /> Valore atteso
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-accent" /> Versato
        </span>
      </p>

      <Panel className="mt-6">
        <Field label="Versamento mensile (€)">
          <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="500" className={inputCls} />
        </Field>
        <div className="border-b border-sep px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-mut">Orizzonte</span>
            <span className="num text-[15px] font-semibold">{years} anni</span>
          </div>
          <input type="range" min={1} max={40} value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="Orizzonte in anni" className="mt-2 w-full" />
        </div>
        <div className="px-4 py-3">
          <span className="text-[12px] font-medium text-mut">Rendimento atteso</span>
          <div className="mt-2">
            <Segmented size="sm" value={r} onChange={setR} options={RETURNS} />
          </div>
        </div>
      </Panel>

      <Panel className="mt-3">
        <InfoRow label={`Se rende il ${(Math.max(0, rate - 0.02) * 100).toLocaleString("it-IT")}%`} hint="Scenario prudente" value={fmtEur0(low)} />
        <InfoRow label={`Se rende il ${((rate + 0.02) * 100).toLocaleString("it-IT")}%`} hint="Scenario ottimista" value={fmtEur0(high)} />
      </Panel>
      <p className="px-6 pb-2 pt-4 text-center text-[12px] leading-relaxed text-mut">
        Proiezione al lordo di tasse e inflazione, a rendimento costante.
      </p>
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
