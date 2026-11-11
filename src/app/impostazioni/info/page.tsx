"use client";

import { BackLink, InfoRow, LargeTitle, Panel, SectionHeader } from "@/components/ui";

export default function Informazioni() {
  return (
    <div>
      <BackLink href="/impostazioni" label="Impostazioni" />
      <LargeTitle>Informazioni</LargeTitle>
      <Panel>
        <InfoRow label="Quotazioni" hint="Ogni 5 minuti; borse europee ~15 min di ritardo" value="Yahoo Finance" />
        <InfoRow label="Prezzi serali" hint="Fino alle 22, quando la borsa è chiusa" value="Tradegate" />
        <InfoRow label="Cambi" hint="Riferimento giornaliero" value="BCE" />
        <InfoRow label="Composizione ETF" value="justETF" />
        <InfoRow label="Loghi" value="Parqet" />
        <InfoRow label="Basis AI" hint="Analisi e chat del consulente" value="Google Gemini" />
      </Panel>
      <SectionHeader>Come calcola Basis</SectionHeader>
      <p className="px-4 text-[15px] leading-relaxed text-ink-2">
        Prezzo medio di carico ponderato per ogni intermediario (art. 68 TUIR), redditi di capitale e redditi diversi distinti, zainetto per conto con
        scadenza al quarto anno, aliquota del 12,5% sulla quota in titoli di Stato. Rendimenti ponderati nel tempo: versamenti e prelievi non li falsano.
      </p>
      <p className="px-4 pt-3 text-[13px] leading-snug text-mut">Stime a scopo informativo: in regime amministrato fa fede il calcolo della banca.</p>
      <SectionHeader id="basis-ai">Basis AI</SectionHeader>
      <p className="px-4 text-[15px] leading-relaxed text-ink-2">
        Riceve i numeri calcolati da Basis, mai nome ed email. Per attivarlo serve una chiave di Google Gemini: aggiungila su Vercel, nelle variabili
        d&apos;ambiente del progetto, con il nome <span className="font-semibold">GEMINI_API_KEY</span>, poi pubblica di nuovo l&apos;app.
      </p>
    </div>
  );
}
