# Basis

Tracker personale degli investimenti (Fineco, Isybank, Revolut) pensato per l'iPhone
e per il **fisco italiano**: prezzo medio di carico ponderato, zainetto fiscale,
simulatore di vendita.

## Cosa fa già

- **Motore fiscale** (`src/lib/engine`), coperto da test:
  - prezzo medio ponderato (art. 68 TUIR) **per ogni intermediario**, commissioni incluse
  - redditi di capitale (plus da ETF, non compensabili) e redditi diversi
  - zainetto per conto, con scadenza al 31/12 del 4° anno e compensazione dalle minus più vecchie
  - aliquota effettiva 12,5% sulla quota di titoli di Stato (anche negli ETF obbligazionari)
  - cambio storico per i titoli in valuta, split, cedole/dividendi
  - simulatore di vendita (tasse, minus usate, incasso netto)
- **Quotazioni** Yahoo Finance aggiornate ogni 5 minuti (cache server 60 s), cambi BCE
- **Schermate**: Panoramica (grafico con scrubbing, KPI, allocazione), Posizioni
  (per strumento o per broker), Dettaglio con simulatore, Fisco (riepilogo annuo,
  zainetto, suggerimenti per recuperare le minus, bollo e TER), Movimenti (backup/ripristino JSON)
- **PWA**: installabile sull'iPhone da Safari → Condividi → *Aggiungi alla schermata Home*;
  tema chiaro/scuro automatico

I dati restano nel browser (localStorage). All'avvio c'è un portafoglio di esempio
con prezzi storici reali.

## Avvio

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # test del motore fiscale
```

## Deploy

Il modo più semplice è Vercel (piano gratuito): importa il repository e pubblica.
Il piano Hobby di Vercel non permette job pianificati più di una volta al giorno: per
l'aggiornamento ogni 5 minuti l'app interroga le quotazioni quando è aperta; i job in
background (storico, avvisi) andranno su Supabase pg_cron o Cloudflare Workers.

## Roadmap

1. **Import dalle banche**: parser per gli export di Fineco, Isybank e Revolut
   (in attesa dei file di esempio), con mappatura ISIN → ticker via OpenFIGI
2. **Sincronizzazione** tra dispositivi con Supabase (login + Postgres)
3. **Performance**: TWR e XIRR, confronto con benchmark
4. **Riconciliazione**: confronto del prezzo medio calcolato con quello della banca
5. **X-ray degli ETF** (paesi, settori, sovrapposizioni), ribilanciamento con i nuovi versamenti, PAC
6. **Avvisi** push (PWA su iOS) per minus in scadenza, cali e cedole
7. Obbligazioni e certificati (quotazioni MOT/SeDeX)

> Stime a scopo informativo: in regime amministrato fa fede il calcolo della banca.
