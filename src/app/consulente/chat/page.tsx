"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Markdown } from "@/components/advisor/Markdown";
import { Orb } from "@/components/advisor/Orb";
import { BackLink } from "@/components/ui";
import { useAdvisor } from "@/lib/ai/client";
import type { ChatTurn } from "@/lib/ai/provider";

const KEY = "portafoglio:chat:v1";

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

/** Chat libera col consulente; la conversazione resta su questo dispositivo. */
function Chat() {
  const params = useSearchParams();
  const { chat, ready } = useAdvisor();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    try {
      setTurns(JSON.parse(sessionStorage.getItem(KEY) ?? "[]"));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(turns));
    } catch {}
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    const next: ChatTurn[] = [...turns, { role: "user", text: q.trim() }];
    setTurns(next);
    setText("");
    setBusy(true);
    setError(null);
    try {
      const r = await chat(next);
      if (r.status === "ok") setTurns([...next, { role: "assistant", text: r.answer }]);
      else setError(r.status === "nokey" ? "Il consulente non è ancora attivo: manca la chiave GEMINI_API_KEY su Vercel." : r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Domanda arrivata dalla pagina del consulente.
  useEffect(() => {
    const q = params.get("q");
    if (!q || asked.current || !ready) return;
    asked.current = true;
    history.replaceState(null, "", "/consulente/chat");
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="pb-[150px]">
      <div className="flex items-center justify-between pr-4">
        <BackLink href="/consulente" label="Consulente" />
        {turns.length > 0 && (
          <button onClick={() => setTurns([])} className="flex min-h-[44px] items-center gap-1.5 text-[15px] font-medium text-accent">
            <RotateCcw size={16} /> Nuova
          </button>
        )}
      </div>
      <h1 className="px-4 pt-1 text-[26px] font-bold tracking-[-0.03em]">Chiedi a Basis</h1>

      {turns.length === 0 && !busy && (
        <div className="flex flex-col items-center px-6 pt-10 text-center">
          <Orb size={88} />
          <p className="mt-5 text-[15px] leading-snug text-mut">Fai una domanda sul tuo portafoglio: vedo posizioni, zainetto, rendimenti, cedole, obiettivi e il tuo profilo.</p>
        </div>
      )}

      <div className="space-y-4 px-4 pt-5">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="page-in flex justify-end">
              <p className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[16px] leading-snug text-bg">{t.text}</p>
            </div>
          ) : (
            <div key={i} className="page-in flex gap-2.5">
              <Orb size={26} className="mt-1" />
              <Markdown text={t.text} className="min-w-0 flex-1 text-[16px] leading-relaxed text-ink-2" />
            </div>
          ),
        )}
        {busy && (
          <div className="flex gap-2.5" role="status" aria-label="Il consulente sta scrivendo">
            <Orb size={26} active className="mt-1" />
            <span className="flex items-center gap-1 pt-2">
              {[0, 1, 2].map((d) => (
                <span key={d} className="anim-breathe h-2 w-2 rounded-full bg-mut" style={{ animationDelay: `${d * 200}ms` }} />
              ))}
            </span>
          </div>
        )}
        {error && <p className="rounded-[14px] bg-panel px-4 py-3 text-[14px] text-ink-2">{error}</p>}
        <div ref={end} />
      </div>

      {/* Campo di scrittura, sopra la barra in basso */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="fixed inset-x-0 z-30 mx-auto flex max-w-xl items-center gap-2 bg-bg/90 px-4 py-2 backdrop-blur-xl"
        style={{ bottom: "calc(max(env(safe-area-inset-bottom), 6px) + 58px)" }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrivi una domanda"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 rounded-full bg-chip px-4 text-[16px] outline-none placeholder:text-faint"
        />
        <button type="submit" aria-label="Invia" disabled={!text.trim() || busy} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-bg disabled:opacity-30">
          <ArrowUp size={19} strokeWidth={2.6} />
        </button>
      </form>
    </div>
  );
}
