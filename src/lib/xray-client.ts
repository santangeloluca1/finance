"use client";

import { useEffect, useState } from "react";
import type { PositionView } from "./analytics";
import { isFundLike } from "./engine/tax";

export interface Composition {
  isin: string;
  countries: { name: string; weight: number }[];
  sectors: { name: string; weight: number }[];
  holdings: { name: string; weight: number }[];
  hedged?: boolean;
  asOf: string | null;
}

// v2: fino a 10 paesi per ETF e copertura del cambio.
const KEY = "portafoglio:xray:v2";
const TTL = 24 * 3600_000;

/** Composizioni degli ETF in portafoglio (cache locale di un giorno). */
export function useCompositions(isins: string[]) {
  const key = [...new Set(isins)].sort().join(",");
  const [data, setData] = useState<Record<string, Composition>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) return;
    let cache: { at: number; items: Record<string, Composition> } = { at: 0, items: {} };
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? cache;
    } catch {}
    const fresh = Date.now() - cache.at < TTL;
    const wanted = key.split(",");
    const have = Object.fromEntries(wanted.filter((i) => cache.items[i]).map((i) => [i, cache.items[i]]));
    setData(have);
    const missing = fresh ? wanted.filter((i) => !cache.items[i]) : wanted;
    if (!missing.length) return;
    setLoading(true);
    fetch(`/api/xray?isin=${missing.join(",")}`)
      .then((r) => r.json())
      .then((j: { compositions: Composition[] }) => {
        const items = { ...cache.items };
        for (const c of j.compositions) items[c.isin] = c;
        try {
          localStorage.setItem(KEY, JSON.stringify({ at: fresh ? cache.at : Date.now(), items }));
        } catch {}
        setData(Object.fromEntries(wanted.filter((i) => items[i]).map((i) => [i, items[i]])));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [key]);

  return { compositions: data, loading };
}

const COUNTRY_BY_ISIN: Record<string, string> = {
  US: "Stati Uniti", IT: "Italia", DE: "Germania", FR: "Francia", NL: "Paesi Bassi", ES: "Spagna", GB: "Regno Unito",
  CH: "Svizzera", JP: "Giappone", CA: "Canada", BE: "Belgio", IE: "Irlanda", LU: "Lussemburgo", DK: "Danimarca",
  SE: "Svezia", FI: "Finlandia", NO: "Norvegia", AT: "Austria", PT: "Portogallo", CN: "Cina", KR: "Corea del Sud", TW: "Taiwan",
};

/**
 * Esposizione reale per paese o settore: ogni ETF viene "aperto" con i pesi
 * pubblicati, le azioni singole contano per il paese dell'emittente (dall'ISIN).
 */
export function lookThrough(views: PositionView[], compositions: Record<string, Composition>, kind: "countries" | "sectors") {
  const out = new Map<string, number>();
  let unknown = 0;
  const add = (name: string, v: number) => out.set(name, (out.get(name) ?? 0) + v);
  for (const v of views) {
    const comp = compositions[v.instrument.isin];
    if (isFundLike(v.instrument)) {
      const list = comp?.[kind];
      if (!list?.length) {
        unknown += v.value;
        continue;
      }
      for (const x of list) add(x.name === "Altri" ? "Altri" : x.name, v.value * x.weight);
    } else if (kind === "countries") {
      add(COUNTRY_BY_ISIN[v.instrument.isin.slice(0, 2)] ?? "Altri", v.value);
    } else {
      add("Azioni singole", v.value);
    }
  }
  if (unknown > 0) add("Non disponibile", unknown);
  return [...out.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => (a.name === "Altri" ? 1 : b.name === "Altri" ? -1 : b.value - a.value));
}

// ---------- Valute ----------

const EURO_AREA = new Set([
  "germania", "francia", "italia", "spagna", "paesi bassi", "belgio", "irlanda", "finlandia", "austria", "portogallo",
  "grecia", "lussemburgo", "slovacchia", "slovenia", "lituania", "lettonia", "estonia", "croazia", "malta", "cipro", "eurozona", "europa",
]);
const COUNTRY_CURRENCY: Record<string, string> = {
  "stati uniti": "USD", giappone: "JPY", "regno unito": "GBP", canada: "CAD", svizzera: "CHF", australia: "AUD",
  danimarca: "NORDIC", svezia: "NORDIC", norvegia: "NORDIC", "hong kong": "HKD", singapore: "SGD", "nuova zelanda": "NZD", israele: "ILS",
  cina: "EM", taiwan: "EM", "corea del sud": "EM", corea: "EM", india: "EM", brasile: "EM", sudafrica: "EM", messico: "EM",
  "arabia saudita": "EM", indonesia: "EM", thailandia: "EM", malesia: "EM", polonia: "EM", turchia: "EM", cile: "EM",
  "emirati arabi uniti": "EM", qatar: "EM", kuwait: "EM", filippine: "EM", colombia: "EM", "perù": "EM", ungheria: "EM",
};
const ISIN_CURRENCY: Record<string, string> = { US: "USD", JP: "JPY", GB: "GBP", CA: "CAD", CH: "CHF", AU: "AUD", DK: "NORDIC", SE: "NORDIC", NO: "NORDIC", HK: "HKD", CN: "EM", TW: "EM", KR: "EM", IN: "EM", BR: "EM" };
const EURO_ISIN = new Set(["IT", "DE", "FR", "NL", "ES", "BE", "IE", "FI", "AT", "PT", "GR", "LU", "SK", "SI", "LT", "LV", "EE", "HR", "MT", "CY"]);

export const CURRENCY_LABEL: Record<string, string> = {
  EUR: "Euro", USD: "Dollaro USA", JPY: "Yen giapponese", GBP: "Sterlina", CAD: "Dollaro canadese", CHF: "Franco svizzero",
  AUD: "Dollaro australiano", NORDIC: "Corone nordiche", HKD: "Dollaro di Hong Kong", SGD: "Dollaro di Singapore", NZD: "Dollaro neozelandese",
  ILS: "Shekel", EM: "Valute emergenti", OTHER: "Altre valute", NA: "Non disponibile",
};

function countryCurrency(name: string) {
  const n = name.trim().toLowerCase();
  if (EURO_AREA.has(n)) return "EUR";
  return COUNTRY_CURRENCY[n] ?? "OTHER";
}

/**
 * Esposizione valutaria vera: la valuta dei beni che possiedi, non quella del prezzo.
 * Gli ETF si aprono per paese (un MSCI World comprato in euro è ~70% dollaro);
 * quelli coperti dal cambio contano come euro. Le azioni contano per il paese
 * dell'emittente (Apple resta dollaro anche se comprata in euro); oro e crypto
 * sono prezzati in dollari.
 */
export function currencyExposure(views: PositionView[], compositions: Record<string, Composition>) {
  const out = new Map<string, number>();
  const add = (code: string, v: number) => out.set(code, (out.get(code) ?? 0) + v);
  for (const v of views) {
    const ins = v.instrument;
    if (isFundLike(ins)) {
      const comp = compositions[ins.isin];
      if (comp?.hedged || /\b(eur|€)[- ]?hedged\b|hedged.*\beur\b/i.test(ins.name)) {
        add("EUR", v.value);
        continue;
      }
      if (!comp?.countries.length) {
        add("NA", v.value);
        continue;
      }
      const known = comp.countries.reduce((a, c) => a + c.weight, 0);
      for (const c of comp.countries) add(c.name === "Altri" ? "OTHER" : countryCurrency(c.name), v.value * c.weight);
      // Pesi che non arrivano al 100%: il resto va tra le altre valute.
      if (known < 0.999) add("OTHER", v.value * (1 - known));
    } else if (ins.assetClass === "etc" || ins.assetClass === "crypto") {
      add("USD", v.value);
    } else if (ins.assetClass === "azione") {
      const cc = ins.isin.slice(0, 2);
      add(EURO_ISIN.has(cc) ? "EUR" : (ISIN_CURRENCY[cc] ?? (ins.currency === "EUR" ? "OTHER" : ins.currency)), v.value);
    } else {
      add(ins.currency, v.value);
    }
  }
  return [...out.entries()]
    .filter(([, value]) => Math.abs(value) > 0.005)
    .map(([code, value]) => ({ code, label: CURRENCY_LABEL[code] ?? code, value }))
    .sort((a, b) => (a.code === "NA" ? 1 : b.code === "NA" ? -1 : a.code === "OTHER" ? 1 : b.code === "OTHER" ? -1 : b.value - a.value));
}

/** Prime aziende sommando le partecipazioni di tutti gli ETF e le azioni dirette. */
export function topCompanies(views: PositionView[], compositions: Record<string, Composition>) {
  const out = new Map<string, { value: number; via: Set<string> }>();
  for (const v of views) {
    const name = v.instrument.shortName ?? v.instrument.name;
    if (!isFundLike(v.instrument)) {
      const e = out.get(name) ?? { value: 0, via: new Set<string>() };
      e.value += v.value;
      e.via.add("diretta");
      out.set(name, e);
      continue;
    }
    // Le prime partecipazioni degli ETF obbligazionari sono titoli di debito, non aziende.
    if (v.instrument.assetClass === "etf_obbligazionario") continue;
    for (const h of compositions[v.instrument.isin]?.holdings ?? []) {
      if (/cash|liquidit/i.test(h.name)) continue;
      const k = normalize(h.name);
      const e = out.get(k) ?? { value: 0, via: new Set<string>() };
      e.value += v.value * h.weight;
      e.via.add(name);
      out.set(k, e);
    }
  }
  return [...out.entries()].map(([name, e]) => ({ name, value: e.value, via: [...e.via] })).sort((a, b) => b.value - a.value);
}

function normalize(name: string) {
  return name
    .replace(/[,;.\s]+$/, "").replace(/\s+(Corp\.?|Inc\.?|Co\.?|Ltd\.?|plc|AG|SA|N\.V\.|Holdings?|Class [A-C]|Cl [A-C])$/gi, "").replace(/\s+(Corp\.?|Inc\.?)$/i, "")
    .replace(/[,;\s]+$/, "")
    .trim();
}
