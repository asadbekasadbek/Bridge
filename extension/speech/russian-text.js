const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
const form = (n, forms) => forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];
function triplet(n, feminine = false) {
  const words = [hundreds[Math.floor(n / 100)]];
  n %= 100;
  if (n >= 10 && n <= 19) words.push(teens[n - 10]);
  else words.push(tens[Math.floor(n / 10)], feminine && n % 10 === 1 ? "одна" : feminine && n % 10 === 2 ? "две" : ones[n % 10]);
  return words.filter(Boolean).join(" ");
}
export function numberWords(value, feminine = false) {
  if (value.length > 9 || /^0\d/.test(value)) return [...value].map((digit) => digit === "0" ? "ноль" : ones[Number(digit)]).join(" ");
  let n = Number(value);
  if (!n) return "ноль";
  const words = [];
  for (const [divisor, forms, fem] of [[1000000, ["миллион", "миллиона", "миллионов"], false], [1000, ["тысяча", "тысячи", "тысяч"], true]]) {
    const part = Math.floor(n / divisor);
    if (part) words.push(triplet(part, fem), form(part, forms));
    n %= divisor;
  }
  if (n) words.push(triplet(n, feminine));
  return words.join(" ");
}
const latin = { a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "дж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з" };
export function normalizeRussian(input) {
  return input.replace(/[«»“”„]/g, '"').replace(/[—–]/g, "-").replace(/…/g, "...")
    .replace(/\d+[.,]\d+/g, (value) => {
      const [whole, fraction] = value.split(/[.,]/);
      const ending = [["десятая", "десятых", "десятых"], ["сотая", "сотых", "сотых"], ["тысячная", "тысячных", "тысячных"]][fraction.length - 1];
      return ending ? `${numberWords(whole, true)} ${form(Number(whole), ["целая", "целых", "целых"])} ${numberWords(String(Number(fraction)), true)} ${form(Number(fraction), ending)}` : `${numberWords(whole)} и ${numberWords(fraction)}`;
    })
    .replace(/\d+/g, (value) => numberWords(value))
    .replace(/%/g, " процентов ").replace(/&/g, " и ")
    .replace(/\p{Script=Latin}+/gu, (word) => word.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""))
    .replace(/[a-z]+/gi, (word) => word.toLowerCase().replace(/sh/g, "ш").replace(/ch/g, "ч").replace(/ph/g, "ф").replace(/th/g, "с").replace(/[a-z]/g, (letter) => latin[letter]))
    .replace(/[^а-яёА-ЯЁ\s,.?!;:'"()\-+]/g, " ").replace(/\s+/g, " ").trim();
}
export function speechChunks(text, limit = 160) {
  const chunks = [];
  while (text.length > limit) {
    const head = text.slice(0, limit + 1);
    const boundary = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "), head.lastIndexOf(", "), head.lastIndexOf("; "));
    const cut = boundary >= 40 ? boundary + 1 : head.lastIndexOf(" ") > 0 ? head.lastIndexOf(" ") : limit;
    chunks.push(text.slice(0, cut).trim()); text = text.slice(cut).trim();
  }
  if (text) chunks.push(text);
  return chunks;
}
