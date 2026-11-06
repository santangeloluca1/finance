"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle, ShieldAlert } from "lucide-react";
import type { Report } from "@/lib/ai/prompts";
import { Markdown } from "./Markdown";
import { ASSISTANT, Orb } from "./Orb";

const PRIORITY = {
  alta: { label: "Priorità alta", bar: "bg-dn", chip: "bg-dn/12 text-dn" },
  media: { label: "Priorità media", bar: "bg-warn", chip: "bg-warn/15 text-warn" },
  bassa: { label: "Priorità bassa", bar: "bg-faint", chip: "bg-chip text-mut" },
} as const;

/** Risultato di un'analisi: il giudizio di Minerva, cosa fare, perché, rischi, dati usati. */
export function ReportView({ report, date, onDiscuss }: { report: Report; date?: string; onDiscuss?: () => void }) {
  const [showData, setShowData] = useState(false);
  return (
    <div>
      {/* Il giudizio, firmato da Minerva */}
      <div className="page-in relative mx-4 mt-3 overflow-hidden rounded-[24px] bg-panel p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <Orb size={40} />
          <div>
            <p className="text-[15px] font-semibold leading-tight">{ASSISTANT}</p>
            {date && <p className="text-[12px] text-mut">{date}</p>}
          </div>
        </div>
        <p className="relative mt-4 text-[20px] font-medium leading-[1.35] tracking-[-0.015em]">{report.summary}</p>
      </div>

      {report.actions.length > 0 && (
        <>
          <h2 className="px-4 pb-3 pt-9 text-[22px] font-bold tracking-[-0.025em]">Cosa fare</h2>
          <ol className="stagger space-y-3 px-4">
            {report.actions.map((a, i) => {
              const P = PRIORITY[a.priority] ?? PRIORITY.bassa;
              return (
                <li key={i} className="relative overflow-hidden rounded-[20px] bg-panel py-4 pl-5 pr-4">
                  <span className={`absolute inset-y-0 left-0 w-1 ${P.bar}`} />
                  <div className="flex items-center gap-2">
                    <span className="num text-[13px] font-bold text-mut">{String(i + 1).padStart(2, "0")}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${P.chip}`}>{P.label}</span>
                  </div>
                  <p className="mt-2 text-[18px] font-semibold leading-snug tracking-[-0.01em]">{a.title}</p>
                  <Markdown text={a.detail} className="mt-1.5 text-[15px] leading-relaxed text-ink-2" />
                  {a.impact && <p className="num mt-3 inline-flex rounded-full bg-up/12 px-3 py-1 text-[13px] font-semibold text-up">{a.impact}</p>}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {report.sections.length > 0 && (
        <>
          <h2 className="px-4 pb-3 pt-9 text-[22px] font-bold tracking-[-0.025em]">Perché</h2>
          <div className="stagger space-y-3 px-4">
            {report.sections.map((s, i) => (
              <section key={i} className="rounded-[20px] border border-sep p-4">
                <h3 className="text-[17px] font-semibold">{s.title}</h3>
                <Markdown text={s.text} className="mt-2 text-[15px] leading-relaxed text-ink-2" />
              </section>
            ))}
          </div>
        </>
      )}

      {report.risks.length > 0 && (
        <div className="mx-4 mt-6 rounded-[20px] bg-warn/8 p-4">
          <p className="flex items-center gap-2 text-[16px] font-semibold">
            <ShieldAlert size={18} className="text-warn" /> Rischi e alternative
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-1.5 text-[15px] leading-snug text-ink-2 marker:text-warn/60">
            {report.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {onDiscuss && (
        <button onClick={onDiscuss} className="press mx-4 mt-6 flex h-[56px] w-[calc(100%-2rem)] items-center justify-center gap-3 rounded-[18px] bg-ink text-[16px] font-semibold text-bg">
          <Orb size={26} />
          Approfondisci con {ASSISTANT}
          <MessageCircle size={17} className="opacity-60" />
        </button>
      )}

      {report.dataUsed.length > 0 && (
        <div className="px-4 pt-3">
          <button onClick={() => setShowData(!showData)} className="flex min-h-[44px] items-center gap-1 text-[14px] font-medium text-mut">
            Dati usati <ChevronDown size={16} className={`transition-transform ${showData ? "rotate-180" : ""}`} />
          </button>
          {showData && (
            <ul className="page-in ml-5 list-disc space-y-1 text-[13px] leading-snug text-mut">
              {report.dataUsed.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="px-4 pt-4 text-[12px] leading-snug text-mut">
        Analisi generata con intelligenza artificiale sui numeri calcolati da Basis. Può contenere errori: non è consulenza finanziaria personalizzata ai sensi di legge.
      </p>
    </div>
  );
}

/** Testo del report per aprire una conversazione che lo approfondisce. */
export function reportAsMessage(title: string, r: Report) {
  const actions = r.actions.map((a, i) => `${i + 1}. **${a.title}**${a.impact ? ` (${a.impact})` : ""}: ${a.detail}`).join("\n");
  return `Ecco la mia analisi **${title}**.\n\n${r.summary}\n\n${actions}\n\nDi cosa vuoi parlare? Possiamo approfondire una delle azioni o vedere alternative.`;
}
