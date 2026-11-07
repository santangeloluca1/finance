import webpush from "web-push";
import { pool } from "./db";

/**
 * Notifiche push (Web Push, funziona anche sulla web app dell'iPhone da iOS 16.4).
 * Le chiavi VAPID si leggono da VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; se mancano
 * vengono generate una volta e salvate nel database.
 */

let ready: Promise<void> | null = null;

export function ensurePushTables() {
  if (!pool) return Promise.resolve();
  ready ??= pool
    .query(
      `create table if not exists app_secret (
         key text primary key,
         value text not null
       );
       create table if not exists push_subscription (
         endpoint text primary key,
         user_id text not null references "user"(id) on delete cascade,
         p256dh text not null,
         auth text not null,
         device text,
         created_at timestamptz not null default now()
       );
       create table if not exists notification_log (
         user_id text not null references "user"(id) on delete cascade,
         alert_id text not null,
         title text not null,
         body text not null,
         href text not null,
         sent_at timestamptz not null default now(),
         primary key (user_id, alert_id)
       );
       create index if not exists notification_log_recent on notification_log (user_id, sent_at desc);
       create table if not exists notify_run (
         id bigserial primary key,
         at timestamptz not null default now(),
         source text not null,
         users int not null,
         sent int not null,
         error text
       );`,
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

let keys: Promise<{ publicKey: string; privateKey: string }> | null = null;

export function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return Promise.resolve({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  }
  if (!pool) return Promise.reject(new Error("Database non configurato"));
  keys ??= (async () => {
    await ensurePushTables();
    const { rows } = await pool!.query<{ value: string }>("select value from app_secret where key = 'vapid'");
    if (rows.length) return JSON.parse(rows[0].value) as { publicKey: string; privateKey: string };
    const fresh = webpush.generateVAPIDKeys();
    // Se due richieste generano insieme, vince la prima salvata.
    await pool!.query("insert into app_secret (key, value) values ('vapid', $1) on conflict (key) do nothing", [JSON.stringify(fresh)]);
    const again = await pool!.query<{ value: string }>("select value from app_secret where key = 'vapid'");
    return JSON.parse(again.rows[0].value) as { publicKey: string; privateKey: string };
  })().catch((e) => {
    keys = null;
    throw e;
  });
  return keys;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface Delivery {
  /** Dispositivi che hanno ricevuto il messaggio. */
  sent: number;
  /** Dispositivi iscritti. */
  devices: number;
  /** Errori del servizio push, per capire cosa non va (es. "403 BadJwtToken"). */
  errors: string[];
}

/** Invia un messaggio a tutti i dispositivi dell'utente; rimuove le iscrizioni scadute. */
export async function deliver(userId: string, msg: PushMessage): Promise<Delivery> {
  if (!pool) return { sent: 0, devices: 0, errors: ["Database non configurato"] };
  const { publicKey, privateKey } = await vapidKeys();
  const subject = process.env.VAPID_SUBJECT ?? "mailto:notifiche@basis.app";
  const { rows } = await pool.query<{ endpoint: string; p256dh: string; auth: string }>("select endpoint, p256dh, auth from push_subscription where user_id = $1", [userId]);
  let sent = 0;
  const errors: string[] = [];
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: 6 * 3600,
          urgency: "high",
          topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        });
        sent++;
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        const host = (() => {
          try {
            return new URL(s.endpoint).host;
          } catch {
            return "?";
          }
        })();
        const detail = `${err.statusCode ?? "?"} ${(err.body || err.message || "").toString().slice(0, 160)}`.trim();
        console.error("push", host, detail);
        errors.push(`${host}: ${detail}`);
        if (err.statusCode === 404 || err.statusCode === 410) await pool!.query("delete from push_subscription where endpoint = $1", [s.endpoint]);
      }
    }),
  );
  return { sent, devices: rows.length, errors };
}

/** Come deliver, ma restituisce solo quanti dispositivi l'hanno ricevuto. */
export async function sendToUser(userId: string, msg: PushMessage): Promise<number> {
  return (await deliver(userId, msg)).sent;
}

/** Registra un controllo automatico, per mostrarlo nell'app. */
export async function logRun(source: string, users: number, sent: number, error?: string) {
  if (!pool) return;
  await ensurePushTables();
  await pool.query("insert into notify_run (source, users, sent, error) values ($1, $2, $3, $4)", [source, users, sent, error ?? null]);
  await pool.query("delete from notify_run where at < now() - interval '14 days'");
}
