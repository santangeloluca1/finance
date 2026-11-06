"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronRight, Database, Eye, Info, LogOut, Palette, Repeat, Target, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { Avatar, SettingsRow, SettingsSection, useAccount } from "@/components/settings";
import { BackLink, LargeTitle, Switch } from "@/components/ui";
import { fmtSignedEur, fmtSignedPct } from "@/lib/format";
import { monthlyReturns, twrSeries } from "@/lib/performance";
import { usePrivacy } from "@/lib/privacy";
import { usePush } from "@/lib/push-client";
import { clearLocalData } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useTheme } from "@/lib/theme";

const THEME_LABEL = { auto: "Automatico, come l'iPhone", light: "Chiaro", dark: "Scuro" } as const;
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export default function Impostazioni() {
  const user = useAccount();
  const [theme] = useTheme();
  const [privacy, togglePrivacy] = usePrivacy();
  const push = usePush();
  const sync = useSyncStatus();
  const { data } = usePortfolioView();

  return (
    <div>
      <BackLink href="/" label="Home" />
      <LargeTitle>Impostazioni</LargeTitle>

      <MonthRecap />

      {/* Profilo: sempre presente; nome salvato sul telefono o scheletro finché arriva la sessione. */}
      {user !== false && (
        <Link href="/impostazioni/account" className="mt-2 flex min-h-[76px] items-center gap-4 px-4 py-3 active:bg-panel-2">
          {user ? (
            <>
              <Avatar name={user.name || user.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[19px] font-medium">{user.name || user.email}</p>
                <p className="truncate text-[15px] text-mut">Visualizza profilo</p>
              </div>
            </>
          ) : (
            <>
              <span className="skeleton h-[52px] w-[52px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <span className="skeleton h-4 w-28" />
                <span className="skeleton h-3.5 w-36" />
              </div>
            </>
          )}
          <ChevronRight size={20} strokeWidth={1.8} className="shrink-0 text-ink-2" />
        </Link>
      )}

      <SettingsSection title="Portafoglio">
        <SettingsRow
          icon={Database}
          title="Dati e backup"
          subtitle={data.isDemo ? "Stai vedendo l'esempio · importa i tuoi movimenti" : sync.state === "ok" ? "Sincronizzati con il tuo account" : "Esporta, importa e sincronizzazione"}
          href="/impostazioni/dati"
        />
        <SettingsRow icon={Repeat} title="Operazioni ricorrenti" subtitle="Stipendio, bonifici e PAC" href="/ricorrenti" />
        <SettingsRow icon={Target} title="Obiettivi e pianificazione" subtitle="Traguardi, ribilanciamento e proiezioni" href="/#obiettivi" />
      </SettingsSection>

      <SettingsSection title="App">
        <SettingsRow
          icon={Bell}
          title="Notifiche"
          subtitle={push.status === "on" ? "Push attive su questo dispositivo" : "Notifiche push, avvisi automatici e regole"}
          href="/avvisi/notifiche"
        />
        <SettingsRow icon={Palette} title="Aspetto" subtitle={THEME_LABEL[theme]} href="/impostazioni/aspetto" />
        <SettingsRow
          icon={Eye}
          title="Nascondi gli importi"
          subtitle="Per guardare l'app in pubblico; anche dall'occhio in alto"
          right={<Switch checked={privacy} onChange={togglePrivacy} label="Nascondi gli importi" />}
        />
        <SettingsRow icon={Info} title="Informazioni" subtitle="Fonti dei dati, calcoli e versione" href="/impostazioni/info" />
      </SettingsSection>

      {user && (
        <ul className="pt-6">
          <SettingsRow
            icon={LogOut}
            title="Esci"
            danger
            onClick={async () => {
              await authClient.signOut();
              clearLocalData();
              window.location.replace("/accedi");
            }}
          />
        </ul>
      )}
    </div>
  );
}

/**
 * Riquadro in cima (come il "rewind" di getquin): com'è andato il mese appena
 * chiuso. Si chiude con la X e ricompare il mese dopo.
 */
function MonthRecap() {
  const { history, totals, state } = usePortfolioView();
  const [hidden, setHidden] = useState(true);
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;
  const storeKey = `portafoglio:recap:${key}`;
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storeKey) === "off");
    } catch {
      setHidden(false);
    }
  }, [storeKey]);

  const recap = useMemo(() => {
    if (!history?.length || !totals || !state) return null;
    const inMonth = history.filter((h) => h.date.startsWith(key));
    const before = history.filter((h) => h.date < `${key}-01`).at(-1);
    if (!inMonth.length || !before) return null;
    const ret = monthlyReturns(twrSeries(history.map((h) => ({ ...h, value: h.value - (h.cash ?? 0) }))))[key];
    if (ret === undefined) return null;
    return { ret, gain: inMonth[inMonth.length - 1].gain - before.gain };
  }, [history, totals, state, key]);

  if (hidden || !recap) return null;
  const up = recap.ret >= 0;
  return (
    <div className="relative mx-4 mb-2 overflow-hidden rounded-[18px] bg-panel">
      <Link href="/analisi" className="flex min-h-[104px] items-center gap-4 px-5 py-4 pr-24 active:opacity-80">
        <div className="min-w-0">
          <p className="text-[17px] font-bold">{MONTHS[last.getMonth()].replace(/^./, (c) => c.toUpperCase())} in breve</p>
          <p className="mt-1 text-[15px] leading-snug text-mut">
            Il portafoglio ha fatto <span className={`num sensitive font-semibold ${up ? "text-up" : "text-dn"}`}>{fmtSignedPct(recap.ret)}</span>,{" "}
            <span className="num sensitive">{fmtSignedEur(recap.gain)}</span>. Vedi i dettagli in Analisi.
          </p>
        </div>
      </Link>
      {/* Decorazione: tre barre e la linea del logo, in grande e tagliate dal bordo. */}
      <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -bottom-3 -right-2 h-[96px] w-[96px]">
        <rect x="14" y="52" width="18" height="48" rx="5" fill="var(--chip)" className="grow-y" />
        <rect x="41" y="24" width="18" height="76" rx="5" fill={up ? "var(--up)" : "var(--dn)"} opacity="0.85" className="grow-y" style={{ animationDelay: "80ms" }} />
        <rect x="68" y="40" width="18" height="60" rx="5" fill="var(--chip)" className="grow-y" style={{ animationDelay: "160ms" }} />
      </svg>
      <button
        aria-label="Chiudi il riepilogo del mese"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(storeKey, "off");
          } catch {}
        }}
        className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center text-mut active:opacity-50"
      >
        <X size={18} />
      </button>
    </div>
  );
}
