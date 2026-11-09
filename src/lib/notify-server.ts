import { pool } from "./db";
import { computeAlerts, pushableAlerts, pushIcon } from "./alerts";
import { totals as computeTotals, valuePositions, type Quotes } from "./analytics";
import { buildPortfolio } from "./engine/portfolio";
import { getFxLatest } from "./market/fx";
import { bestQuote } from "./market/sources";
import { dailySummary, isQuietTime, isSummaryTime, romeClock, settingsOf } from "./notify";
import { ensurePushTables, sendToUser, type PushMessage } from "./push-server";
import type { PortfolioData } from "./store";

/** Oltre questo numero gli avvisi della stessa esecuzione diventano un'unica notifica. */
const MAX_SINGLE = 3;

export interface RunReport {
  userId: string;
  candidates: number;
  sent: number;
  skipped?: string;
}

/**
 * Controlla gli avvisi di ogni utente con almeno un dispositivo iscritto e invia
 * quelli nuovi. Ogni avviso parte una volta sola (registro notification_log);
 * gli avvisi già visti nell'app non vengono inviati.
 */
export async function runNotifications(opts: { userId?: string; now?: Date; force?: boolean } = {}): Promise<RunReport[]> {
  if (!pool) throw new Error("Database non configurato");
  await ensurePushTables();
  const clock = romeClock(opts.now);
  const users = opts.userId
    ? [opts.userId]
    : (await pool.query<{ user_id: string }>("select distinct user_id from push_subscription")).rows.map((r) => r.user_id);

  const reports: RunReport[] = [];
  for (const userId of users) {
    try {
      reports.push(await runForUser(userId, clock, opts.force));
    } catch (e) {
      console.error("notify", userId, e);
      reports.push({ userId, candidates: 0, sent: 0, skipped: String(e) });
    }
  }
  return reports;
}

async function runForUser(userId: string, clock: ReturnType<typeof romeClock>, force = false): Promise<RunReport> {
  const { rows } = await pool!.query<{ data: PortfolioData }>("select data from portfolio where user_id = $1", [userId]);
  const data = rows[0]?.data;
  if (!data) return { userId, candidates: 0, sent: 0, skipped: "nessun portafoglio" };
  const settings = settingsOf(data.notify);
  if (settings.quiet && isQuietTime(clock.time) && !force) return { userId, candidates: 0, sent: 0, skipped: "non disturbare" };

  const state = buildPortfolio(data.transactions, data.instruments);
  const open = new Set(state.positions.filter((p) => p.quantity > 0).map((p) => p.isin));
  // Quotazioni dei titoli aperti e di quelli usati nelle regole.
  const wanted = new Set([...open, ...(data.alertRules ?? []).filter((r) => r.enabled).map((r) => r.target)]);
  const instruments = data.instruments.filter((i) => wanted.has(i.isin));
  const quotes: Quotes = {};
  await Promise.all(
    instruments.map(async (i) => {
      const q = await bestQuote(i.ticker, i.currency === "EUR" ? i.isin : undefined).catch(() => null);
      if (q) quotes[i.ticker] = q;
    }),
  );
  const fx = await getFxLatest([...new Set(Object.values(quotes).map((q) => q.currency))]).catch(() => ({}));
  const views = valuePositions(state, data.instruments, quotes, fx);
  const totals = computeTotals(views, state);

  const alerts = pushableAlerts(computeAlerts(data, state, views, totals, quotes, clock.date), data);
  const candidates: (PushMessage & { id: string })[] = alerts.map((a) => ({ id: a.id, title: `${pushIcon(a)} ${a.title}`, body: a.detail, url: a.href, tag: a.id }));
  if (settings.summary && isSummaryTime(clock)) {
    const s = dailySummary(views, totals, clock.date);
    if (s) candidates.push({ id: s.id, title: `${{ up: "📈", down: "📉", flat: "➖" }[s.mood]} ${s.title}`, body: s.detail, url: s.href, tag: "riepilogo" });
  }
  if (!candidates.length) return { userId, candidates: 0, sent: 0 };

  const logged = await pool!.query<{ alert_id: string }>("select alert_id from notification_log where user_id = $1 and alert_id = any($2)", [userId, candidates.map((c) => c.id)]);
  const done = new Set(logged.rows.map((r) => r.alert_id));
  const fresh = candidates.filter((c) => !done.has(c.id));
  if (!fresh.length) return { userId, candidates: candidates.length, sent: 0 };

  const messages: PushMessage[] =
    fresh.length > MAX_SINGLE
      ? [
          ...fresh.slice(0, MAX_SINGLE - 1),
          {
            title: `🔔 Altri ${fresh.length - MAX_SINGLE + 1} avvisi`,
            body: fresh
              .slice(MAX_SINGLE - 1)
              .map((c) => c.title)
              .join(" · "),
            url: "/avvisi",
            tag: `gruppo-${clock.date}-${clock.time}`,
          },
        ]
      : fresh;

  let delivered = 0;
  for (const m of messages) delivered += await sendToUser(userId, m);
  // Si registrano solo se almeno un dispositivo li ha ricevuti: altrimenti si riprova alla prossima esecuzione.
  if (delivered > 0) {
    await pool!.query(
      `insert into notification_log (user_id, alert_id, title, body, href)
       select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::text[])
       on conflict do nothing`,
      [userId, fresh.map((c) => c.id), fresh.map((c) => c.title), fresh.map((c) => c.body), fresh.map((c) => c.url)],
    );
  }
  return { userId, candidates: candidates.length, sent: delivered ? fresh.length : 0 };
}
