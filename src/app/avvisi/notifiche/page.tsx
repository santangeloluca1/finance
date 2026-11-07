"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, RefreshCw, Share } from "lucide-react";
import { usePortfolioData, saveNotifySettings } from "@/lib/store";
import { BackLink, LargeTitle, Panel, SectionHeader, SelectButton, Switch } from "@/components/ui";
import { AUTO_KINDS, settingsOf, type AutoKind } from "@/lib/notify";
import { usePush } from "@/lib/push-client";
import { fmtWhen, fmtN } from "@/lib/format";

const DROP_OPTIONS = ["0.02", "0.03", "0.05", "0.07", "0.1"].map((v) => ({ value: v, label: `${fmtN(Number(v) * 100)}%` }));
const MOVE_OPTIONS = ["0.01", "0.015", "0.02", "0.03", "0.05"].map((v) => ({ value: v, label: `${fmtN((Number(v) * 100))}%` }));

interface LastRun {
  at: string;
  source: string;
  users: number;
  sent: number;
  error: string | null;
}

interface Sent {
  id: string;
  title: string;
  body: string;
  href: string;
  sentAt: string;
}

export default function NotificheSettings() {
  const data = usePortfolioData();
  const s = settingsOf(data.notify);
  const push = usePush();
  const [history, setHistory] = useState<Sent[] | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null | undefined>(undefined);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const loadHistory = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [], lastRun: null }))
      .then((j: { items: Sent[]; lastRun?: LastRun | null }) => {
        setHistory(j.items);
        setLastRun(j.lastRun ?? null);
      })
      .catch(() => setHistory([]));
  }, []);
  useEffect(loadHistory, [loadHistory]);

  const toggle = (kind: AutoKind, on: boolean) => {
    const off = new Set(s.off);
    if (on) off.delete(kind);
    else off.add(kind);
    saveNotifySettings({ off: [...off] });
  };

  const checkNow = async () => {
    setChecking(true);
    setCheckMsg(null);
    try {
      const r = await fetch("/api/notify/run", { method: "POST" }).then((x) => x.json());
      setCheckMsg(r.sent ? `Inviate ${r.sent} notifiche.` : r.skipped ? `Niente da inviare (${r.skipped}).` : "Nessun avviso nuovo da inviare.");
      loadHistory();
    } catch (e) {
      setCheckMsg(String(e));
    } finally {
      setChecking(false);
    }
  };

  const row = "flex min-h-[56px] items-center justify-between gap-3 border-b border-sep px-4 py-2 last:border-0";

  return (
    <div>
      <BackLink href="/avvisi" label="Avvisi" />
      <LargeTitle>Notifiche</LargeTitle>

      <PushPanel push={push} />

      {push.status === "on" && (
        <Panel className="mt-3">
          <button onClick={checkNow} disabled={checking} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] font-medium text-accent active:bg-panel-2 disabled:opacity-50">
            <RefreshCw size={19} className={checking ? "animate-spin" : ""} /> Controlla gli avvisi adesso
          </button>
        </Panel>
      )}
      {push.error && <p className="px-8 pt-2 text-[13px] leading-snug text-warn">{push.error}</p>}
      {!push.error && (push.notice || checkMsg) && <p className="px-8 pt-2 text-[13px] leading-snug text-mut">{push.notice ?? checkMsg}</p>}
      {push.status === "on" && lastRun !== undefined && (
        <p className="px-8 pt-2 text-[13px] leading-snug text-mut">
          {lastRun ? (
            <>
              Ultimo controllo automatico {fmtWhen(Date.parse(lastRun.at))}
              {lastRun.error ? <span className="text-warn"> · errore: {lastRun.error}</span> : lastRun.sent ? ` · inviate ${lastRun.sent}` : " · niente di nuovo"}. I controlli girano ogni 15 minuti nei giorni feriali, dalle 8 alle 22.
            </>
          ) : (
            "Nessun controllo automatico registrato finora: il primo arriva entro 15 minuti nei giorni feriali."
          )}
        </p>
      )}

      <SectionHeader>Avvisi automatici</SectionHeader>
      <Panel>
        {AUTO_KINDS.map((k) => {
          const on = !s.off.includes(k.kind);
          return (
            <div key={k.kind} className={row}>
              <div className="min-w-0 flex-1 py-1">
                <p className="text-[16px]">{k.label}</p>
                <p className="text-[13px] leading-snug text-mut">{k.hint}</p>
                {on && k.kind === "calo" && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mut">
                    Soglia
                    <SelectButton label="Soglia di calo" value={String(s.dropThreshold)} onChange={(v) => saveNotifySettings({ dropThreshold: Number(v) })} options={withCurrent(DROP_OPTIONS, s.dropThreshold)} />
                  </span>
                )}
                {on && k.kind === "portafoglio" && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mut">
                    Soglia
                    <SelectButton label="Soglia del portafoglio" value={String(s.moveThreshold)} onChange={(v) => saveNotifySettings({ moveThreshold: Number(v) })} options={withCurrent(MOVE_OPTIONS, s.moveThreshold)} />
                  </span>
                )}
              </div>
              <Switch checked={on} onChange={(v) => toggle(k.kind, v)} label={k.label} />
            </div>
          );
        })}
      </Panel>
      <p className="px-8 pt-2 text-[13px] leading-snug text-mut">
        Gli interruttori decidono cosa arriva come notifica; nella pagina Avvisi trovi sempre tutto. Le tue regole si gestiscono da{" "}
        <Link href="/avvisi" className="font-medium text-accent">
          Avvisi
        </Link>
        .
      </p>

      <SectionHeader>Quando</SectionHeader>
      <Panel>
        <div className={row}>
          <div className="min-w-0 flex-1 py-1">
            <p className="text-[16px]">Riepilogo della giornata</p>
            <p className="text-[13px] leading-snug text-mut">Nei giorni feriali dopo la chiusura delle borse: variazione, titolo migliore e peggiore</p>
          </div>
          <Switch checked={s.summary} onChange={(v) => saveNotifySettings({ summary: v })} label="Riepilogo della giornata" />
        </div>
        <div className={row}>
          <div className="min-w-0 flex-1 py-1">
            <p className="text-[16px]">Non disturbare di notte</p>
            <p className="text-[13px] leading-snug text-mut">Dalle 22 alle 8 non arriva nulla: gli avvisi partono la mattina</p>
          </div>
          <Switch checked={s.quiet} onChange={(v) => saveNotifySettings({ quiet: v })} label="Non disturbare di notte" />
        </div>
      </Panel>

      <SectionHeader>Inviate di recente</SectionHeader>
      {history === null ? (
        <p className="px-4 text-[15px] text-mut">Caricamento…</p>
      ) : history.length === 0 ? (
        <p className="px-4 text-[15px] leading-snug text-mut">Nessuna notifica inviata finora.</p>
      ) : (
        <ul>
          {history.map((h) => (
            <li key={h.id}>
              <Link href={h.href} className="block px-4 py-2.5 active:bg-panel-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-[16px] font-semibold">{h.title}</p>
                  <p className="num shrink-0 text-[13px] text-mut">{fmtWhen(Date.parse(h.sentAt))}</p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-mut">{h.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Se la soglia salvata non è tra le opzioni, la si aggiunge. */
function withCurrent(opts: { value: string; label: string }[], current: number) {
  const v = String(current);
  return opts.some((o) => o.value === v) ? opts : [...opts, { value: v, label: `${fmtN((current * 100))}%` }];
}

function PushPanel({ push }: { push: ReturnType<typeof usePush> }) {
  const { status, busy, enable, disable } = push;
  if (status === null) return <Panel className="h-[76px]">{null}</Panel>;

  if (status === "needs-install") {
    return (
      <Panel className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-[16px] font-semibold">
          <BellRing size={19} className="text-accent" /> Aggiungi Basis alla schermata Home
        </p>
        <p className="mt-1 text-[14px] leading-snug text-mut">
          Su iPhone le notifiche funzionano solo dalla web app: in Safari tocca <Share size={14} className="inline -translate-y-px" /> Condividi →{" "}
          <span className="font-medium text-ink-2">Aggiungi alla schermata Home</span>, poi apri Basis da lì e torna qui.
        </p>
      </Panel>
    );
  }
  if (status === "unsupported") {
    return (
      <Panel className="px-4 py-3.5">
        <p className="text-[16px] font-semibold">Notifiche non supportate</p>
        <p className="mt-1 text-[14px] leading-snug text-mut">Questo browser non riceve notifiche push. Su iPhone serve iOS 16.4 o successivo.</p>
      </Panel>
    );
  }
  if (status === "denied") {
    return (
      <Panel className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-[16px] font-semibold">
          <BellOff size={19} className="text-warn" /> Notifiche bloccate
        </p>
        <p className="mt-1 text-[14px] leading-snug text-mut">Le hai negate in precedenza. Riattivale da Impostazioni → Notifiche → Basis, poi torna qui.</p>
      </Panel>
    );
  }
  const on = status === "on";
  return (
    <Panel>
      <div className="flex min-h-[76px] items-center gap-3 px-4 py-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${on ? "bg-up/15 text-up" : "bg-chip text-mut"}`}>
          {on ? <BellRing size={19} /> : <BellOff size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">Notifiche push</p>
          <p className="text-[13px] leading-snug text-mut">{on ? "Attive su questo dispositivo, anche ad app chiusa" : "Spente su questo dispositivo"}</p>
        </div>
        <Switch checked={on} disabled={busy} onChange={(v) => void (v ? enable() : disable())} label="Notifiche push" />
      </div>
    </Panel>
  );
}
