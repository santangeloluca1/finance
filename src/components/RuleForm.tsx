"use client";

import { useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { Panel, Segmented, SelectButton } from "@/components/ui";
import type { PositionView, Quotes, Totals } from "@/lib/analytics";
import type { Instrument } from "@/lib/engine/types";
import { describeRule, readRule, RULE_KINDS, type AlertRule, type RuleKind } from "@/lib/notify";
import { deleteRule, saveRule } from "@/lib/store";

/** Unità della soglia per ogni tipo di regola. */
function unitOf(kind: RuleKind, currency: string) {
  if (kind === "price") return currency === "EUR" ? "€" : currency;
  if (kind === "value") return "€";
  return "%";
}

const isPct = (k: RuleKind) => k === "dayMove" || k === "gain" || k === "weight";

/** Numero scritto all'italiana ("1.234,5") → 1234.5. */
function parseNum(s: string) {
  const t = s.replace(/\s|€|%/g, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
}

function toInput(rule: AlertRule) {
  if (!rule.threshold && rule.threshold !== 0) return "";
  const v = isPct(rule.kind) ? rule.threshold * 100 : rule.threshold;
  return v.toLocaleString("it-IT", { maximumFractionDigits: 4, useGrouping: false });
}

export function RuleForm({
  initial,
  isNew,
  instruments,
  views,
  totals,
  quotes,
  onDone,
}: {
  initial: AlertRule;
  isNew: boolean;
  instruments: Instrument[];
  views: PositionView[];
  totals: Totals;
  quotes: Quotes;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<RuleKind>(initial.kind);
  const [target, setTarget] = useState(initial.target);
  const [op, setOp] = useState(initial.op);
  const [value, setValue] = useState(toInput(initial));
  const [repeat, setRepeat] = useState(initial.repeat);
  const [note, setNote] = useState(initial.note ?? "");

  const meta = RULE_KINDS.find((k) => k.kind === kind)!;
  // Prima i titoli in portafoglio, poi gli altri già usati in passato.
  const held = useMemo(() => new Set(views.map((v) => v.instrument.isin)), [views]);
  const options = useMemo(
    () =>
      [...instruments]
        .filter((i) => kind !== "weight" || held.has(i.isin))
        .sort((a, b) => Number(held.has(b.isin)) - Number(held.has(a.isin)) || (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name))
        .map((i) => ({ value: i.isin, label: i.shortName ?? i.name })),
    [instruments, held, kind],
  );
  const targets = [...(meta.portfolio ? [{ value: "portfolio", label: "Tutto il portafoglio" }] : []), ...(meta.instrument ? options : [])];
  const effectiveTarget = targets.some((t) => t.value === target) ? target : (targets[0]?.value ?? "portfolio");
  const currency = instruments.find((i) => i.isin === effectiveTarget)?.currency ?? "EUR";

  const raw = parseNum(value);
  // Le percentuali si scrivono come numeri interi (5 = 5%); solo il guadagno può essere negativo.
  const threshold = isPct(kind) ? (kind === "gain" ? raw : Math.abs(raw)) / 100 : raw;
  const draft: AlertRule = { ...initial, kind, target: effectiveTarget, op, threshold, repeat, note: note.trim() || undefined };
  const valid = Number.isFinite(raw) && value.trim() !== "" && (kind === "gain" || raw > 0) && targets.length > 0;
  const reading = readRule({ ...draft, threshold: valid ? threshold : 0 }, { views, totals, quotes, instruments });

  const opLabels =
    kind === "dayMove"
      ? [
          { value: "below" as const, label: "Scende di" },
          { value: "above" as const, label: "Sale di" },
        ]
      : [
          { value: "below" as const, label: kind === "price" || kind === "value" ? "Sotto" : "Meno di" },
          { value: "above" as const, label: kind === "price" || kind === "value" ? "Sopra" : "Più di" },
        ];

  const field = "block border-b border-sep px-4 pb-2.5 pt-3 last:border-0 focus-within:bg-panel-2";

  return (
    <div className="pb-4">
      <Panel>
        <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-sep px-4">
          <span className="text-[16px]">Avvisami per</span>
          <SelectButton label="Tipo di regola" value={kind} onChange={setKind} options={RULE_KINDS.map((k) => ({ value: k.kind, label: k.label }))} />
        </div>
        <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-sep px-4">
          <span className="text-[16px]">{meta.instrument && !meta.portfolio ? "Titolo" : "Su"}</span>
          {targets.length ? (
            <SelectButton label="Titolo" value={effectiveTarget} onChange={setTarget} options={targets} />
          ) : (
            <span className="text-[15px] text-mut">Nessun titolo</span>
          )}
        </div>
        <div className="border-b border-sep px-4 py-3">
          <Segmented value={op} onChange={setOp} options={opLabels} />
        </div>
        <label className={field}>
          <span className="block text-[12px] font-medium text-mut">
            Soglia{kind === "gain" ? " (anche negativa, es. −10)" : ""}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "price" ? "Es. 105,50" : kind === "value" ? "Es. 100.000" : "Es. 5"}
              className="num h-7 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
            />
            <span className="text-[17px] text-mut">{unitOf(kind, currency)}</span>
          </span>
          <span className="num mt-1 block text-[13px] text-mut">
            Ora: {reading.label}
            {valid && reading.hit ? " · condizione già vera" : ""}
          </span>
        </label>
        <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-sep px-4">
          <span className="text-[16px]">Quante volte</span>
          <SelectButton
            label="Ripetizione"
            value={repeat}
            onChange={setRepeat}
            options={[
              { value: "once", label: "Una volta sola" },
              { value: "daily", label: "Al massimo una al giorno" },
            ]}
          />
        </div>
        <label className={field}>
          <span className="block text-[12px] font-medium text-mut">Nota nella notifica (facoltativa)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. Valuta di comprare altre quote" className="mt-0.5 h-7 w-full bg-transparent text-[17px] outline-none placeholder:text-faint" />
        </label>
      </Panel>
      {valid && <p className="px-8 pt-2 text-[13px] leading-snug text-mut">{describeRule(draft, instruments)}.</p>}
      <div className="flex gap-2 px-4 pt-5">
        <button onClick={onDone} className="h-[50px] flex-1 rounded-[16px] bg-chip text-[16px] font-semibold text-ink-2 active:opacity-70">
          Annulla
        </button>
        <button
          disabled={!valid}
          onClick={() => {
            saveRule({ ...draft, enabled: true, createdAt: initial.createdAt ?? new Date().toISOString() });
            onDone();
          }}
          className="flex h-[50px] flex-[2] items-center justify-center gap-2 rounded-[16px] bg-ink text-[16px] font-semibold text-bg active:opacity-80 disabled:opacity-40"
        >
          <Check size={18} strokeWidth={2.6} /> Salva regola
        </button>
      </div>
      {!isNew && (
        <button
          onClick={() => {
            deleteRule(initial.id);
            onDone();
          }}
          className="mx-auto mt-3 flex min-h-[44px] items-center gap-2 px-4 text-[15px] font-semibold text-dn"
        >
          <Trash2 size={16} /> Elimina regola
        </button>
      )}
    </div>
  );
}
