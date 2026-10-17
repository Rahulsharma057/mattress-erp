// Converts a rupee amount into words using the Indian numbering system (lakh/crore), for
// printed receipt/payment vouchers - e.g. 1,25,450 -> "One Lakh Twenty Five Thousand Four
// Hundred Fifty". Paise are dropped (receipts conventionally round to the rupee in words).
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
};

const threeDigits = (n) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundred ? `${ONES[hundred]} Hundred${rest ? " " : ""}` : ""}${rest ? twoDigits(rest) : ""}`;
};

const amountInWords = (amount) => {
  let n = Math.round(Math.abs(amount || 0));
  if (n === 0) return "Zero Rupees Only";

  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const hundreds = n;

  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundreds) parts.push(threeDigits(hundreds));

  return `Rupees ${parts.join(" ")} Only`;
};

module.exports = { amountInWords };
