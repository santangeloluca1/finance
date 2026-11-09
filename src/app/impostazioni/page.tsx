"use client";

import Link from "next/link";
import { Bell, ChevronRight, Database, Eye, Info, LogOut, Palette, CalendarClock, Target } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { Avatar, SettingsRow, SettingsSection, useAccount } from "@/components/settings";
import { BackLink, LargeTitle, Switch } from "@/components/ui";
import { usePrivacy } from "@/lib/privacy";
import { usePush } from "@/lib/push-client";
import { clearLocalData } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { useTheme } from "@/lib/theme";

const THEME_LABEL = { auto: "Automatico, come l'iPhone", light: "Chiaro", dark: "Scuro" } as const;

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
        <SettingsRow icon={CalendarClock} title="Operazioni ricorrenti" subtitle="Stipendio, bonifici e PAC" href="/ricorrenti" />
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
