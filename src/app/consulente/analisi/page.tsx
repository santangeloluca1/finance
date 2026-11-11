"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { reportAsMessage, ReportView } from "@/components/advisor/ReportView";
import { msgId, writeThread } from "@/lib/ai/threads";
import { useRouter } from "next/navigation";
import { Orb } from "@/components/advisor/Orb";
import { HowToActivate, NOT_ACTIVE } from "@/components/advisor/Inactive";
import { ICON } from "@/components/advisor/icons";
import { BackLink, Logo, Panel } from "@/components/ui";
import { useAdvisor, type RunResult } from "@/lib/ai/client";
import { ANALYSES, type AnalysisId } from "@/lib/ai/prompts";
import type { Instrument } from "@/lib/engine/types";
import { fmtEur, fmtWhen } from "@/lib/format";
import { deleteReport, newId, saveReport, type SavedReport } from "@/lib/store";

export default function AnalisiPage() {
  return (
    <Suspense>
      <Analisi />
    </Suspense>
  );
}

const STEPS = ["Raccolgo posizioni, zainetto e simulazioni fiscali", "Leggo profilo, obiettivi e piani di accumulo", "Basis AI sta ragionando sui numeri", "Scrivo le raccomandazioni"];

function Analisi() {
  const params = useSearchParams();
  const { run, view, ready, configured } = useAdvisor();
  const router = useRouter();
  const saved = (view.data.aiReports ?? []).find((r) => r.id === params.get("r"));
  const id = (saved?.analysis ?? params.get("a")) as AnalysisId | null;
  const meta = ANALYSES.find((a) => a.id === id);

  // Titolo: dal parametro (scheda titolo) o da scegliere.
  const isinParam = params.get("isin");
  const tParam = params.get("t");
  const paramInstrument: Pick<Instrument, "isin" | "ticker" | "currency" | "name" | "shortName"> | null = isinParam
    ? (view.data.instruments.find((i) => i.isin === isinParam) ?? (tParam ? { isin: isinParam, ticker: tParam, currency: params.get("c") ?? "EUR", name: params.get("n") ?? tParam, shortName: params.get("n") ?? tParam } : null))
    : null;
  const [instrument, setInstrument] = useState(paramInstrument);
  const [amount, setAmount] = useState<string>(params.get("amount") ?? String(view.data.plan?.monthly || 500));
  const [result, setResult] = useState<SavedReport | null>(saved ?? null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const started = useRef(false);

  const needsTitle = meta?.needsTitle && !instrument;
  const needsAmount = meta?.needsAmount && !params.get("amount");
  const [confirmed, setConfirmed] = useState(!needsTitle && !needsAmount);

  const start = async () => {
    if (!meta) return;
    setRunning(true);
    setError(null);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4500);
    let res: RunResult;
    try {
      const subject = instrument ? (instrument.shortName ?? instrument.name) : meta.needsAmount ? fmtEur(Number(amount.replace(",", ".")) || 0) : undefined;
      res = await run(meta.id, { title: subject, amount: meta.needsAmount ? Number(amount.replace(",", ".")) || undefined : undefined, instrument: instrument ?? undefined });
      if (res.status === "ok") {
        const rep: SavedReport = { id: newId(), analysis: meta.id, title: meta.title, subject, date: new Date().toISOString(), report: res.report };
        saveReport(rep);
        setResult(rep);
        history.replaceState(null, "", `/consulente/analisi?r=${rep.id}`);
      } else setError(res.status === "nokey" ? NOT_ACTIVE : res.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
      setRunning(false);
    }
  };

  // Avvio automatico quando non serve scegliere nulla.
  useEffect(() => {
    if (saved || started.current || !ready || !confirmed || configured === null) return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, confirmed, configured]);

  if (!meta) return <p className="px-4 pt-10 text-center text-mut">Analisi non trovata.</p>;
  const I = ICON[meta.id];
  const held = [...new Map(view.views.map((v) => [v.instrument.isin, v.instrument])).values()];

  return (
    <div>
      <BackLink href="/consulente" label="Basis AI" />
      <div className="px-4 pb-2 pt-1">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">{meta.title}</h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-mut">
          <I size={14} className="shrink-0" />
          {meta.subtitle}
        </p>
      </div>

      {/* Scelta del titolo o dell'importo prima di partire */}
      {!result && !confirmed && (
        <div className="page-in pt-4">
          {meta.needsTitle && (
            <>
              <p className="px-4 pb-2 text-[15px] text-mut">Su quale titolo?</p>
              <ul className="stagger">
                {held.map((i) => (
                  <li key={i.isin}>
                    <button
                      onClick={() => {
                        setInstrument(i);
                        if (!meta.needsAmount) setConfirmed(true);
                      }}
                      className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2 text-left active:bg-panel-2"
                    >
                      <Logo isin={i.isin} name={i.shortName ?? i.name} size={40} />
                      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{i.shortName ?? i.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {meta.needsTitle === "any" && <p className="px-4 pt-2 text-[13px] text-mut">Per un titolo che non hai, aprilo con la lente e tocca “Chiedi al consulente”.</p>}
            </>
          )}
          {meta.needsAmount && (
            <div className="px-4">
              <p className="pb-2 text-[15px] text-mut">Quanto vuoi investire?</p>
              <label className="flex h-14 items-center gap-2 rounded-[14px] bg-panel px-4">
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num min-w-0 flex-1 bg-transparent text-[24px] font-semibold outline-none" />
                <span className="text-[20px] text-mut">€</span>
              </label>
              <button onClick={() => setConfirmed(true)} className="press mt-4 h-[50px] w-full rounded-[16px] bg-ink text-[16px] font-semibold text-bg">
                Analizza
              </button>
            </div>
          )}
        </div>
      )}

      {/* In corso: passaggi che avanzano, con lo stesso movimento del resto dell'app */}
      {running && (
        <div className="page-in px-4 pt-8" role="status">
          <div className="flex justify-center pb-8">
            <Orb size={96} active />
          </div>
          <ul className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 text-[15px] transition-colors ${i <= step ? "text-ink" : "text-faint"}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${i < step ? "bg-up" : i === step ? "anim-breathe bg-accent" : "bg-chip"}`} />
                {s}
              </li>
            ))}
          </ul>
          <p className="pt-6 text-[13px] text-mut">Di solito ci vogliono 10-30 secondi.</p>
        </div>
      )}

      {error && !running && (
        <Panel className="mt-6 px-4 py-4">
          <p className="text-[15px] leading-snug">{error}</p>
          {error === NOT_ACTIVE ? (
            <HowToActivate className="-mb-1.5 mt-1" />
          ) : (
            <button onClick={() => void start()} className="hit relative mt-3 flex min-h-[40px] items-center gap-2 text-[15px] font-semibold text-accent">
              <RefreshCw size={16} /> Riprova
            </button>
          )}
        </Panel>
      )}

      {result && !running && (
        <>
          <ReportView
            report={result.report}
            date={`${result.subject ? `${result.subject} · ` : ""}${fmtWhen(Date.parse(result.date))}`}
            onDiscuss={() => {
              // Nuova conversazione che parte dall'analisi: si può rispondere e approfondire.
              const now = new Date().toISOString();
              const t = { id: msgId(), title: `${result.title}${result.subject ? ` · ${result.subject}` : ""}`, updatedAt: now, messages: [{ id: msgId(), role: "assistant" as const, text: reportAsMessage(result.title, result.report), at: now }] };
              writeThread(t);
              router.push(`/consulente/chat?id=${t.id}`);
            }}
          />
          <div className="flex gap-2 px-4 pt-6">
            <button
              onClick={() => {
                setResult(null);
                void start();
              }}
              className="press flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[16px] bg-chip text-[15px] font-semibold"
            >
              <RefreshCw size={16} /> Rifai l&apos;analisi
            </button>
            <button
              onClick={() => {
                deleteReport(result.id);
                history.back();
              }}
              aria-label="Elimina analisi"
              className="press flex h-[48px] w-[52px] items-center justify-center rounded-[16px] bg-chip text-dn"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
