"use client";

import { useEffect, useState } from "react";
import type { PositionView } from "./analytics";
import { isFundLike } from "./engine/tax";

export interface Composition {
  isin: string;
  countries: { name: string; weight: number }[];
  sectors: { name: string; weight: number }[];
  holdings: { name: string; weight: number }[];
  asOf: string | null;
}

const KEY = "portafoglio:xray:v1";
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
