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
- **Analisi**: rendimento TWR e XIRR, confronto con benchmark, X-ray degli ETF (paesi,
  settori, sovrapposizioni), riconoscimento dei PAC, ribilanciamento con i nuovi versamenti,
  obiettivi con simulazione Monte Carlo, consulente AI (Gemini)
- **Schermate**: Panoramica (grafico con scrubbing, KPI, allocazione), Posizioni
  (per strumento o per broker), Dettaglio con simulatore, Fisco (riepilogo annuo,
  zainetto, suggerimenti per recuperare le minus, bollo e TER), Movimenti, operazioni
  ricorrenti, Avvisi, Impostazioni → Dati (backup, ripristino, versioni precedenti)
- **PWA**: installabile sull'iPhone da Safari → Condividi → *Aggiungi alla schermata Home*;
  tema chiaro/scuro automatico; si apre anche offline con le schermate già visitate

## Dati e sincronizzazione

Accesso con email e password (Better Auth). Il portafoglio è **un documento JSON per
utente** nella tabella `portfolio` di Postgres (Neon su Vercel); il telefono ne tiene una
copia in localStorage per aprire subito l'app e lavorare offline. Ogni modifica parte
dopo un secondo; se nel frattempo un altro dispositivo ha salvato, il server risponde
409, l'app unisce le due versioni (per id, con un registro delle cancellazioni così un
elemento eliminato non ritorna) e riprova.

**Versioni precedenti**: prima di sovrascrivere il documento il server ne conserva una
copia (`portfolio_snapshot`) al massimo ogni 6 ore, e sempre quando spariscono dei
movimenti o prima di un ripristino; restano le ultime 30. Si ripristinano da
*Impostazioni → Dati e backup*. I backup importati vengono controllati (forma e
coerenza dei movimenti) prima di toccare i dati.

Finché non inserisci il primo movimento l'app mostra un portafoglio di esempio con prezzi
storici reali, che non viene mai sincronizzato.

## Avvio

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # test del motore fiscale e dei moduli puri
npm run typecheck
```

La CI (`.github/workflows/ci.yml`) esegue typecheck, test e build su ogni pull request.

## Variabili d'ambiente

| Variabile | A cosa serve |
| --- | --- |
| `DATABASE_URL` (o `POSTGRES_URL`) | Postgres/Neon. Senza, le API dei dati rispondono 503 |
| `DATABASE_SSL_INSECURE` | `1` accetta certificati non verificati (solo reti fidate; di default TLS verificato) |
| `BETTER_AUTH_SECRET` | Chiave per firmare le sessioni (almeno 32 caratteri casuali). Obbligatoria |
| `BETTER_AUTH_URL` | Indirizzo pubblico dell'app; su Vercel si ricava da `VERCEL_PROJECT_PRODUCTION_URL` |
| `ALLOWED_EMAILS` | Email abilitate a registrarsi, separate da virgola. **Consigliata**: senza, può registrarsi solo il primo account |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Consulente AI (modello facoltativo) |
| `FINNHUB_API_KEY`, `FMP_API_KEY` | Consenso degli analisti e prezzo obiettivo (facoltative) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifiche push (facoltative: altrimenti le chiavi si generano e restano nel database) |
| `CRON_SECRET` | Autentica i cron di Vercel su `/api/notify/run` |
| `GITHUB_CRON_REPO` | Repository il cui workflow può chiamare `/api/notify/run` con il token OIDC |

## Deploy

Il modo più semplice è Vercel (piano gratuito) con il database Neon dall'integrazione
Storage: importa il repository, imposta le variabili qui sopra e pubblica. Le tabelle
si creano da sole al primo utilizzo. Il piano Hobby permette job pianificati solo una
volta al giorno: le quotazioni si aggiornano quando l'app è aperta, gli avvisi durante
la giornata arrivano dal workflow di GitHub descritto sotto.

## Notifiche push

Avvisi automatici (cali, movimenti del portafoglio, minus in scadenza, cedole, rate,
promemoria, obiettivi, riepilogo serale) e regole personali (prezzo, variazione di oggi,
guadagno sul PMC, valore del portafoglio, peso di un titolo), da **Avvisi → ⚙︎**.

- Su iPhone funzionano solo dalla web app aggiunta alla schermata Home (iOS 16.4+).
- Le chiavi VAPID si generano da sole e restano nel database; in alternativa
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`).
- Su Vercel c'è `CRON_SECRET`: `vercel.json` controlla gli avvisi ogni mattina e ogni sera feriale.
- Durante la giornata il workflow `.github/workflows/notifiche.yml` chiama `/api/notify/run`
  ogni 15 minuti in orario di borsa, autenticandosi con il token OIDC di GitHub (nessun secret).
  L'indirizzo è `https://basis-project.vercel.app`, modificabile con la variabile di repository `APP_URL`.

## Roadmap

1. **Import dalle banche**: parser per gli export di Fineco, Isybank e Revolut
   (in attesa dei file di esempio), con mappatura ISIN → ticker via OpenFIGI
2. ~~**Sincronizzazione** tra dispositivi~~ fatto: Better Auth + Postgres (Neon), con versioni precedenti
3. ~~**Performance**: TWR e XIRR, confronto con benchmark~~ fatto
4. **Riconciliazione**: confronto del prezzo medio calcolato con quello della banca
5. ~~**X-ray degli ETF** (paesi, settori, sovrapposizioni), ribilanciamento con i nuovi versamenti, PAC~~ fatto
6. ~~**Avvisi** push~~ fatto: avvisi automatici e regole personali
7. Obbligazioni e certificati (quotazioni MOT/SeDeX)

> Stime a scopo informativo: in regime amministrato fa fede il calcolo della banca.
