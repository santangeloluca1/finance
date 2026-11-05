"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, LoaderCircle, Search, Trash2, X } from "lucide-react";
import { usePortfolioCtx } from "@/components/PortfolioProvider";
import { BankDot, Chip, ChipRow, Logo, Segmented } from "@/components/ui";
import { ASSET_CLASS_LABEL } from "@/lib/analytics";
import type { AssetClass, Instrument, Transaction, TransactionType } from "@/lib/engine/types";
import { fmtEur, fmtNum, fmtPrice } from "@/lib/format";
import { deleteTransaction, newId, SaveError, saveTransaction } from "@/lib/store";

type Kind = Exclude<TransactionType, "split">;

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
  isin: string | null;
  currency: string | null;
  price: number | null;
}

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "buy", label: "Acquisto" },
  { value: "sell", label: "Vendita" },
  { value: "dividend", label: "Cedola" },
  { value: "cash", label: "Liquidità" },
];

export default function NuovoMovimentoPage() {
  // I dati stanno nel browser: il modulo parte dopo il montaggio, con i dati veri.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return (
    <Suspense>
      <NuovoMovimento />
    </Suspense>
  );
}

function NuovoMovimento() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, state } = usePortfolioCtx();
  const editing = data.transactions.find((t) => t.id === params.get("id"));

  const [kind, setKind] = useState<Kind>((editing?.type as Kind) ?? (params.get("tipo") as Kind) ?? "buy");
  const [account, setAccount] = useState(editing?.account ?? params.get("conto") ?? data.accounts[0]?.id ?? "");
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10));
  const [instrument, setInstrument] = useState<Instrument | null>(() => data.instruments.find((i) => i.isin === editing?.isin) ?? null);
  const [isNew, setIsNew] = useState(false);
  const [quantity, setQuantity] = useState(editing?.quantity?.toString().replace(".", ",") ?? "");
  const [price, setPrice] = useState(editing?.price?.toString().replace(".", ",") ?? "");
  const [fees, setFees] = useState(editing?.fees?.toString().replace(".", ",") ?? "");
  const [fx, setFx] = useState(editing?.fxRate?.toString().replace(".", ",") ?? "");
  const [amount, setAmount] = useState(editing?.amount?.toString().replace(".", ",") ?? "");
  const [error, setError] = useState<string | null>(null);

  const currency = instrument?.currency ?? "EUR";
  const needsInstrument = kind !== "cash";

  // Cambio BCE del giorno, per i titoli non in euro.
  useEffect(() => {
    if (kind === "cash" || kind === "dividend" || currency === "EUR" || editing?.fxRate) return;
    let stop = false;
    fetch(`/api/fx?date=${date}&c=${currency}`)
      .then((r) => r.json())
      .then((j: { rate: number | null }) => !stop && j.rate && setFx(String(j.rate).replace(".", ",")))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [kind, currency, date, editing?.fxRate]);

  // Prezzo attuale come suggerimento per nuovi acquisti di oggi.
  const held = useMemo(
    () => state?.positions.find((p) => p.account === account && p.isin === instrument?.isin && p.quantity > 0),
    [state, account, instrument],
  );

  const q = num(quantity);
  const p = num(price);
  const total = kind === "buy" || kind === "sell" ? (q * p) / (currency === "EUR" ? 1 : num(fx) || 1) + (kind === "buy" ? 1 : -1) * num(fees) : num(amount);

  const valid =
    account &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    (kind === "cash"
      ? amount !== ""
      : instrument && (kind === "dividend" ? num(amount) > 0 : q > 0 && p > 0 && (currency === "EUR" || num(fx) > 0)));

  const save = () => {
    if (!valid) return;
    const tx: Transaction = {
      id: editing?.id ?? newId(),
      date,
      account,
      type: kind,
      isin: kind === "cash" ? "" : instrument!.isin,
      ...(kind === "buy" || kind === "sell"
        ? { quantity: q, price: p, fees: num(fees) || undefined, fxRate: currency === "EUR" ? undefined : num(fx) }
        : { amount: num(amount) }),
    };
    try {
      saveTransaction(tx, isNew && instrument ? instrument : undefined);
      router.push("/movimenti");
    } catch (e) {
      setError(e instanceof SaveError ? e.message : "Salvataggio non riuscito.");
    }
  };

  const remove = () => {
    if (!editing || !confirm("Eliminare questo movimento?")) return;
    try {
      deleteTransaction(editing.id);
      router.push("/movimenti");
    } catch (e) {
      setError(e instanceof SaveError ? e.message : "Eliminazione non riuscita.");
    }
  };

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between px-4">
        <Link href="/movimenti" className="w-[62px] py-2.5 text-[17px] text-accent active:opacity-50">
          Annulla
        </Link>
        <p className="text-[17px] font-semibold">{editing ? "Modifica" : "Nuovo movimento"}</p>
        <span className="w-[62px]" aria-hidden />
      </div>

      {data.isDemo && !editing && (
        <p className="mx-4 mt-3 rounded-[14px] bg-accent/12 px-3.5 py-2.5 text-[13px] leading-snug text-ink-2">
          Al primo salvataggio il portafoglio di esempio viene sostituito dai tuoi movimenti.
        </p>
      )}

      <div className="mt-5 px-4">
        <Segmented value={kind} onChange={(k) => setKind(k)} options={KIND_OPTIONS} />
      </div>

      <p className="px-5 pb-2 pt-6 text-[13px] font-medium text-mut">Conto</p>
      <ChipRow>
        {data.accounts.map((a) => (
          <Chip key={a.id} active={account === a.id} onClick={() => setAccount(a.id)}>
            <BankDot color={a.color} />
            {a.name}
          </Chip>
        ))}
      </ChipRow>

      {needsInstrument && (
        <>
          <p className="px-5 pb-2 pt-6 text-[13px] font-medium text-mut">Titolo</p>
          {instrument ? (
            <InstrumentCard
              instrument={instrument}
              isNew={isNew}
              onClear={() => {
                setInstrument(null);
                setIsNew(false);
              }}
              onChange={setInstrument}
            />
          ) : (
            <InstrumentSearch
              known={data.instruments}
              onPick={(ins, fresh, lastPrice) => {
                setInstrument(ins);
                setIsNew(fresh);
                if (lastPrice && !price && date === new Date().toISOString().slice(0, 10)) setPrice(String(lastPrice).replace(".", ","));
              }}
            />
          )}
          {held && kind === "sell" && (
            <p className="px-5 pt-2 text-[13px] text-mut">
              Possiedi {fmtNum(held.quantity)} quote a un prezzo medio di {fmtEur(held.avgCost)}.
            </p>
          )}
        </>
      )}

      <p className="px-5 pb-2 pt-6 text-[13px] font-medium text-mut">Dettagli</p>
      <div className="mx-4 overflow-hidden rounded-[16px] bg-panel">
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        {(kind === "buy" || kind === "sell") && (
          <>
            <Field label="Quote">
              <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className={inputCls} />
            </Field>
            <Field label={`Prezzo per quota (${currency})`}>
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" className={inputCls} />
            </Field>
            <Field label="Commissioni (€)">
              <input inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0,00" className={inputCls} />
            </Field>
            {currency !== "EUR" && (
              <Field label={`Cambio · 1 € = ? ${currency}`} hint="Cambio BCE del giorno, modificalo se la banca ne ha usato un altro">
                <input inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="1,0800" className={inputCls} />
              </Field>
            )}
          </>
        )}
        {kind === "dividend" && (
          <Field label="Importo netto accreditato (€)">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={inputCls} />
          </Field>
        )}
        {kind === "cash" && (
          <Field label="Saldo del conto (€)" hint="La liquidità disponibile sul conto in questa data">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={inputCls} />
          </Field>
        )}
      </div>

      {valid && kind !== "cash" && (
        <div className="mx-4 mt-4 flex items-center justify-between rounded-[16px] bg-panel-2 px-4 py-3.5">
          <p className="text-[15px] text-ink-2">{kind === "buy" ? "Totale addebitato" : kind === "sell" ? "Totale accreditato" : "Accreditato"}</p>
          <p className="num text-[20px] font-semibold tracking-[-0.03em]">{fmtEur(total)}</p>
        </div>
      )}

      <p role="alert" className={`px-5 pt-3 text-[14px] text-dn ${error ? "" : "hidden"}`}>
        {error}
      </p>

      <div className="px-4 pt-5">
        <button
          onClick={save}
          disabled={!valid}
          className="flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-ink text-[17px] font-semibold text-bg active:opacity-80 disabled:opacity-40"
        >
          <Check size={19} strokeWidth={2.6} /> Salva movimento
        </button>
        {editing && (
          <button onClick={remove} className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] text-[16px] font-semibold text-dn active:bg-panel">
            <Trash2 size={18} /> Elimina movimento
          </button>
        )}
      </div>
    </div>
  );
}

function InstrumentSearch({ known, onPick }: { known: Instrument[]; onPick: (i: Instrument, isNew: boolean, lastPrice?: number | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  const local = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return known;
    return known.filter((i) => [i.name, i.shortName, i.ticker, i.isin].some((v) => v?.toLowerCase().includes(s)));
  }, [q, known]);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setResults([]);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(s)}`)
        .then((r) => r.json())
        .then((j: { results: SearchResult[] }) => setResults(j.results.filter((r) => !known.some((k) => k.ticker === r.ticker))))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, known]);

  return (
    <div className="mx-4 overflow-hidden rounded-[16px] bg-panel">
      <label className="flex items-center gap-2.5 border-b border-sep px-4 py-3">
        <Search size={18} className="shrink-0 text-mut" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome, ticker o ISIN"
          autoCapitalize="none"
          className="h-7 w-full bg-transparent text-[17px] outline-none placeholder:text-faint"
        />
        {busy && <LoaderCircle size={17} className="shrink-0 animate-spin text-mut" />}
      </label>
      <ul className="max-h-[340px] overflow-y-auto">
        {local.map((i) => (
          <ResultRow key={i.isin} title={i.shortName ?? i.name} subtitle={`${i.ticker} · già in portafoglio`} isin={i.isin} onClick={() => onPick(i, false)} />
        ))}
        {results.map((r) => (
          <ResultRow
            key={r.ticker}
            title={r.name}
            subtitle={`${r.ticker} · ${r.exchange}${r.currency ? ` · ${r.currency}` : ""}${r.price ? ` · ${fmtPrice(r.price, r.currency ?? "EUR")}` : ""}`}
            isin={r.isin ?? r.ticker}
            onClick={() => onPick(fromResult(r), true, r.price)}
          />
        ))}
        {q.trim().length >= 2 && !busy && !local.length && !results.length && (
          <li className="px-4 py-5 text-center text-[14px] text-mut">Nessun risultato. Prova con l&apos;ISIN o il ticker.</li>
        )}
      </ul>
    </div>
  );
}

function ResultRow({ title, subtitle, isin, onClick }: { title: string; subtitle: string; isin: string; onClick: () => void }) {
  return (
    <li className="border-b border-sep last:border-0">
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-panel-2">
        <Logo isin={isin} name={title} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-[12px] text-mut">{subtitle}</span>
        </span>
      </button>
    </li>
  );
}

const CLASS_OPTIONS: AssetClass[] = ["etf_azionario", "etf_obbligazionario", "azione", "obbligazione", "etc", "certificato", "crypto"];

function InstrumentCard({
  instrument,
  isNew,
  onClear,
  onChange,
}: {
  instrument: Instrument;
  isNew: boolean;
  onClear: () => void;
  onChange: (i: Instrument) => void;
}) {
  return (
    <div className="mx-4 overflow-hidden rounded-[16px] bg-panel">
      <div className="flex items-center gap-3 px-4 py-3">
        <Logo isin={instrument.isin} name={instrument.shortName ?? instrument.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{instrument.shortName ?? instrument.name}</p>
          <p className="truncate text-[12px] text-mut">
            {instrument.ticker} · {instrument.currency}
          </p>
        </div>
        <button onClick={onClear} aria-label="Cambia titolo" className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-mut">
          <X size={16} />
        </button>
      </div>
      {isNew && (
        <div className="border-t border-sep px-4 py-3">
          <p className="text-[12px] font-medium text-mut">Tipo di strumento</p>
          <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
            {CLASS_OPTIONS.map((c) => (
              <Chip key={c} active={instrument.assetClass === c} onClick={() => onChange({ ...instrument, assetClass: c, govBondShare: c === "obbligazione" ? 1 : c === "etf_obbligazionario" ? instrument.govBondShare : 0 })}>
                {ASSET_CLASS_LABEL[c]}
              </Chip>
            ))}
          </div>
          {(instrument.assetClass === "etf_obbligazionario" || instrument.assetClass === "obbligazione") && (
            <label className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[14px] leading-snug text-ink-2">
                Titoli di Stato (white list)
                <span className="block text-[12px] text-mut">Tassazione al 12,5% invece del 26%</span>
              </span>
              <input
                type="checkbox"
                checked={(instrument.govBondShare ?? 0) >= 1}
                onChange={(e) => onChange({ ...instrument, govBondShare: e.target.checked ? 1 : 0 })}
                className="h-6 w-6 accent-[var(--accent)]"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function fromResult(r: SearchResult): Instrument {
  const name = r.name;
  const lower = name.toLowerCase();
  const isBond = /bond|govt|government|treasury|aggregate|obblig|btp|corporate/.test(lower);
  const isGov = /govt|government|treasury|btp|bund|t-bill/.test(lower);
  const assetClass: AssetClass =
    r.type === "CRYPTOCURRENCY" ? "crypto" : r.type === "ETF" || r.type === "MUTUALFUND" ? (isBond ? "etf_obbligazionario" : "etf_azionario") : "azione";
  return {
    isin: r.isin ?? `TICKER:${r.ticker}`,
    name,
    shortName: name.replace(/\b(UCITS|ETF|Acc|Dist|Accumulation|Distributing|USD|EUR|\(.*?\))\b/gi, "").replace(/\s+/g, " ").trim().slice(0, 32) || name,
    ticker: r.ticker,
    currency: r.currency ?? "EUR",
    assetClass,
    govBondShare: isGov ? 1 : 0,
  };
}

const inputCls = "h-7 w-full min-w-0 bg-transparent text-[17px] text-ink outline-none placeholder:text-faint";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block border-b border-sep px-4 pb-2.5 pt-3 last:border-0 focus-within:bg-panel-2">
      <span className="block text-[12px] font-medium text-mut">{label}</span>
      <span className="mt-0.5 block">{children}</span>
      {hint && <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

/** "1.234,56" o "1234.56" → 1234.56 */
function num(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return 0;
  // In italiano il punto separa le migliaia: "12.500" = 12500, "1.234,56" = 1234.56.
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, "")
      : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

