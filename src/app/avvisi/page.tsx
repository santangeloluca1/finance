"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellOff, BellRing, CalendarPlus, Check, ChevronRight, Info, Settings2, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { RuleForm } from "@/components/RuleForm";
import { BackLink, InfoRow, LargeTitle, Panel, SectionHeader, SelectButton, Switch, AddButton, IconButton } from "@/components/ui";
import { computeAlerts, type Alert } from "@/lib/alerts";
import { fmtDate } from "@/lib/format";
import { describeRule, readRule, type AlertRule } from "@/lib/notify";
import { usePush } from "@/lib/push-client";
import { completeReminder, deleteReminder, dismissAlert, markAlertsSeen, newId, saveReminder, saveRule, type Reminder } from "@/lib/store";

const ICON = {
  attenzione: { icon: AlertTriangle, cls: "bg-warn/15 text-warn" },
  positivo: { icon: Sparkles, cls: "bg-up/15 text-up" },
  info: { icon: Info, cls: "bg-chip text-mut" },
} as const;

const REPEAT_LABEL = { none: "Una volta", monthly: "Ogni mese", yearly: "Ogni anno" } as const;

export default function Avvisi() {
  const { data, state, views, totals, quotes } = usePortfolioView();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [rule, setRule] = useState<AlertRule | null>(null);
  const push = usePush();
  const seen = useMemo(() => new Set(data.alertsSeen ?? []), [data.alertsSeen]);

  const alerts = useMemo(() => {
    const all = state && totals ? computeAlerts(data, state, views, totals, quotes) : [];
    // I titoli senza quotazione diventano un'unica riga.
    const stale = all.filter((a) => a.id.startsWith("stale-"));
    const rest = all.filter((a) => !a.id.startsWith("stale-"));
    if (stale.length < 2) return all;
    return [
      ...rest,
      {
        id: `stale-${stale.length}`,
        level: stale[0].level,
        title: `${stale.length} titoli senza quotazione`,
        detail: stale.map((a) => a.title.replace("Nessuna quotazione per ", "")).join(", "),
        href: "/posizioni",
        kind: "quotazioni",
      } satisfies Alert,
    ];
  }, [data, state, views, totals, quotes]);

  // Aprendo la pagina gli avvisi diventano "visti": la campanella si spegne.
  const ids = alerts.map((a) => a.id).join(",");
  useEffect(() => {
    if (!ids) return;
    const t = setTimeout(() => markAlertsSeen(ids.split(",")), 1500);
    return () => clearTimeout(t);
  }, [ids]);

  const upcoming = [...(data.reminders ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const rules = data.alertRules ?? [];
  const newRule = (): AlertRule => ({
    id: newId(),
    kind: "price",
    target: views[0]?.instrument.isin ?? data.instruments[0]?.isin ?? "portfolio",
    op: "below",
    threshold: NaN,
    repeat: "once",
    enabled: true,
  });
  const busy = editing || rule;
  const onceRule = (a: Alert) => (a.ruleId ? rules.find((r) => r.id === a.ruleId && r.repeat === "once") : undefined);

  return (
    <div>
      <BackLink href="/" label="Home" />
      <LargeTitle
        right={
          !busy && (
            <IconButton href="/avvisi/notifiche" label="Impostazioni delle notifiche">
              <Settings2 size={18} />
            </IconButton>
          )
        }
      >
        {rule ? (rules.some((r) => r.id === rule.id) ? "Modifica regola" : "Nuova regola") : "Avvisi"}
      </LargeTitle>

      {editing && <ReminderForm key={editing.id} initial={editing} isNew={!upcoming.some((r) => r.id === editing.id)} onDone={() => setEditing(null)} />}
      {rule && totals && (
        <RuleForm
          key={rule.id}
          initial={rule}
          isNew={!rules.some((r) => r.id === rule.id)}
          instruments={data.instruments}
          views={views}
          totals={totals}
          quotes={quotes}
          onDone={() => setRule(null)}
        />
      )}

      {!busy && (
        <>
          {push.status && push.status !== "on" && !data.isDemo && (
            <Link href="/avvisi/notifiche" className="mx-4 mb-4 flex min-h-[60px] items-center gap-3 rounded-[16px] bg-accent/12 px-4 py-2.5 active:opacity-80">
              <BellRing size={20} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">Ricevi gli avvisi sull&apos;iPhone</span>
                <span className="block text-[14px] leading-snug text-mut">
                  {push.status === "needs-install" ? "Aggiungi Basis alla schermata Home per attivare le notifiche" : "Attiva le notifiche push, anche ad app chiusa"}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-accent" />
            </Link>
          )}
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3.5 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-mut">
                <BellOff size={18} />
              </span>
              <p className="text-[15px] leading-snug text-mut">Nessun avviso. Qui compaiono minus in scadenza, cali forti, cedole in arrivo, le tue regole e i promemoria.</p>
            </div>
          ) : (
            <ul>
              {alerts.map((a) => {
                const I = ICON[a.level];
                const fresh = a.level !== "info" && !seen.has(a.id);
                return (
                  <li key={a.id} className="flex items-center">
                    <Link href={a.href} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3.5 py-3 pl-4 active:bg-panel-2">
                      <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${I.cls}`}>
                        <I.icon size={18} />
                        {fresh && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-bg bg-dn" aria-label="Nuovo" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-semibold leading-snug">{a.title}</p>
                        <p className="mt-0.5 text-[14px] leading-snug text-mut">{a.detail}</p>
                      </div>
                    </Link>
                    {/* Regola "una volta": "Ok" la spegne, così non ricompare. */}
                    {onceRule(a) ? (
                      <button
                        onClick={() => saveRule({ ...onceRule(a)!, enabled: false })}
                        aria-label={`Disattiva la regola: ${a.title}`}
                        className="mx-2 flex h-11 shrink-0 items-center gap-1 rounded-full bg-chip px-3.5 text-[14px] font-semibold active:opacity-70"
                      >
                        <Check size={16} strokeWidth={2.6} /> Ok
                      </button>
                    ) : a.reminderId ? (
                      <button
                        onClick={() => completeReminder(a.reminderId!)}
                        aria-label={`Segna fatto: ${a.title}`}
                        className="mx-2 flex h-11 shrink-0 items-center gap-1 rounded-full bg-chip px-3.5 text-[14px] font-semibold active:opacity-70"
                      >
                        <Check size={16} strokeWidth={2.6} /> Fatto
                      </button>
                    ) : (
                      <button onClick={() => dismissAlert(a.id)} aria-label={`Archivia: ${a.title}`} className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-mut active:opacity-50">
                        <X size={18} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <SectionHeader
            right={
              <AddButton label="Nuova regola" onClick={() => setRule(newRule())} />
            }
          >
            Le tue regole
          </SectionHeader>
          {rules.length === 0 ? (
            <button onClick={() => setRule(newRule())} className="flex w-full items-center gap-3.5 px-4 py-2 text-left active:bg-panel-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-mut">
                <SlidersHorizontal size={18} />
              </span>
              <p className="text-[15px] leading-snug text-mut">
                Crea le tue regole: un titolo che scende sotto un prezzo, il portafoglio che supera una cifra, un guadagno che arriva al 20%.
              </p>
            </button>
          ) : (
            <ul>
              {rules.map((r) => {
                const reading = totals ? readRule(r, { views, totals, quotes, instruments: data.instruments }) : null;
                return (
                  <li key={r.id} className="flex items-center">
                    <button onClick={() => setRule(r)} className="flex min-h-[64px] min-w-0 flex-1 flex-col justify-center py-2.5 pl-4 pr-3 text-left active:bg-panel-2">
                      <p className={`text-[17px] font-semibold leading-snug ${r.enabled ? "" : "text-mut"}`}>{describeRule(r, data.instruments)}</p>
                      <p className="num mt-0.5 text-[14px] text-mut">
                        Ora {reading?.label ?? "—"}
                        {r.enabled && reading?.hit ? <span className="font-semibold text-warn"> · scattata</span> : null}
                        {" · "}
                        {r.repeat === "once" ? "una volta" : "ogni giorno"}
                      </p>
                    </button>
                    <span className="pr-4">
                      <Switch checked={r.enabled} onChange={(on) => saveRule({ ...r, enabled: on })} label={`Regola attiva: ${describeRule(r, data.instruments)}`} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <SectionHeader
            right={
              <AddButton label="Nuovo promemoria" onClick={() => setEditing({ id: newId(), title: "", date: new Date().toISOString().slice(0, 10), repeat: "monthly" })} />
            }
          >
            Promemoria
          </SectionHeader>
          {upcoming.length === 0 ? (
            <p className="px-4 text-[15px] leading-snug text-mut">
              Nessun promemoria. Creane uno, ad esempio per il versamento dello stipendio o per controllare il PAC ogni mese.
            </p>
          ) : (
            <ul>
              {upcoming.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setEditing(r)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-panel-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold">{r.title}</p>
                      <p className="mt-0.5 text-[14px] text-mut">
                        {fmtDate(r.date, { day: "numeric", month: "long", year: "numeric" })} · {REPEAT_LABEL[r.repeat]}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-mut" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ReminderForm({ initial, isNew, onDone }: { initial: Reminder; isNew: boolean; onDone: () => void }) {
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [repeat, setRepeat] = useState<Reminder["repeat"]>(initial.repeat);
  const valid = title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const ics = `/api/ics?${new URLSearchParams({ title: title.trim() || "Promemoria", date, repeat })}`;

  return (
    <div className="pb-4">
      <Panel>
        <label className="block border-b border-sep px-4 pb-2.5 pt-3 focus-within:bg-panel-2">
          <span className="block text-[12px] font-medium text-mut">Promemoria</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Versa lo stipendio su Fineco" className="mt-0.5 h-7 w-full bg-transparent text-[17px] outline-none placeholder:text-faint" />
        </label>
        <label className="block border-b border-sep px-4 pb-2.5 pt-3 focus-within:bg-panel-2">
          <span className="block text-[12px] font-medium text-mut">Quando</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 h-7 w-full bg-transparent text-[17px] outline-none" />
        </label>
        <div className="flex min-h-[56px] items-center justify-between gap-3 px-4">
          <span className="text-[16px]">Ripeti</span>
          <SelectButton
            label="Ripetizione"
            value={repeat}
            onChange={setRepeat}
            options={(Object.keys(REPEAT_LABEL) as Reminder["repeat"][]).map((k) => ({ value: k, label: REPEAT_LABEL[k] }))}
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
            saveReminder({ id: initial.id, title: title.trim(), date, repeat });
            onDone();
          }}
          className="flex h-[50px] flex-[2] items-center justify-center gap-2 rounded-[16px] bg-ink text-[16px] font-semibold text-bg active:opacity-80 disabled:opacity-40"
        >
          <Check size={18} strokeWidth={2.6} /> Salva
        </button>
      </div>
      {valid && (
        <Panel className="mt-4">
          <a href={ics} className="flex min-h-[52px] items-center gap-3 px-4 text-[16px] font-medium text-accent active:bg-panel-2">
            <CalendarPlus size={20} /> Aggiungi al Calendario dell&apos;iPhone
          </a>
          <InfoRow label="Notifica push" value="la mattina del giorno" hint="Con le notifiche attive arriva anche ad app chiusa" />
        </Panel>
      )}
      {!isNew && (
        <button
          onClick={() => {
            deleteReminder(initial.id);
            onDone();
          }}
          className="mx-auto mt-3 flex min-h-[44px] items-center gap-2 px-4 text-[15px] font-semibold text-dn"
        >
          <X size={16} /> Elimina promemoria
        </button>
      )}
    </div>
  );
}
