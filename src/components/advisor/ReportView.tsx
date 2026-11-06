"use client";

import { useState } from "react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import type { Report } from "@/lib/ai/prompts";
import { Markdown } from "./Markdown";

const PRIORITY = {
  alta: "bg-dn/12 text-dn",
  media: "bg-warn/15 text-warn",
  bassa: "bg-chip text-mut",
} as const;

/** Risposta di un'analisi: in breve, cosa fare, perché, rischi, dati usati. */
export function ReportView({ report }: { report: Report }) {
  const [showData, setShowData] = useState(false);
  return (
    <div>
      <p className="page-in px-4 pt-2 text-[19px] font-medium leading-snug tracking-[-0.01em]">{report.summary}</p>

      {report.actions.length > 0 && (
        <>
          <h2 className="px-4 pb-3 pt-8 text-[22px] font-bold tracking-[-0.025em]">Cosa fare</h2>
          <ol className="stagger space-y-2.5 px-4">
            {report.actions.map((a, i) => (
              <li key={i} className="rounded-[18px] bg-panel p-4">
                <div className="flex items-start gap-3">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-bg">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[17px] font-semibold leading-snug">{a.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold capitalize ${PRIORITY[a.priority] ?? PRIORITY.bassa}`}>{a.priority}</span>
                    </div>
                    <Markdown text={a.detail} className="mt-1.5 text-[15px] leading-relaxed text-ink-2" />
                    {a.impact && <p className="num mt-2.5 inline-block rounded-full bg-up/12 px-2.5 py-1 text-[13px] font-semibold text-up">{a.impact}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {report.sections.map((s, i) => (
        <section key={i}>
          <h2 className="px-4 pb-2 pt-8 text-[22px] font-bold tracking-[-0.025em]">{s.title}</h2>
          <Markdown text={s.text} className="px-4 text-[16px] leading-relaxed text-ink-2" />
        </section>
      ))}

      {report.risks.length > 0 && (
        <div className="mx-4 mt-8 rounded-[18px] border border-sep p-4">
          <p className="flex items-center gap-2 text-[16px] font-semibold">
            <ShieldAlert size={18} className="text-warn" /> Rischi e alternative
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-1.5 text-[15px] leading-snug text-ink-2 marker:text-faint">
            {report.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
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
      <p className="px-4 pt-6 text-[12px] leading-snug text-mut">
        Analisi generata con intelligenza artificiale sui numeri calcolati da Basis. Può contenere errori: non è consulenza finanziaria personalizzata ai sensi di legge.
      </p>
    </div>
  );
}
