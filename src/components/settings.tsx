"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";

/** Sezione delle impostazioni: titolo grande, poi le voci senza riquadri (come getquin). */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-8">
      <h2 className="px-4 pb-2 text-[26px] font-bold tracking-[-0.03em]">{title}</h2>
      <ul className="stagger">{children}</ul>
    </section>
  );
}

/** Voce: icona a contorno, titolo, sottotitolo e freccia (o un controllo a destra). */
export function SettingsRow({
  icon: Icon,
  title,
  subtitle,
  href,
  onClick,
  right,
  danger,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  href?: string;
  onClick?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const body = (
    <>
      <Icon size={24} strokeWidth={1.6} className={`shrink-0 ${danger ? "text-dn" : "text-ink"}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-[17px] leading-snug ${danger ? "text-dn" : ""}`}>{title}</p>
        {subtitle && <p className="mt-0.5 text-[14px] leading-snug text-mut">{subtitle}</p>}
      </div>
      {right ?? ((href || onClick) && !danger ? <ChevronRight size={20} strokeWidth={1.8} className="shrink-0 text-ink-2" /> : null)}
    </>
  );
  const cls = "flex min-h-[68px] w-full items-center gap-4 px-4 py-3 text-left active:bg-panel-2";
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** Cerchio con l'iniziale del nome. */
export function Avatar({ name, size = 52 }: { name?: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-chip font-semibold text-ink-2" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name ? name[0]?.toUpperCase() : ""}
    </span>
  );
}

export type AccountUser = { name: string; email: string };
const USER_KEY = "portafoglio:user:v1";

/**
 * Utente collegato. Restituisce subito l'ultimo utente salvato sul telefono,
 * null mentre la sessione arriva per la prima volta, false se non c'è sessione.
 */
export function useAccount(): AccountUser | null | false {
  const { data: session, isPending } = authClient.useSession();
  const [cached, setCached] = useState<AccountUser | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) setCached(JSON.parse(raw) as AccountUser);
    } catch {}
  }, []);
  useEffect(() => {
    if (!session?.user) return;
    const u = { name: session.user.name, email: session.user.email };
    setCached(u);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {}
  }, [session?.user]);
  if (session?.user) return { name: session.user.name, email: session.user.email };
  if (isPending) return cached;
  return false;
}
