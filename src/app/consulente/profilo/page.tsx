"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { BackLink } from "@/components/ui";
import { PROFILE_QUESTIONS, type InvestorProfile } from "@/lib/ai/profile";
import { saveProfile, usePortfolioData } from "@/lib/store";

/** Profilo dell'investitore: una domanda per schermata, poi le note libere. */
export default function Profilo() {
  const data = usePortfolioData();
  const router = useRouter();
  const [answers, setAnswers] = useState<Partial<InvestorProfile>>(data.profile ?? {});
  const [step, setStep] = useState(0);
  const total = PROFILE_QUESTIONS.length + 1;
  const q = PROFILE_QUESTIONS[step];

  const finish = () => {
    saveProfile(answers as InvestorProfile);
    router.push("/consulente");
  };

  return (
    <div>
      <BackLink href="/consulente" label="Consulente" />
      {/* Avanzamento */}
      <div className="mx-4 mt-2 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent" : "bg-chip"}`} />
        ))}
      </div>

      <div key={step} className="page-in px-4 pt-8">
        {q ? (
          <>
            <p className="text-[14px] font-medium text-mut">
              Domanda {step + 1} di {PROFILE_QUESTIONS.length}
            </p>
            <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.03em]">{q.question}</h1>
            <ul className="stagger mt-6 space-y-2.5">
              {q.options.map((o) => {
                const on = answers[q.key] === o.value;
                return (
                  <li key={o.value}>
                    <button
                      onClick={() => {
                        setAnswers({ ...answers, [q.key]: o.value });
                        setTimeout(() => setStep(step + 1), 180);
                      }}
                      className={`press flex min-h-[60px] w-full items-center gap-3 rounded-[16px] border-2 px-4 py-3 text-left transition-colors ${on ? "border-accent bg-accent/8" : "border-transparent bg-panel"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-semibold">{o.label}</span>
                        {o.hint && <span className="block text-[13px] text-mut">{o.hint}</span>}
                      </span>
                      {on && <Check size={20} className="shrink-0 text-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <p className="text-[14px] font-medium text-mut">Ultimo passo, facoltativo</p>
            <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.03em]">C&apos;è altro che il consulente deve sapere?</h1>
            <textarea
              value={answers.notes ?? ""}
              onChange={(e) => setAnswers({ ...answers, notes: e.target.value.slice(0, 600) })}
              rows={5}
              placeholder="Es. compro casa nel 2029 e mi servono 40.000 €; non voglio azioni singole; preferisco ETF ad accumulazione."
              className="mt-6 w-full rounded-[16px] bg-panel p-4 text-[16px] leading-snug outline-none placeholder:text-faint"
            />
            <p className="mt-2 text-[13px] text-mut">Non scrivere dati personali (nomi, conti): non servono.</p>
            <button onClick={finish} className="press mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-ink text-[16px] font-semibold text-bg">
              <Check size={18} strokeWidth={2.6} /> Salva profilo
            </button>
          </>
        )}
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="mt-4 flex min-h-[44px] items-center gap-1 text-[15px] font-medium text-mut">
            <ChevronLeft size={18} /> Indietro
          </button>
        )}
      </div>
    </div>
  );
}
