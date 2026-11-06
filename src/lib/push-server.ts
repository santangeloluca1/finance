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
       create index if not exists notification_log_recent on notification_log (user_id, sent_at desc);`,
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

/** Invia un messaggio a tutti i dispositivi dell'utente; rimuove le iscrizioni scadute. Restituisce quanti l'hanno ricevuto. */
export async function sendToUser(userId: string, msg: PushMessage): Promise<number> {
  if (!pool) return 0;
  const { publicKey, privateKey } = await vapidKeys();
  const subject = process.env.VAPID_SUBJECT ?? "mailto:notifiche@basis.app";
  const { rows } = await pool.query<{ endpoint: string; p256dh: string; auth: string }>("select endpoint, p256dh, auth from push_subscription where user_id = $1", [userId]);
  let ok = 0;
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: 6 * 3600,
          urgency: "normal",
          topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        });
        ok++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await pool!.query("delete from push_subscription where endpoint = $1", [s.endpoint]);
        else console.error("push", code, (e as Error).message);
      }
    }),
  );
  return ok;
}
