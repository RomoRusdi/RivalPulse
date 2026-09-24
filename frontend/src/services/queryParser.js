const KNOWN_TICKERS = [
  "ISAT",
  "TLKM",
  "EXCL",
];

export function parseResearchQuestion(question) {
  const upperQuestion = question.toUpperCase();

  const foundTickers = KNOWN_TICKERS.filter((ticker) =>
    new RegExp(`\\b${ticker}\\b`).test(upperQuestion)
  );

  if (foundTickers.length === 0) {
    return {
      company: null,
      competitors: [],
    };
  }

  const company = foundTickers[0];

  const competitors = foundTickers.slice(1);

  return {
    company,
    competitors,
  };
}