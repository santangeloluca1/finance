import { fmtN, fmtSignedPct } from "./format";
import type { MonthWrap } from "./wrap";

/**
 * Immagine da condividere del riepilogo del mese, in formato storia (1080×1920).
 * Solo percentuali e nomi: nessun importo in euro, né patrimonio.
 */
export interface ShareRow {
  label: string;
  value: string;
}

const W = 1080;
const H = 1920;

export function shareRows(wrap: MonthWrap, bench: { label: string; ret: number } | null, nameOf: (isin: string) => string): ShareRow[] {
  const rows: ShareRow[] = [];
  const year = wrap.key.slice(0, 4);
  if (bench) {
    const diff = (wrap.ret - bench.ret) * 100;
    rows.push({ label: `vs ${bench.label}`, value: `${diff >= 0 ? "+" : "−"}${fmtN(Math.abs(diff), { maximumFractionDigits: 1 })} punti` });
  }
  if (wrap.rank) rows.push({ label: `Nel ${year}`, value: wrap.rank.pos === 1 ? "Il mese migliore" : `${wrap.rank.pos}° mese su ${wrap.rank.of}` });
  const top = wrap.titles[0];
  if (top && top.change > 0) rows.push({ label: "Protagonista", value: `${nameOf(top.isin)} ${fmtSignedPct(top.pct)}` });
  if (wrap.bestDay) rows.push({ label: "Giorno migliore", value: fmtSignedPct(wrap.bestDay.pct) });
  return rows;
}

function fontFamily() {
  const geist = getComputedStyle(document.documentElement).getPropertyValue("--font-geist").trim();
  return `${geist ? `${geist}, ` : ""}-apple-system, "SF Pro Display", system-ui, sans-serif`;
}

/** Riduce il testo finché entra nella larghezza indicata. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number, family: string) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    s -= 2;
  } while (ctx.measureText(text).width > max && s > 20);
}

export async function drawWrapImage(opts: { month: string; year: string; ret: number; rows: ShareRow[] }): Promise<Blob> {
  await document.fonts?.ready;
  const family = fontFamily();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Sfondo: come l'ultima schermata del riepilogo.
  ctx.fillStyle = "#0b0b12";
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.5, 0, 1100, "rgba(124,92,255,0.95)");
  glow(W, H, 900, "rgba(236,72,153,0.55)");

  const X = 96;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 40px ${family}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(`IL MIO ${opts.month.toUpperCase()} ${opts.year}`, X, 330);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 56px ${family}`;
  ctx.fillText("Il portafoglio ha fatto", X, 450);
  fit(ctx, fmtSignedPct(opts.ret), W - 2 * X, 800, 260, family);
  ctx.fillStyle = opts.ret >= 0 ? "#3bd98a" : "#ff6b6b";
  ctx.fillText(fmtSignedPct(opts.ret), X - 8, 700);

  // Riquadro con le righe.
  const top = 820;
  const rowH = 150;
  const boxH = Math.max(1, opts.rows.length) * rowH;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.roundRect(X - 16, top, W - 2 * X + 32, boxH, 44);
  ctx.fill();
  opts.rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2 + 16;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `500 40px ${family}`;
    ctx.fillText(r.label, X + 32, y);
    const labelW = ctx.measureText(r.label).width;
    fit(ctx, r.value, W - 2 * X - 96 - labelW, 700, 46, family);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(r.value, W - X - 32, y);
    ctx.textAlign = "left";
    if (i < opts.rows.length - 1) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(X + 32, top + (i + 1) * rowH, W - 2 * X - 64, 2);
    }
  });

  // Firma: il marchio di Basis.
  const mY = H - 230;
  const s = 96 / 180;
  ctx.save();
  ctx.translate(X, mY);
  ctx.scale(s, s);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(0, 0, 180, 180, 40);
  ctx.fill();
  ctx.fillStyle = "#3c3f47";
  ctx.beginPath();
  ctx.roundRect(40, 98, 25, 44, 7);
  ctx.roundRect(115, 76, 25, 66, 7);
  ctx.fill();
  ctx.fillStyle = "#f5f6f8";
  ctx.beginPath();
  ctx.roundRect(77.5, 52, 25, 90, 7);
  ctx.fill();
  ctx.strokeStyle = "#3bd98a";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(30, 86);
  ctx.lineTo(150, 86);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 52px ${family}`;
  ctx.fillText("Basis", X + 124, mY + 66);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Immagine non creata"))), "image/png"));
}

/** Condivide con il pannello del telefono; dove non si può, scarica l'immagine. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
