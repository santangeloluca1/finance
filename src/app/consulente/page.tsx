"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, ChevronRight, Info, MessageCircle, SquarePen, Sparkles, UserRound } from "lucide-react";
import { useThreads } from "@/lib/ai/threads";
import { ICON } from "@/components/advisor/icons";
import { ASSISTANT, Orb } from "@/components/advisor/Orb";
import { SettingsRow, SettingsSection } from "@/components/settings";
import { LargeTitle } from "@/components/ui";
import { useAdvisor } from "@/lib/ai/client";
import { ANALYSES, GROUP_LABEL, type AnalysisMeta } from "@/lib/ai/prompts";
import { fmtWhen } from "@/lib/format";

const SUGGESTIONS = ["Il mio portafoglio è troppo rischioso per me?", "Conviene recuperare le minus quest'anno?", "Quanto incasserò di cedole il prossimo anno?", "Cosa compro con i prossimi 1.000 €?"];

export default function Consulente() {
  const { configured, view } = useAdvisor();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const profile = view.data.profile;
  const reports = view.data.aiReports ?? [];
  const threads = useThreads();
  const [allThreads, setAllThreads] = useState(false);
  // In vista solo le analisi più utili; le altre si aprono qui sotto.
  const [allAnalyses, setAllAnalyses] = useState(false);
  const groups = (Object.keys(GROUP_LABEL) as AnalysisMeta["group"][]).map((g) => ({ g, items: ANALYSES.filter((a) => a.group === g) }));
  const [main, ...others] = groups;

  const ask = (text: string) => {
    if (!text.trim()) return;
    router.push(`/consulente/chat?q=${encodeURIComponent(text.trim())}`);
  };

  return (
    <div>
      {/* Scheda della barra in basso: niente "indietro", come Titoli e Analisi. */}
      <LargeTitle>{ASSISTANT}</LargeTitle>

      {/* L'oracolo: la sfera si anima di più mentre scrivi la domanda. */}
      <div className="flex flex-col items-center px-6 pb-2 pt-4 text-center">
        <Orb size={112} active={focused && q.length > 0} />
        <p className="mt-7 text-[22px] font-bold leading-tight tracking-[-0.025em]">Consulenza finanziaria personale</p>
        <p className="mt-1.5 text-[14px] leading-snug text-mut">Conosco posizioni, zainetto, rendimenti, obiettivi e il tuo profilo. Mai nome ed email.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="mx-4 mt-4 flex h-12 items-center gap-2 rounded-[14px] bg-chip pl-4 pr-1.5"
      >
        <Sparkles size={18} className="shrink-0 text-mut" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`Scrivi a ${ASSISTANT}`}
          enterKeyHint="send"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
        />
        <button type="submit" aria-label="Chiedi" disabled={!q.trim()} className="press hit relative flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bg transition-opacity disabled:opacity-25">
          <ArrowUp size={18} strokeWidth={2.6} />
        </button>
      </form>
      <div className="no-scrollbar -mb-1 mt-2 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-1">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} className="press hit relative shrink-0 snap-start rounded-full border border-sep px-3.5 py-2 text-[14px] text-ink-2">
            {s}
          </button>
        ))}
      </div>

      {configured === false && (
        // Come si attiva è spiegato in Impostazioni → Informazioni.
        <Link href="/impostazioni/info#basis-ai" className="mx-4 mt-5 flex items-start gap-2 rounded-[14px] bg-panel px-4 py-3 text-[14px] leading-snug text-mut active:bg-panel-2">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink-2">{ASSISTANT} non è ancora attivo</span>
            Intanto puoi compilare il profilo. Come si attiva: Impostazioni → Informazioni.
          </span>
          <ChevronRight size={18} className="mt-0.5 shrink-0 text-faint" />
        </Link>
      )}

      {/* Profilo: come la riga del profilo in Impostazioni. */}
      <Link href="/consulente/profilo" className="mt-6 flex min-h-[72px] items-center gap-4 px-4 py-3 active:bg-panel-2">
        <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-chip text-ink-2">
          <UserRound size={24} strokeWidth={1.7} />
          {!profile && <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-bg bg-accent" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-medium">Il tuo profilo di investitore</p>
          <p className={`text-[14px] leading-snug ${profile ? "text-mut" : "font-medium text-accent"}`}>
            {profile ? `Aggiornato ${profile.updatedAt ? fmtWhen(Date.parse(profile.updatedAt)) : ""}` : "Da completare: 6 domande, un minuto"}
          </p>
        </div>
        <ChevronRight size={20} strokeWidth={1.8} className="shrink-0 text-ink-2" />
      </Link>

      <SettingsSection title="Conversazioni">
        <SettingsRow icon={SquarePen} title="Nuova conversazione" subtitle={`Fai domande su portafoglio, tasse e obiettivi`} href="/consulente/chat" />
        {threads.slice(0, allThreads ? threads.length : 5).map((t) => (
          <SettingsRow
            key={t.id}
            icon={MessageCircle}
            title={t.title}
            subtitle={<span className="line-clamp-1">{t.messages.at(-1)?.text.replace(/\*\*/g, "") ?? ""}</span>}
            href={`/consulente/chat?id=${t.id}`}
          />
        ))}
        {threads.length > 5 && (
          <button onClick={() => setAllThreads(!allThreads)} className="flex min-h-[48px] w-full items-center px-4 text-left text-[16px] font-medium text-accent active:bg-panel-2">
            {allThreads ? "Mostra meno" : `Mostra tutte (${threads.length})`}
          </button>
        )}
      </SettingsSection>

      <SettingsSection title={GROUP_LABEL[main.g]}>
        {main.items.map((a) => (
          <SettingsRow key={a.id} icon={ICON[a.id]} title={a.title} subtitle={a.subtitle} href={`/consulente/analisi?a=${a.id}`} />
        ))}
        <li>
          <button
            onClick={() => setAllAnalyses(!allAnalyses)}
            aria-expanded={allAnalyses}
            aria-controls="altre-analisi"
            className="flex min-h-[48px] w-full items-center gap-1 px-4 text-left text-[16px] font-medium text-accent active:bg-panel-2"
          >
            Tutte le analisi
            <ChevronDown size={18} className={`transition-transform ${allAnalyses ? "rotate-180" : ""}`} />
          </button>
        </li>
      </SettingsSection>
      {allAnalyses && (
        <div id="altre-analisi" className="page-in">
          {others.map(({ g, items }) => (
            <SettingsSection key={g} title={GROUP_LABEL[g]}>
              {items.map((a) => (
                <SettingsRow key={a.id} icon={ICON[a.id]} title={a.title} subtitle={a.subtitle} href={`/consulente/analisi?a=${a.id}`} />
              ))}
            </SettingsSection>
          ))}
        </div>
      )}

      {reports.length > 0 && (
        <SettingsSection title="Analisi precedenti">
          {reports.slice(0, 12).map((r) => (
            <SettingsRow
              key={r.id}
              icon={ICON[r.analysis] ?? Sparkles}
              title={`${r.title}${r.subject ? ` · ${r.subject}` : ""}`}
              subtitle={
                <>
                  <span className="line-clamp-2">{r.report.summary}</span>
                  <span className="mt-0.5 block text-[12px] text-faint">{fmtWhen(Date.parse(r.date))}</span>
                </>
              }
              href={`/consulente/analisi?r=${r.id}`}
            />
          ))}
        </SettingsSection>
      )}

      <p className="px-6 pb-2 pt-8 text-center text-[12px] leading-relaxed text-mut">
        Risposte generate con intelligenza artificiale sui numeri calcolati da Basis. Possono contenere errori: non sono consulenza finanziaria ai sensi di legge.
      </p>
    </div>
  );
}
