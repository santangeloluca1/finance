"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import type { Report } from "@/lib/ai/prompts";
import { Markdown } from "./Markdown";
import { ASSISTANT, Orb } from "./Orb";

const PRIORITY = { alta: "Priorità alta", media: "Priorità media", bassa: "Priorità bassa" } as const;

/**
 * Risultato di un'analisi, nello stile delle schede di getquin: titoli grandi,
 * liste pulite senza riquadri colorati, etichette grigie, valori in evidenza.
 */
export function ReportView({ report, date, onDiscuss }: { report: Report; date?: string; onDiscuss?: () => void }) {
  const [showData, setShowData] = useState(false);
  return (
    <div>
      {/* Il giudizio di Basis AI */}
      <div className="page-in px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <Orb size={30} />
          <p className="text-[15px] font-semibold">{ASSISTANT}</p>
          {date && <p className="text-[13px] text-mut">· {date}</p>}
        </div>
        <p className="mt-3 text-[21px] font-semibold leading-[1.32] tracking-[-0.02em]">{report.summary}</p>
      </div>

      {report.actions.length > 0 && (
        <>
          <h2 className="px-4 pb-1 pt-10 text-[22px] font-bold tracking-[-0.025em]">Cosa fare</h2>
          <ol className="stagger">
            {report.actions.map((a, i) => (
              <li key={i} className="flex gap-4 px-4 py-4">
                <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-[15px] font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-[17px] font-semibold leading-snug">{a.title}</p>
                  <Markdown text={a.detail} className="mt-1 text-[15px] leading-relaxed text-mut [&_strong]:text-ink" />
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-chip px-2.5 py-0.5 text-[13px] text-mut">{PRIORITY[a.priority] ?? PRIORITY.bassa}</span>
                    {a.impact && <span className="num text-[14px] font-medium text-up">↗ {a.impact}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {report.sections.map((s, i) => (
        <section key={i}>
          <h2 className="px-4 pb-2 pt-9 text-[22px] font-bold tracking-[-0.025em]">{s.title}</h2>
          <Markdown text={s.text} className="px-4 text-[16px] leading-relaxed text-ink-2" />
        </section>
      ))}

      {report.risks.length > 0 && (
        <>
          <h2 className="px-4 pb-2 pt-9 text-[22px] font-bold tracking-[-0.025em]">Da tenere presente</h2>
          <ul className="stagger">
            {report.risks.map((r, i) => (
              <li key={i} className="flex gap-3.5 px-4 py-2.5">
                <ShieldAlert size={20} strokeWidth={1.7} className="mt-0.5 shrink-0 text-mut" />
                <p className="text-[15px] leading-snug text-ink-2">{r}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {onDiscuss && (
        <button onClick={onDiscuss} className="press mx-4 mt-9 flex min-h-[64px] w-[calc(100%-2rem)] items-center gap-3.5 rounded-[18px] bg-panel px-4 text-left">
          <Orb size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">Approfondisci con {ASSISTANT}</span>
            <span className="block text-[13px] text-mut">Chiedi dettagli o alternative su questa analisi</span>
          </span>
          <ChevronRight size={20} strokeWidth={1.8} className="shrink-0 text-ink-2" />
        </button>
      )}

      {report.dataUsed.length > 0 && (
        <div className="px-4 pt-4">
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
