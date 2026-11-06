/**
 * Quotazione americana (ADR o azione quotata anche a New York) delle principali
 * aziende europee. Serve solo per i dati degli analisti, che i servizi gratuiti
 * hanno per gli USA: prezzi e grafici restano quelli della borsa europea.
 * Tabella fissa e verificata: la ricerca per nome sbaglia (es. "Enel" → Enel Chile).
 */
const ADR: { us: string; isins: string[]; tickers: string[] }[] = [
  // Italia
  { us: "RACE", isins: ["NL0011585146"], tickers: ["RACE.MI"] },
  { us: "E", isins: ["IT0003132476"], tickers: ["ENI.MI"] },
  { us: "STLA", isins: ["NL00150001Q9"], tickers: ["STLAM.MI", "STLAP.PA"] },
  { us: "ENLAY", isins: ["IT0003128367"], tickers: ["ENEL.MI"] },
  { us: "UNCRY", isins: ["IT0005239360"], tickers: ["UCG.MI"] },
  { us: "ISNPY", isins: ["IT0000072618"], tickers: ["ISP.MI"] },
  { us: "ARZGY", isins: ["IT0000062072"], tickers: ["G.MI"] },
  { us: "FINMY", isins: ["IT0003856405"], tickers: ["LDO.MI"] },
  { us: "MONRY", isins: ["IT0004965148"], tickers: ["MONC.MI"] },
  { us: "PRYMY", isins: ["IT0004176001"], tickers: ["PRY.MI"] },
  { us: "TS", isins: ["LU0156801721"], tickers: ["TEN.MI"] },
  { us: "CNH", isins: ["NL0010545661"], tickers: ["CNHI.MI"] },
  { us: "TIIAY", isins: ["IT0003497168"], tickers: ["TIT.MI"] },
  { us: "SNMRY", isins: ["IT0003153415"], tickers: ["SRG.MI"] },
  { us: "TEZNY", isins: ["IT0003242622"], tickers: ["TRN.MI"] },
  { us: "PITAY", isins: ["IT0003796171"], tickers: ["PST.MI"] },
  { us: "MDIBY", isins: ["IT0000062957"], tickers: ["MB.MI"] },
  // Europa
  { us: "ASML", isins: ["NL0010273215"], tickers: ["ASML.AS", "ASME.DE"] },
  { us: "SAP", isins: ["DE0007164600"], tickers: ["SAP.DE"] },
  { us: "NVO", isins: ["DK0062498333"], tickers: ["NOVO-B.CO", "NOVC.DE"] },
  { us: "SHEL", isins: ["GB00BP6MXD84"], tickers: ["SHELL.AS", "SHEL.L"] },
  { us: "UL", isins: ["GB00B10RZP78"], tickers: ["ULVR.L", "UNA.AS"] },
  { us: "TTE", isins: ["FR0000120271"], tickers: ["TTE.PA"] },
  { us: "BP", isins: ["GB0007980591"], tickers: ["BP.L"] },
  { us: "AZN", isins: ["GB0009895292"], tickers: ["AZN.L"] },
  { us: "GSK", isins: ["GB00BN7SWP63"], tickers: ["GSK.L"] },
  { us: "HSBC", isins: ["GB0005405286"], tickers: ["HSBA.L"] },
  { us: "DEO", isins: ["GB0002374006"], tickers: ["DGE.L"] },
  { us: "RIO", isins: ["GB0007188757"], tickers: ["RIO.L"] },
  { us: "SNY", isins: ["FR0000120578"], tickers: ["SAN.PA"] },
  { us: "NVS", isins: ["CH0012005267"], tickers: ["NOVN.SW"] },
  { us: "RHHBY", isins: ["CH0012032048"], tickers: ["ROG.SW"] },
  { us: "NSRGY", isins: ["CH0038863350"], tickers: ["NESN.SW"] },
  { us: "UBS", isins: ["CH0244767585"], tickers: ["UBSG.SW"] },
  { us: "LVMUY", isins: ["FR0000121014"], tickers: ["MC.PA"] },
  { us: "LRLCY", isins: ["FR0000120321"], tickers: ["OR.PA"] },
  { us: "HESAY", isins: ["FR0000052292"], tickers: ["RMS.PA"] },
  { us: "SBGSY", isins: ["FR0000121972"], tickers: ["SU.PA"] },
  { us: "EADSY", isins: ["NL0000235190"], tickers: ["AIR.PA"] },
  { us: "SIEGY", isins: ["DE0007236101"], tickers: ["SIE.DE"] },
  { us: "ALIZY", isins: ["DE0008404005"], tickers: ["ALV.DE"] },
  { us: "IFNNY", isins: ["DE0006231004"], tickers: ["IFX.DE"] },
  { us: "MBGYY", isins: ["DE0007100000"], tickers: ["MBG.DE"] },
  { us: "BMWYY", isins: ["DE0005190003"], tickers: ["BMW.DE"] },
  { us: "VWAGY", isins: ["DE0007664039"], tickers: ["VOW3.DE"] },
  { us: "ADDYY", isins: ["DE000A1EWWW0"], tickers: ["ADS.DE"] },
  { us: "DB", isins: ["DE0005140008"], tickers: ["DBK.DE"] },
  { us: "PHG", isins: ["NL0000009538"], tickers: ["PHIA.AS"] },
  { us: "ING", isins: ["NL0011821202"], tickers: ["INGA.AS"] },
  { us: "NOK", isins: ["FI0009000681"], tickers: ["NOKIA.HE"] },
  { us: "ERIC", isins: ["SE0000108656"], tickers: ["ERIC-B.ST"] },
  { us: "SAN", isins: ["ES0113900J37"], tickers: ["SAN.MC"] },
  { us: "BBVA", isins: ["ES0113211835"], tickers: ["BBVA.MC"] },
  { us: "IBDRY", isins: ["ES0144580Y14"], tickers: ["IBE.MC"] },
  { us: "EQNR", isins: ["NO0010096985"], tickers: ["EQNR.OL"] },
];

export function adrFor(ticker: string, isin?: string | null): string | null {
  return ADR.find((a) => (isin && a.isins.includes(isin)) || a.tickers.includes(ticker))?.us ?? null;
}
