/**
 * Evento di calendario (.ics) per un promemoria: aprendolo sull'iPhone lo si
 * aggiunge al Calendario, che manda la notifica alle 9 del giorno indicato.
 * ?title=…&date=YYYY-MM-DD&repeat=none|monthly|yearly
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const date = p.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("Data non valida", { status: 400 });
  const title = (p.get("title") ?? "Promemoria").slice(0, 120);
  const repeat = p.get("repeat");
  const day = date.replace(/-/g, "");
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Basis//Promemoria//IT",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${day}-${encodeURIComponent(title).slice(0, 40)}@basis`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${esc(title)}`,
    ...(repeat === "monthly" ? ["RRULE:FREQ=MONTHLY"] : repeat === "yearly" ? ["RRULE:FREQ=YEARLY"] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(title)}`,
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="promemoria.ics"` },
  });
}
