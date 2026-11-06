"use client";

import Link from "next/link";
import { ArrowUp, ChevronRight, KeyRound, Sparkles, UserRound } from "lucide-react";
import { ICON } from "@/components/advisor/icons";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink, LargeTitle, Panel, SectionHeader } from "@/components/ui";
import { ANALYSES, GROUP_LABEL, type AnalysisMeta } from "@/lib/ai/prompts";
import { useAdvisor } from "@/lib/ai/client";
import { fmtWhen } from "@/lib/format";


const SUGGESTIONS = ["Il mio portafoglio è troppo rischioso per me?", "Conviene recuperare le minus quest'anno?", "Quanto incasserò di cedole il prossimo anno?"];

export default function Consulente() {
  const { configured, view } = useAdvisor();
  const router = useRouter();
  const [q, setQ] = useState("");
  const profile = view.data.profile;
  const reports = view.data.aiReports ?? [];
  const groups = (Object.keys(GROUP_LABEL) as AnalysisMeta["group"][]).map((g) => ({ g, items: ANALYSES.filter((a) => a.group === g) }));

  const ask = (text: string) => {
    if (!text.trim()) return;
    router.push(`/consulente/chat?q=${encodeURIComponent(text.trim())}`);
  };

  return (
    <div>
      <BackLink href="/analisi" label="Analisi" />
      <LargeTitle>Consulente</LargeTitle>
      <p className="-mt-1 px-4 text-[15px] leading-snug text-mut">Analisi con intelligenza artificiale sui numeri del tuo portafoglio. Ti vede come {"“"}investitore{"”"}: nome ed email non vengono inviati.</p>

      {configured === false && (
        <Panel className="mt-5 px-4 py-4">
          <p className="flex items-center gap-2 text-[16px] font-semibold">
            <KeyRound size={18} className="text-accent" /> Manca la chiave
          </p>
          <p className="mt-1.5 text-[14px] leading-snug text-mut">Il consulente si attiva aggiungendo GEMINI_API_KEY nelle impostazioni del progetto su Vercel. Intanto puoi compilare il profilo.</p>
        </Panel>
      )}

      {/* Profilo */}
      <Link href="/consulente/profilo" className={`mx-4 mt-5 flex min-h-[72px] items-center gap-3.5 rounded-[18px] px-4 py-3 active:opacity-80 ${profile ? "bg-panel" : "bg-accent text-accent-ink"}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${profile ? "bg-chip text-ink-2" : "bg-white/20"}`}>
          <UserRound size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">{profile ? "Il tuo profilo di investitore" : "Completa il tuo profilo"}</span>
          <span className={`block text-[13px] leading-snug ${profile ? "text-mut" : "opacity-85"}`}>
            {profile ? `Aggiornato ${profile.updatedAt ? fmtWhen(Date.parse(profile.updatedAt)) : ""}: rendilo sempre attuale` : "6 domande, un minuto: senza profilo i consigli sono generici"}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 opacity-70" />
      </Link>

      {/* Chiedi */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="mx-4 mt-4 flex h-12 items-center gap-2 rounded-[14px] bg-chip pl-4 pr-1.5"
      >
        <Sparkles size={18} className="shrink-0 text-accent" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chiedi qualcosa sul tuo portafoglio" enterKeyHint="send" className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
        <button type="submit" aria-label="Chiedi" disabled={!q.trim()} className="press flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bg disabled:opacity-30">
          <ArrowUp size={18} strokeWidth={2.6} />
        </button>
      </form>
      <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto px-4">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} className="press shrink-0 rounded-full border border-sep px-3 py-1.5 text-[13px] text-ink-2">
            {s}
          </button>
        ))}
      </div>

      {groups.map(({ g, items }) => (
        <section key={g}>
          <SectionHeader>{GROUP_LABEL[g]}</SectionHeader>
          {g === "principali" ? (
            <div className="stagger grid grid-cols-2 gap-2.5 px-4">
              {items.map((a) => {
                const I = ICON[a.id];
                return (
                  <Link key={a.id} href={`/consulente/analisi?a=${a.id}`} className="press flex min-h-[132px] flex-col rounded-[18px] bg-panel p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-accent">
                      <I size={18} />
                    </span>
                    <span className="mt-auto pt-3 text-[16px] font-semibold leading-tight">{a.title}</span>
                    <span className="mt-1 text-[12px] leading-snug text-mut">{a.subtitle}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <ul className="stagger">
              {items.map((a) => {
                const I = ICON[a.id];
                return (
                  <li key={a.id}>
                    <Link href={`/consulente/analisi?a=${a.id}`} className="flex min-h-[64px] items-center gap-4 px-4 py-2.5 active:bg-panel-2">
                      <I size={22} strokeWidth={1.7} className="shrink-0 text-ink" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px]">{a.title}</p>
                        <p className="text-[13px] leading-snug text-mut">{a.subtitle}</p>
                      </div>
                      <ChevronRight size={18} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {reports.length > 0 && (
        <>
          <SectionHeader>Analisi precedenti</SectionHeader>
          <ul className="stagger">
            {reports.slice(0, 12).map((r) => {
              const I = ICON[r.analysis] ?? Sparkles;
              return (
                <li key={r.id}>
                  <Link href={`/consulente/analisi?r=${r.id}`} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-ink-2">
                      <I size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold">
                        {r.title}
                        {r.subject ? ` · ${r.subject}` : ""}
                      </p>
                      <p className="truncate text-[13px] text-mut">{r.report.summary}</p>
                    </div>
                    <span className="num shrink-0 text-[12px] text-mut">{fmtWhen(Date.parse(r.date)).replace(/ alle .*/, "")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
