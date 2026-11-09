"use client";

import Link from "next/link";
import { Minus, Plus, Search, Wallet } from "lucide-react";
import { Logo, Panel, SectionHeader } from "@/components/ui";
import type { PositionView } from "@/lib/analytics";
import { adjust, groupOf, GROUP_COLOR, GROUP_LABEL, GROUPS, normalize, PRESETS, samePreset, type Group, type Weights } from "@/lib/allocation";
import { fmtEur0, fmtN } from "@/lib/format";
import { splitContribution } from "@/lib/rebalance";

const STEP = 5;

/** Barra unica divisa nei gruppi: i pesi sommano sempre a 100. */
function StackBar({ w, now }: { w: Weights; now?: Weights }) {
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-chip" role="img" aria-label={GROUPS.map((g) => `${GROUP_LABEL[g]} ${w[g]}%`).join(", ")}>
        {GROUPS.map((g) =>
          w[g] > 0 ? <span key={g} className="h-full transition-[width] duration-300 ease-out first:rounded-l-full last:rounded-r-full [&+&]:ml-0.5" style={{ width: `${w[g]}%`, background: GROUP_COLOR[g] }} /> : null,
        )}
      </div>
      {now && (
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-chip opacity-50" aria-hidden>
          {GROUPS.map((g) => (now[g] > 0 ? <span key={g} className="h-full [&+&]:ml-0.5" style={{ width: `${now[g]}%`, background: GROUP_COLOR[g] }} /> : null))}
        </div>
      )}
    </div>
  );
}

/**
 * Come vuoi investire: un profilo pronto con un tocco, poi i ritocchi a passi
 * del 5% (quello che aggiungi a un gruppo viene tolto al più grande).
 */
export function ComeInvesti({ weights, now, rate, onChange }: { weights: Weights; now: Weights; rate: number; onChange: (w: Weights) => void }) {
  const preset = samePreset(weights);
  const isNow = GROUPS.every((g) => weights[g] === now[g]);
  const options = [...PRESETS.map((p) => ({ id: p.id, label: p.label, weights: p.weights })), { id: "ora", label: "Come ora", weights: now }];
  const active = preset ?? (isNow ? "ora" : null);

  return (
    <>
      <SectionHeader>Come investi</SectionHeader>
      <p className="px-4 pb-3 text-[14px] leading-snug text-mut">Scegli un profilo, poi ritocca se vuoi. Da qui stimiamo quanto può rendere.</p>

      <div className="grid grid-cols-4 gap-1.5 px-4">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.weights)}
            aria-pressed={active === o.id}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-[14px] px-1 text-[13px] font-semibold transition-colors active:opacity-70 ${
              active === o.id ? "bg-ink text-bg" : "bg-chip text-ink-2"
            }`}
          >
            <span className="flex h-1.5 w-10 overflow-hidden rounded-full bg-bg/30">
              {GROUPS.map((g) => (o.weights[g] > 0 ? <span key={g} style={{ width: `${o.weights[g]}%`, background: GROUP_COLOR[g] }} /> : null))}
            </span>
            {o.label}
          </button>
        ))}
      </div>

      <Panel className="mt-4">
        <div className="border-b border-sep px-4 pb-3.5 pt-4">
          <StackBar w={weights} now={isNow ? undefined : now} />
          <p className="mt-3 text-[15px] text-ink-2">
            Rendimento stimato <b className="num font-semibold text-ink">≈ {fmtN(rate * 100, { maximumFractionDigits: 1 })}%</b> l&apos;anno
          </p>
          {!isNow && <p className="mt-0.5 text-[13px] text-mut">La barra sottile è la composizione di oggi.</p>}
        </div>
        {GROUPS.map((g) => (
          <div key={g} className="flex min-h-[56px] items-center gap-3 border-b border-sep px-4 py-1.5 last:border-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: GROUP_COLOR[g] }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-medium">{GROUP_LABEL[g]}</p>
              <p className="num text-[13px] text-mut">oggi {now[g]}%</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label={`Meno ${GROUP_LABEL[g]}`}
                disabled={weights[g] <= 0}
                onClick={() => onChange(adjust(weights, g, -STEP))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-chip text-ink-2 active:opacity-60 disabled:opacity-30"
              >
                <Minus size={18} strokeWidth={2.4} />
              </button>
              <span className="num w-12 text-center text-[17px] font-semibold" aria-live="polite">
                {weights[g]}%
              </span>
              <button
                aria-label={`Più ${GROUP_LABEL[g]}`}
                disabled={weights[g] >= 100}
                onClick={() => onChange(adjust(weights, g, STEP))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-chip text-ink-2 active:opacity-60 disabled:opacity-30"
              >
                <Plus size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        ))}
      </Panel>
    </>
  );
}

/** Come dividere il versamento del mese per avvicinarsi alla composizione scelta, senza vendere. */
export function DoveInvestire({ views, cash, weights, monthly }: { views: PositionView[]; cash: number; weights: Weights; monthly: number }) {
  if (monthly <= 0) return null;
  const current: Record<Group, number> = { azioni: 0, obbligazioni: 0, liquidita: cash, altro: 0 };
  for (const v of views) current[groupOfView(v)] += v.value;
  // Se la composizione scelta è quella di oggi (a meno degli arrotondamenti al punto),
  // si usano i pesi esatti: altrimenti mezzo punto di arrotondamento sembrerebbe uno squilibrio.
  const tot = GROUPS.reduce((a, g) => a + Math.max(0, current[g]), 0);
  const today = normalize(current);
  const asToday = tot > 0 && GROUPS.every((g) => today[g] === weights[g]);
  const targets = Object.fromEntries(GROUPS.map((g) => [g, asToday ? Math.max(0, current[g]) / tot : weights[g] / 100]));
  const split = splitContribution(current, targets, monthly);
  const pick = (g: Group) => views.filter((v) => groupOfView(v) === g).sort((a, b) => b.value - a.value)[0];
  const rows = GROUPS.filter((g) => (split[g] ?? 0) >= 1).sort((a, b) => split[b] - split[a]);

  return (
    <>
      <SectionHeader>Questo mese</SectionHeader>
      <p className="px-4 pb-2 text-[14px] leading-snug text-mut">Come dividere i {fmtEur0(monthly)} per avvicinarti alla composizione scelta.</p>
      <ul>
        {rows.map((g) => {
          const v = g === "liquidita" ? undefined : pick(g);
          const name = v?.instrument.shortName ?? v?.instrument.name;
          const href = v ? `/posizioni/${v.instrument.isin}` : g === "liquidita" ? "/movimenti/nuovo?tipo=deposit" : "/cerca";
          return (
            <li key={g}>
              <Link href={href} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
                {v ? (
                  <Logo isin={v.instrument.isin} name={name!} size={44} />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-ink-2">{g === "liquidita" ? <Wallet size={19} /> : <Search size={19} />}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold">{g === "liquidita" ? "Lascia sul conto" : v ? `Compra ${name}` : `Scegli un titolo: ${GROUP_LABEL[g].toLowerCase()}`}</p>
                  <p className="flex items-center gap-1.5 text-[14px] text-mut">
                    <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[g] }} />
                    {GROUP_LABEL[g]}
                  </p>
                </div>
                <p className="num text-[17px] font-medium">{fmtEur0(split[g])}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-4 pt-1 text-[13px] leading-snug text-mut">Solo acquisti: niente vendite, niente tasse.</p>
    </>
  );
}

function groupOfView(v: PositionView): Group {
  return groupOf(v.instrument.assetClass);
}
