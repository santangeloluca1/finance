---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/posizioni/page.tsx","src/app/fisco/page.tsx","src/app/movimenti/page.tsx"]
---

# Surface brief: app (Panoramica, Posizioni, Dettaglio, Fisco, Movimenti, Impostazioni)

Scope: tutta la PWA mobile (iPhone, installata in Home). Mode: operate.
Audience/job: investitore privato italiano; check rapidi più volte al giorno + analisi con calma.
Constraints: tema chiaro e scuro (segue iPhone + interruttore manuale); grafico complessivo in testa con filtri banca, periodo e asset class; sotto i singoli titoli con filtro periodo; loghi dei titoli; dividendi e cedole; analisi.

## Direction contract

FORM: canon (category standard played straight; bar: getquin, Trade Republic, Revolut). seed:2cc54cfc8080f04e
THESIS: Una app finanziaria iOS di categoria eseguita con cura da prodotto top: prima il patrimonio e il suo grafico, poi i titoli. Rifiuta la griglia di riquadri uguali: gerarchia data da scala tipografica, grafico a tutta larghezza senza contenitore, liste raggruppate stile iOS, insight in una fila orizzontale.
OWN-WORLD: fondo neutro (grigio freddo chiarissimo / nero puro), pannelli raggruppati bianchi / grafite, un solo accento indaco per selezione e azioni, verde e rosso solo per guadagno/perdita, colori banca solo come punti identificativi. Font di sistema SF, numeri tabellari, cifra principale 44px bold. Loghi emittenti rotondi.
STORY: apro → vedo valore e variazione di oggi → filtro banca/asset/periodo e scorro il grafico col dito → sotto vedo ogni titolo con logo e variazione nel periodo scelto → tocco per dettaglio, simulatore, fisco.
FIRST VIEWPORT: valore totale grande, variazione oggi, chip banche + selettore asset class, grafico full-bleed con sfumatura e scrubbing, periodi 1S…MAX, inizio della lista titoli.
SIGNATURE: il grafico scrubbabile che aggiorna il numero grande in tempo reale, con toggle Valore/Rendimento che toglie l'effetto dei versamenti.
RISK: familiarità; si regge solo sulla qualità di dettaglio (spaziature, stati, temi, loghi).
