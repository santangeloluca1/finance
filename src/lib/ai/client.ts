"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { isFundLike } from "../engine/tax";
import type { Instrument } from "../engine/types";
import { dividendInfo, priceStats } from "../insights";
import { useCompositions } from "../xray-client";
import { buildContext } from "./context";
import type { AnalysisId, Report } from "./prompts";
import type { ChatTurn } from "./provider";

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/** Nome dell'utente salvato sul telefono: resta qui, il modello vede solo {nome}. */
export function firstName(): string {
  try {
    const u = JSON.parse(localStorage.getItem("portafoglio:user:v1") ?? "null") as { name?: string; email?: string } | null;
    return (u?.name || "").split(" ")[0];
  } catch {
    return "";
  }
}

export function personalize(text: string, name = firstName()) {
  return name ? text.replaceAll("{nome}", name) : text.replace(/\{nome\}[,!]?\s*/g, "");
}

export function personalizeReport(r: Report): Report {
  const p = (s: string) => personalize(s);
  return {
    summary: p(r.summary),
    actions: r.actions.map((a) => ({ ...a, title: p(a.title), detail: p(a.detail), impact: a.impact ? p(a.impact) : a.impact })),
    sections: r.sections.map((s) => ({ title: p(s.title), text: p(s.text) })),
    risks: r.risks.map(p),
    dataUsed: r.dataUsed,
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Scheda di un titolo per l'analisi: andamento, dividendi, analisti, notizie. */
async function titleFocus(ins: Pick<Instrument, "isin" | "ticker" | "currency" | "name" | "shortName">, price: number | null) {
  const hasIsin = ISIN_RE.test(ins.isin);
  const key = ins.currency === "EUR" && hasIsin ? `${ins.ticker}~${ins.isin}` : ins.ticker;
  const q = new URLSearchParams({ t: ins.ticker, n: ins.shortName ?? ins.name, ...(hasIsin ? { isin: ins.isin } : {}) });
  const from = new Date(Date.now() - 10 * 366 * 86400_000).toISOString().slice(0, 10);
  const [hist, insights, analysts] = await Promise.all([
    getJson<{ series: Record<string, [string, number][]> }>(`/api/history?from=${from}&t=${encodeURIComponent(key)}`),
    getJson<{ currency: string; dividends: [string, number][]; news: { title: string; publisher: string; time: number }[] }>(`/api/insights?${q}`),
    getJson<{ status: string; data?: unknown }>(`/api/analysts?${q}`),
  ]);
  const series = hist?.series?.[ins.ticker] ?? [];
  const last = price ?? series.at(-1)?.[1] ?? null;
  const stats = series.length ? priceStats(series, last) : null;
  const div = insights ? dividendInfo(insights.dividends, last) : null;
  return {
    instrument: { name: ins.shortName ?? ins.name, fullName: ins.name, isin: hasIsin ? ins.isin : null, ticker: ins.ticker, currency: ins.currency },
    price: last,
    priceStats: stats,
    dividends: div ? { ...div, currency: insights?.currency } : null,
    analysts: analysts?.status === "ok" ? analysts.data : null,
    news: (insights?.news ?? []).slice(0, 6).map((n) => ({ title: n.title, publisher: n.publisher, date: new Date(n.time).toISOString().slice(0, 10) })),
  };
}

export type RunResult = { status: "ok"; report: Report } | { status: "nokey" } | { status: "error"; message: string };

/** Consulente: prepara i dati e chiama le analisi o la chat. */
export function useAdvisor() {
  const view = usePortfolioView();
  const fundIsins = useMemo(() => view.views.filter((v) => isFundLike(v.instrument)).map((v) => v.instrument.isin), [view.views]);
  const { compositions } = useCompositions(fundIsins);
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((j: { configured: boolean }) => setConfigured(j.configured))
      .catch(() => setConfigured(false));
  }, []);

  const ready = !!view.state && !!view.totals;

  const context = useCallback(
    async (focusIns?: Pick<Instrument, "isin" | "ticker" | "currency" | "name" | "shortName"> | null) => {
      if (!view.state || !view.totals) throw new Error("Portafoglio non ancora pronto");
      const price = focusIns ? (view.quotes[focusIns.ticker]?.price ?? null) : null;
      const focus = focusIns ? await titleFocus(focusIns, price) : undefined;
      const prev = (view.data.aiReports ?? []).find((r) => r.analysis === "checkup");
      return buildContext({
        data: view.data,
        state: view.state,
        views: view.views,
        totals: view.totals,
        history: view.history,
        compositions,
        focus,
        previous: prev ? { date: prev.date.slice(0, 10), summary: prev.report.summary } : null,
      });
    },
    [view, compositions],
  );

  const run = useCallback(
    async (id: AnalysisId, extra: { title?: string; amount?: number; instrument?: Pick<Instrument, "isin" | "ticker" | "currency" | "name" | "shortName"> }): Promise<RunResult> => {
      const ctx = await context(extra.instrument ?? null);
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "analysis", id, extra: { title: extra.title, amount: extra.amount }, context: ctx, profile: view.data.profile }),
      });
      const j = await res.json().catch(() => ({ status: "error", message: `HTTP ${res.status}` }));
      if (j.status === "ok") return { status: "ok", report: personalizeReport(j.report) };
      return j.status === "nokey" ? { status: "nokey" } : { status: "error", message: j.message ?? `HTTP ${res.status}` };
    },
    [context, view.data.profile],
  );

  const chat = useCallback(
    async (messages: ChatTurn[]): Promise<{ status: "ok"; answer: string } | { status: "nokey" } | { status: "error"; message: string }> => {
      const ctx = await context(null);
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "chat", messages, context: ctx, profile: view.data.profile }),
      });
      const j = await res.json().catch(() => ({ status: "error", message: `HTTP ${res.status}` }));
      if (j.status === "ok") return { status: "ok", answer: personalize(j.answer) };
      return j.status === "nokey" ? { status: "nokey" } : { status: "error", message: j.message ?? `HTTP ${res.status}` };
    },
    [context, view.data.profile],
  );

  /** Chat con risposta a pezzi: onText riceve il testo accumulato finora. */
  const stream = useCallback(
    async (messages: ChatTurn[], onText: (text: string) => void): Promise<{ status: "ok"; text: string } | { status: "nokey" } | { status: "error"; message: string }> => {
      const ctx = await context(null);
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, context: ctx, profile: view.data.profile }),
      });
      if (res.status === 412) return { status: "nokey" };
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        return { status: "error", message: j?.message ?? `HTTP ${res.status}` };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        onText(personalize(text));
      }
      return { status: "ok", text: personalize(text) };
    },
    [context, view.data.profile],
  );

  return { ready, configured, run, chat, stream, view };
}
