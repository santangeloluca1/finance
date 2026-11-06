"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Check, ChevronLeft, Copy, CornerUpLeft, RotateCw, SquarePen, X } from "lucide-react";
import { Markdown } from "@/components/advisor/Markdown";
import { ASSISTANT, Orb } from "@/components/advisor/Orb";
import { useAdvisor } from "@/lib/ai/client";
import { msgId, readThreads, splitFollowUps, toModelText, writeThread, type ChatMessage, type Thread } from "@/lib/ai/threads";

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

const STARTERS = ["Il mio portafoglio è troppo rischioso per me?", "Conviene recuperare le minus quest'anno?", "Cosa compro con i prossimi 1.000 €?", "Quanto incasserò di cedole il prossimo anno?"];

/** Conversazione con Minerva: risposte che si scrivono, citazioni, domande di seguito. */
function Chat() {
  const params = useSearchParams();
  const router = useRouter();
  const { stream, ready, configured } = useAdvisor();
  const [thread, setThread] = useState<Thread>(() => ({ id: msgId(), title: "Nuova conversazione", updatedAt: new Date().toISOString(), messages: [] }));
  const [text, setText] = useState("");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);
  const busy = live !== null;

  // Conversazione esistente (?id=) o nuova.
  useEffect(() => {
    const id = params.get("id");
    const found = id ? readThreads().find((t) => t.id === id) : null;
    if (found) setThread(found);
  }, [params]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.messages.length, live, error]);

  // Campo che cresce con il testo (fino a 5 righe).
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  const send = async (raw: string, quoting: ChatMessage | null = reply) => {
    const q = raw.trim();
    if (!q || busy) return;
    const userMsg: ChatMessage = {
      id: msgId(),
      role: "user",
      text: q,
      at: new Date().toISOString(),
      ...(quoting ? { replyTo: { id: quoting.id, excerpt: excerpt(quoting.text) } } : {}),
    };
    const base: Thread = {
      ...thread,
      title: thread.messages.length ? thread.title : q.slice(0, 60),
      updatedAt: new Date().toISOString(),
      messages: [...thread.messages, userMsg],
    };
    setThread(base);
    writeThread(base);
    history.replaceState(null, "", `/consulente/chat?id=${base.id}`);
    setText("");
    setReply(null);
    await answer(base);
  };

  /** Fa rispondere Minerva all'ultima domanda della conversazione (anche per riprovare). */
  const answer = async (base: Thread) => {
    setError(null);
    setLive("");
    try {
      const turns = base.messages.map((m) => ({ role: m.role, text: m.role === "user" ? toModelText(m) : m.text }));
      const r = await stream(turns, (t) => setLive(splitFollowUps(t).text.replace(/§+\s*$/, "")));
      if (r.status === "ok") {
        const { text: answer, followUps } = splitFollowUps(r.text);
        const done: Thread = { ...base, updatedAt: new Date().toISOString(), messages: [...base.messages, { id: msgId(), role: "assistant", text: answer, followUps, at: new Date().toISOString() }] };
        setThread(done);
        writeThread(done);
      } else setError(r.status === "nokey" ? `${ASSISTANT} non è ancora attiva: manca la chiave GEMINI_API_KEY su Vercel.` : r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLive(null);
    }
  };

  // Domanda arrivata da un'altra pagina (?q=).
  useEffect(() => {
    const q = params.get("q");
    if (!q || asked.current || !ready) return;
    asked.current = true;
    void send(q, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const lastAssistant = [...thread.messages].reverse().find((m) => m.role === "assistant");
  const empty = thread.messages.length === 0 && !busy;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Intestazione fissa: Minerva e il suo stato */}
      <header className="sticky top-0 z-30 -mt-[calc(env(safe-area-inset-top)+28px)] flex items-center gap-2 border-b border-sep bg-bg/85 px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl">
        <button onClick={() => router.push("/consulente")} aria-label="Torna al consulente" className="flex h-10 w-10 items-center justify-center text-accent active:opacity-50">
          <ChevronLeft size={26} strokeWidth={2.2} />
        </button>
        <Orb size={36} active={busy} />
        <div className="min-w-0 flex-1 pl-1">
          <p className="text-[17px] font-semibold leading-tight">{ASSISTANT}</p>
          <p className={`text-[12px] leading-tight ${busy ? "text-accent" : "text-mut"}`}>{busy ? "sta scrivendo…" : configured === false ? "non ancora attiva" : "la tua consulente finanziaria"}</p>
        </div>
        <button
          onClick={() => {
            setThread({ id: msgId(), title: "Nuova conversazione", updatedAt: new Date().toISOString(), messages: [] });
            setReply(null);
            setError(null);
            history.replaceState(null, "", "/consulente/chat");
          }}
          aria-label="Nuova conversazione"
          className="flex h-10 w-10 items-center justify-center text-accent active:opacity-50"
        >
          <SquarePen size={21} />
        </button>
      </header>

      <div className="flex-1 px-4 pb-4 pt-4">
        {empty && (
          <div className="page-in flex flex-col items-center px-4 pt-10 text-center">
            <Orb size={104} />
            <p className="mt-8 text-[22px] font-bold tracking-[-0.025em]">Ciao, sono {ASSISTANT}</p>
            <p className="mt-1.5 text-[15px] leading-snug text-mut">Conosco il tuo portafoglio, lo zainetto, gli obiettivi e il tuo profilo. Chiedimi qualsiasi cosa: possiamo approfondire insieme.</p>
            <div className="mt-6 w-full space-y-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => void send(s, null)} className="press w-full rounded-[14px] border border-sep px-4 py-3 text-left text-[15px] text-ink-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {thread.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="page-in flex flex-col items-end">
                {m.replyTo && (
                  <p className="mb-1 max-w-[80%] truncate border-r-2 border-accent pr-2 text-right text-[13px] text-mut">{m.replyTo.excerpt}</p>
                )}
                <p className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[16px] leading-snug text-bg">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="page-in flex gap-2.5">
                <Orb size={28} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="rounded-[20px] rounded-tl-[6px] bg-panel px-4 py-3">
                    <Markdown text={m.text} className="text-[16px] leading-relaxed text-ink-2" />
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => (setReply(m), input.current?.focus())} className="flex min-h-[36px] items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-mut active:bg-panel-2">
                      <CornerUpLeft size={14} /> Rispondi
                    </button>
                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(m.text);
                        setCopied(m.id);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                      className="flex min-h-[36px] items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-mut active:bg-panel-2"
                    >
                      {copied === m.id ? <Check size={14} /> : <Copy size={14} />} {copied === m.id ? "Copiato" : "Copia"}
                    </button>
                  </div>
                  {/* Domande di seguito, solo sotto l'ultima risposta */}
                  {m === lastAssistant && !busy && m.followUps && m.followUps.length > 0 && (
                    <div className="stagger mt-2 flex flex-col items-start gap-1.5">
                      {m.followUps.map((f) => (
                        <button key={f} onClick={() => void send(f, null)} className="press rounded-full border border-accent/30 bg-accent/8 px-3.5 py-1.5 text-left text-[14px] text-accent">
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="flex gap-2.5" role="status" aria-label={`${ASSISTANT} sta scrivendo`}>
              <Orb size={28} active className="mt-0.5" />
              <div className="min-w-0 flex-1 rounded-[20px] rounded-tl-[6px] bg-panel px-4 py-3">
                {live ? (
                  <Markdown text={live} className="text-[16px] leading-relaxed text-ink-2" />
                ) : (
                  <span className="flex items-center gap-1 py-1.5">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="anim-breathe h-2 w-2 rounded-full bg-mut" style={{ animationDelay: `${d * 200}ms` }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}
          {error && !busy && (
            <div className="page-in flex gap-2.5">
              <Orb size={28} className="mt-0.5 opacity-60" />
              <div className="min-w-0 flex-1 rounded-[20px] rounded-tl-[6px] bg-panel px-4 py-3">
                <p className="text-[15px] leading-snug text-ink-2">{error}</p>
                {thread.messages.at(-1)?.role === "user" && (
                  <button onClick={() => void answer(thread)} className="press mt-2.5 flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-semibold text-bg">
                    <RotateCw size={15} /> Riprova
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div ref={end} className="h-2" />
      </div>

      {/* Scrittura: citazione (se rispondi a un messaggio) e campo che cresce */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="sticky bottom-0 z-30 border-t border-sep bg-bg/90 px-3 pt-2 backdrop-blur-xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
      >
        {reply && (
          <div className="page-in mb-2 flex items-center gap-2 rounded-[12px] bg-panel py-2 pl-3 pr-1">
            <CornerUpLeft size={15} className="shrink-0 text-accent" />
            <p className="min-w-0 flex-1 truncate text-[13px] text-mut">
              <span className="font-semibold text-ink-2">{ASSISTANT}: </span>
              {excerpt(reply.text)}
            </p>
            <button type="button" onClick={() => setReply(null)} aria-label="Annulla citazione" className="flex h-8 w-8 items-center justify-center text-mut">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder={reply ? "Rispondi a Minerva" : `Scrivi a ${ASSISTANT}`}
            className="max-h-[132px] min-h-[44px] min-w-0 flex-1 resize-none rounded-[22px] bg-chip px-4 py-[11px] text-[16px] leading-[22px] outline-none placeholder:text-faint"
          />
          <button type="submit" aria-label="Invia" disabled={!text.trim() || busy} className="press mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-opacity disabled:opacity-25">
            <ArrowUp size={19} strokeWidth={2.6} />
          </button>
        </div>
      </form>
    </div>
  );
}

/** Estratto breve di un messaggio, senza formattazione. */
function excerpt(t: string) {
  const s = t.replace(/\*\*/g, "").replace(/^[-*•]\s+/gm, "").replace(/\s+/g, " ").trim();
  return s.length > 110 ? `${s.slice(0, 110)}…` : s;
}
