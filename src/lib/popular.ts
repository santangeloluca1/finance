/** Titoli più seguiti dagli investitori italiani: suggerimenti per la ricerca (con ISIN per i loghi). */
export interface Popular {
  ticker: string;
  name: string;
  isin?: string;
  currency: string;
  type: "EQUITY" | "ETF" | "CRYPTOCURRENCY";
}

export const POPULAR: Popular[] = [
  { ticker: "NVDA", name: "NVIDIA", isin: "US67066G1040", currency: "USD", type: "EQUITY" },
  { ticker: "SWDA.MI", name: "iShares Core MSCI World", isin: "IE00B4L5Y983", currency: "EUR", type: "ETF" },
  { ticker: "AAPL", name: "Apple", isin: "US0378331005", currency: "USD", type: "EQUITY" },
  { ticker: "VWCE.DE", name: "Vanguard FTSE All-World", isin: "IE00BK5BQT80", currency: "EUR", type: "ETF" },
  { ticker: "MSFT", name: "Microsoft", isin: "US5949181045", currency: "USD", type: "EQUITY" },
  { ticker: "CSSPX.MI", name: "iShares Core S&P 500", isin: "IE00B5BMR087", currency: "EUR", type: "ETF" },
  { ticker: "BTC-EUR", name: "Bitcoin", currency: "EUR", type: "CRYPTOCURRENCY" },
  { ticker: "TSLA", name: "Tesla", isin: "US88160R1014", currency: "USD", type: "EQUITY" },
  { ticker: "AMZN", name: "Amazon", isin: "US0231351067", currency: "USD", type: "EQUITY" },
  { ticker: "GOOGL", name: "Alphabet", isin: "US02079K3059", currency: "USD", type: "EQUITY" },
  { ticker: "META", name: "Meta Platforms", isin: "US30303M1027", currency: "USD", type: "EQUITY" },
  { ticker: "PLTR", name: "Palantir", isin: "US69608A1088", currency: "USD", type: "EQUITY" },
  { ticker: "ASML.AS", name: "ASML", isin: "NL0010273215", currency: "EUR", type: "EQUITY" },
  { ticker: "RACE.MI", name: "Ferrari", isin: "NL0011585146", currency: "EUR", type: "EQUITY" },
  { ticker: "ISP.MI", name: "Intesa Sanpaolo", isin: "IT0000072618", currency: "EUR", type: "EQUITY" },
  { ticker: "UCG.MI", name: "UniCredit", isin: "IT0005239360", currency: "EUR", type: "EQUITY" },
  { ticker: "ENEL.MI", name: "Enel", isin: "IT0003128367", currency: "EUR", type: "EQUITY" },
  { ticker: "ENI.MI", name: "Eni", isin: "IT0003132476", currency: "EUR", type: "EQUITY" },
  { ticker: "LDO.MI", name: "Leonardo", isin: "IT0003856405", currency: "EUR", type: "EQUITY" },
  { ticker: "STLAM.MI", name: "Stellantis", isin: "NL00150001Q9", currency: "EUR", type: "EQUITY" },
];

export const TYPE_LABEL: Record<string, string> = { EQUITY: "Azione", ETF: "ETF", CRYPTOCURRENCY: "Crypto", MUTUALFUND: "Fondo", INDEX: "Indice", ETC: "ETC" };
