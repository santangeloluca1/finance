"use client";

import { LogOut, Mail, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Avatar, SettingsRow, SettingsSection, useAccount } from "@/components/settings";
import { BackLink } from "@/components/ui";
import { clearLocalData } from "@/lib/store";
import { useSyncStatus } from "@/lib/sync";
import { fmtTime } from "@/lib/format";

export default function Account() {
  const user = useAccount();
  const sync = useSyncStatus();
  return (
    <div>
      <BackLink href="/impostazioni" label="Impostazioni" />
      <div className="flex flex-col items-center px-4 pb-2 pt-4 text-center">
        {user ? <Avatar name={user.name || user.email} size={84} /> : <span className="skeleton h-[84px] w-[84px] rounded-full" />}
        <p className="mt-3 min-h-[30px] text-[24px] font-bold tracking-[-0.02em]">{user ? user.name || user.email : ""}</p>
      </div>
      <SettingsSection title="Account">
        <SettingsRow icon={Mail} title="Email" subtitle={user ? user.email : "…"} />
        <SettingsRow
          icon={RefreshCw}
          title="Sincronizzazione"
          subtitle={
            sync.state === "ok"
              ? `Dati salvati nel tuo account${sync.at ? `, alle ${fmtTime(sync.at)}` : ""}`
              : sync.state === "syncing"
                ? "In corso…"
                : sync.state === "offline"
                  ? "Sei offline: le modifiche partono appena torni online"
                  : sync.state === "error"
                    ? "Non riuscita, riprovo automaticamente"
                    : "In attesa"
          }
        />
      </SettingsSection>
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
    </div>
  );
}
