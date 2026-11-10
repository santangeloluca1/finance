"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { useMemo, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { BankDot, InfoRow, Panel, SectionHeader, SelectButton } from "@/components/ui";
import { currencyExposure, lookThrough, topCompanies, useCompositions } from "@/lib/xray-client";
import { isFundLike } from "@/lib/engine/tax";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, groupBy, type PositionView, type Slice, type Totals } from "@/lib/analytics";
import type { Account } from "@/lib/engine/types";
import { fmtEur, fmtEur0, fmtN, fmtPct, fmtSignedEur, fmtSignedPct } from "@/lib/format";

type By = "asset" | "banca" | "paese" | "settore" | "valuta" | "titolo";
const PALETTE = ["#5468ff", "#22b8cf", "#9b6bff", "#2dd4a7", "#f5a524", "#f472b6", "#ff7a45", "#94a3b8"];

export function Analisi({
  views,
  totals,
  accounts,
}: {
  views: PositionView[];
  totals: Totals;
  accounts: Account[];
}) {
  const [by, setBy] = useState<By>("asset");
  const byAcc = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const fundIsins = useMemo(() => views.filter((v) => isFundLike(v.instrument)).map((v) => v.instrument.isin), [views]);
  const { compositions, loading: xrayLoading } = useCompositions(fundIsins);
  const slices: Slice[] = useMemo(() => computeSlices(), [views, by, byAcc, compositions]);
  // Solo investimenti: la liquidità resta nel patrimonio della Home.
  const invested = totals.value - totals.cash;
  const companies = useMemo(() => topCompanies(views, compositions).slice(0, 10), [views, compositions]);

  function computeSlices(): Slice[] {
    if (by === "paese" || by === "settore") {
      return lookThrough(views, compositions, by === "paese" ? "countries" : "sectors").map((x, i) => ({
        key: x.name,
        label: x.name,
        value: x.value,
        color: x.name === "Altri" || x.name === "Non disponibile" ? "#64748b" : PALETTE[i % PALETTE.length],
      }));
    }
    if (by === "asset") return groupBy(views, (v) => ({ key: v.instrument.assetClass, label: ASSET_CLASS_LABEL[v.instrument.assetClass], color: ASSET_CLASS_COLOR[v.instrument.assetClass] }));
    if (by === "banca")
      return groupBy(views, (v) => {
        const a = byAcc.get(v.position.account);
        return { key: v.position.account, label: a?.name ?? v.position.account, color: a?.color ?? "#888" };
      });
    if (by === "valuta") {
      let k = 0;
      return currencyExposure(views, compositions).map((x) => ({
        key: x.code,
        label: x.label,
        value: x.value,
        // L'euro sempre nello stesso colore; grigio per ciò che non si sa ripartire.
        color: x.code === "EUR" ? PALETTE[0] : x.code === "OTHER" || x.code === "NA" ? "#64748b" : PALETTE[1 + (k++ % (PALETTE.length - 2))],
      }));
    }
    return groupBy(views, (v) => ({ key: v.instrument.isin, label: v.instrument.shortName ?? v.instrument.name, color: "" })).map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  }

  const ter = views.reduce((a, v) => a + (v.value * (v.instrument.ter ?? 0)) / 100, 0);
  const banks = accounts
    .map((a) => {
      const vs = views.filter((v) => v.position.account === a.id);
      const value = vs.reduce((s, v) => s + v.value, 0);
      const cost = vs.reduce((s, v) => s + v.position.totalCost, 0);
      return { a, value, gain: value - cost, pct: cost ? (value - cost) / cost : 0 };
    })
    .filter((b) => b.value > 0);

  return (
    <div>
      <div className="pt-7">
        <Gauge slices={slices} size={280}>
          <p className="text-[13px] text-mut">Valore degli investimenti</p>
          <p className="num sensitive text-[28px] font-bold tracking-[-0.035em]">{fmtEur(invested)}</p>
        </Gauge>
      </div>

      <SectionHeader
        right={
          <SelectButton
            label="Raggruppa per"
            value={by}
            onChange={setBy}
            options={[
              { value: "asset", label: "Asset class" },
              { value: "paese", label: "Paese" },
              { value: "settore", label: "Settore" },
              { value: "banca", label: "Banca" },
              { value: "valuta", label: "Valuta" },
              { value: "titolo", label: "Titolo" },
            ]}
          />
        }
      >
        Composizione
      </SectionHeader>
      <ul className="stagger">
        {slices.map((s) => {
          const share = s.value / (invested || 1);
          return (
            <li key={s.key} className="px-4 py-3">
              <div className="flex items-baseline gap-2.5">
                <BankDot color={s.color} size={9} />
                <p className="min-w-0 flex-1 truncate text-[17px] font-medium">{s.label}</p>
                <p className="num sensitive text-[15px] text-mut">{fmtEur0(s.value)}</p>
                <p className="num w-[62px] text-right text-[17px] font-semibold">{fmtPct(share)}</p>
              </div>
              <div className="ml-[19px] mt-2 h-1 overflow-hidden rounded-full bg-chip">
                <div key={by} className="grow-x h-full rounded-full" style={{ width: `${share * 100}%`, background: s.color }} />
              </div>
            </li>
          );
        })}
      </ul>

      {by === "valuta" && <Cambio slices={slices} invested={invested} loading={xrayLoading} />}

      {(by === "paese" || by === "settore") && (
        <p className="px-4 pt-1 text-[13px] leading-snug text-mut">
          {xrayLoading ? "Lettura della composizione degli ETF…" : "Esposizione dentro gli ETF, dati justETF."}
        </p>
      )}

      {companies.length > 0 && (
        <>
          <SectionHeader>Prime aziende</SectionHeader>
          <ul className="stagger">
            {companies.map((c) => (
              <li key={c.name} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold">{c.name}</p>
                  <p className="truncate text-[14px] text-mut">{c.via.map((v) => (v === "diretta" ? "Azione diretta" : v)).join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-[17px] font-medium">{fmtPct(c.value / (invested || 1))}</p>
                  <p className="num sensitive text-[14px] text-mut">{fmtEur0(c.value)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="px-4 pt-1 text-[13px] leading-snug text-mut">Prime 10 partecipazioni di ogni ETF più le azioni dirette.</p>
        </>
      )}

      <SectionHeader>Guadagno per banca</SectionHeader>
      <p className="-mt-1 px-4 pb-1 text-[14px] text-mut">Titoli che hai ora, rispetto al prezzo medio di carico.</p>
      <ul className="stagger">
        {banks.map(({ a, value, gain, pct }) => (
          <li key={a.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
            <BankDot color={a.color} size={9} />
            <div className="flex-1">
              <p className="text-[17px] font-semibold">{a.name}</p>
              <p className="num sensitive text-[14px] text-mut">Valore {fmtEur(value)}</p>
            </div>
            <div className="text-right">
              <p className={`num text-[17px] font-medium ${pct > 0.00005 ? "text-up" : pct < -0.00005 ? "text-dn" : "text-mut"}`}>{fmtSignedPct(pct)}</p>
              <p className="num sensitive text-[14px] text-mut">{fmtSignedEur(gain)}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* I costi stanno in Fisco: qui solo il TER medio e il collegamento. */}
      <Panel className="mt-10">
        <Link href="/fisco#costi" className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 active:bg-panel-2">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-medium">Costi annui</p>
            <p className="num text-[13px] text-mut">TER medio ponderato {fmtN((ter / (invested || 1)) * 100, { maximumFractionDigits: 2 })}% · bollo e dettagli in Fisco</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-faint" />
        </Link>
      </Panel>
    </div>
  );
}

/** "il dollaro USA", "lo yen", "la sterlina": per la frase "Se … perde il 10%". */
const CURRENCY_SUBJECT: Record<string, string> = {
  USD: "il dollaro", JPY: "lo yen", GBP: "la sterlina", CAD: "il dollaro canadese", CHF: "il franco svizzero", AUD: "il dollaro australiano",
  NORDIC: "le corone nordiche", HKD: "il dollaro di Hong Kong", SGD: "il dollaro di Singapore", NZD: "il dollaro neozelandese", ILS: "lo shekel",
  EM: "le valute emergenti",
};

/**
 * Quanto del portafoglio si muove col cambio e cosa succede se le valute
 * principali perdono il 10% contro l'euro.
 */
function Cambio({ slices, invested, loading }: { slices: Slice[]; invested: number; loading: boolean }) {
  const foreign = slices.filter((s) => s.key !== "EUR" && s.key !== "NA").reduce((a, s) => a + s.value, 0);
  const share = invested > 0 ? foreign / invested : 0;
  const shocks = slices.filter((s) => CURRENCY_SUBJECT[s.key] && s.value / (invested || 1) >= 0.02).slice(0, 3);
  return (
    <>
      <Panel className="mt-4">
        <InfoRow
          label="Esposto al cambio"
          hint={share >= 0.005 ? "Questa parte si muove anche con le valute" : "Tutto in euro o coperto dal cambio"}
          value={fmtPct(share)}
          valueClass={share >= 0.5 ? "text-warn" : ""}
        />
        {shocks.map((s) => (
          <InfoRow
            key={s.key}
            label={`Se ${CURRENCY_SUBJECT[s.key]} perde il 10%`}
            hint={`Su ${fmtEur0(s.value)} esposti a questa valuta`}
            value={<span className="sensitive">{fmtSignedEur(-s.value * 0.1)}</span>}
            valueClass="text-dn"
          />
        ))}
      </Panel>
      <p className="px-4 pt-2 text-[13px] leading-snug text-mut">
        {loading
          ? "Lettura della composizione degli ETF…"
          : "Valuta dei beni dentro gli ETF, ricavata dai paesi (dati justETF), non quella in cui li compri. Gli ETF coperti dal cambio contano come euro."}
      </p>
    </>
  );
}
