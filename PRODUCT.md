# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un singolo investitore privato italiano (uso personale). Investe tramite Fineco, Isybank e Revolut, tutti in regime amministrato, soprattutto in ETF (azionari e obbligazionari), oltre ad azioni e in futuro obbligazioni e certificati. Usa l'app dall'iPhone, installata come web app nella schermata Home. Due modalità d'uso: check rapidi più volte al giorno, spesso in giro, e sessioni di analisi più calme.

## Product Purpose

Aggregare tutti i conti titoli in un'unica vista e calcolare plus/minus come in Italia: prezzo medio di carico ponderato per intermediario, non FIFO. Sostituisce getquin, che usa il FIFO e falsa percentuali e grafici, e offre gratis le funzioni che lì sono premium. Successo: i numeri coincidono con quelli delle banche e l'utente capisce l'andamento del portafoglio a colpo d'occhio.

## Positioning

Fiscalità italiana come motore, non come appendice: PMC per banca, redditi di capitale e redditi diversi distinti, zainetto per intermediario con scadenze, aliquota effettiva 12,5% sui titoli di Stato, simulatore di vendita e "netto se vendi oggi".

## Operating Context

- Apertura dell'app: prima viene il grafico complessivo del portafoglio, filtrabile per banca, periodo e asset class. Sotto, i singoli titoli, anch'essi con filtro sul periodo.
- I dati arrivano dagli export delle banche, da importare periodicamente. Quotazioni ogni 5 minuti, con ~15 min di ritardo sulle borse europee.

## Capabilities and Constraints

- Funzioni attese, riprese da getquin: loghi dei titoli, dividendi e cedole (calendario e previsione), analisi e insight (esposizione per paese e settore, benchmark), grafico interattivo da scorrere col dito.
- Tema chiaro e scuro: segue l'impostazione dell'iPhone, con interruttore manuale.
- Next.js PWA, dati per ora in localStorage; poi Supabase.
- Fondi comuni esclusi. Obbligazioni e certificati rimandati.

## Brand Commitments

Nome provvisorio "Portafoglio". Lingua italiana. Nessun marchio da riprodurre. Getquin, Trade Republic e simili sono riferimenti di qualità e di funzionalità, non da copiare.

## Evidence on Hand

Portafoglio di esempio con prezzi storici reali e operazioni fittizie (`src/lib/demo.ts`), etichettato come esempio nell'interfaccia. Export reali delle banche non ancora forniti.

## Product Principles

1. I numeri devono coincidere con quelli della banca: la correttezza fiscale viene prima di tutto.
2. Prima l'insieme, poi il dettaglio: grafico complessivo in alto, singoli titoli sotto.
3. Il check rapido richiede pochi secondi; l'analisi è a un tocco di distanza, non in primo piano.
4. Gratis e personale: nessuna funzione bloccata.
