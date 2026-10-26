// Порт g2p из vosk_tts (g2p.py): правила для слов вне словаря.

const SOFT = new Set([..."яёюиье"]);
const STARTSYL = new Set([..."#ъьаяоёуюэеиы-"]);
const OTHERS = new Set(["#", "+", "-", "ь", "ъ"]);
const SOFTHARD = { б: "b", в: "v", г: "g", Г: "g", д: "d", з: "z", к: "k", л: "l", м: "m", н: "n", п: "p", р: "r", с: "s", т: "t", ф: "f", х: "h" };
const OTHER_CONS = { ж: "zh", ц: "c", ч: "ch", ш: "sh", щ: "sch", й: "j" };
const VOWELS = { а: "a", я: "a", у: "u", ю: "u", о: "o", ё: "o", э: "e", е: "e", и: "i", ы: "y" };

export function convert(word) {
  const ph = [];
  let stress = 0;
  for (const c of "#" + word + "#") {
    if (c === "+") stress = 1;
    else { ph.push([c, stress]); stress = 0; }
  }
  for (let i = 0; i < ph.length - 1; i++) {
    const c = ph[i][0];
    if (c in SOFTHARD) ph[i] = [SOFTHARD[c] + (SOFT.has(ph[i + 1][0]) ? "j" : ""), 0];
    if (c in OTHER_CONS) ph[i] = [OTHER_CONS[c], 0];
  }
  const out = [];
  let prev = "";
  for (const [c, s] of ph) {
    if (STARTSYL.has(prev) && "яюеё".includes(c)) out.push("j");
    out.push(c in VOWELS ? VOWELS[c] + s : c);
    prev = c;
  }
  return out.filter((x) => !OTHERS.has(x));
}

const SPLIT = /(\.\.\.|- |[ ,.?!;:"()])/;
const IS_DELIM = /^(\.\.\.|- |[ ,.?!;:"()])/;

/** Фонемы + пунктуация → строки признаков `[phoneme, punct, quote, lastPunct, lastSent]` и индексы BERT-эмбеддингов. */
export function g2pMultistream(text, dic, phonemeIdMap, bert) {
  const ph = [["^", [], 0, 0]];
  text = text.replaceAll(" -", "- ");
  let inQuote = 0, curPunc = [], bi = 1;
  for (const w of text.toLowerCase().split(SPLIT)) {
    if (w === "" || w === undefined) continue;
    if (w === '"') { inQuote = inQuote ? 0 : 1; continue; }
    if (w === "- " || w === "-") { curPunc.push("-"); continue; }
    if (IS_DELIM.test(w) && w !== " ") { curPunc.push(w); continue; }
    if (w === " ") { ph.push([" ", curPunc, inQuote, bi]); curPunc = []; continue; }
    const wp = dic.has(w) ? dic.get(w).split(/\s+/) : convert(w);
    for (const p of wp) ph.push([p, [], inQuote, bi]);
    curPunc = [];
    bi++;
  }
  ph.push([" ", curPunc, inQuote, bi]);
  ph.push(["$", [], 0, bi]);

  let lastPunc = " ", lastSent = " ";
  const rows = [], embs = [];
  for (let k = ph.length - 1; k >= 0; k--) {
    const [p, pc, q, b] = ph[k];
    if (pc.includes("...")) lastSent = "...";
    else if (pc.includes(".")) lastSent = ".";
    else if (pc.includes("!")) lastSent = "!";
    else if (pc.includes("?")) lastSent = "?";
    else if (pc.includes("-")) lastSent = "-";
    if (pc.length) lastPunc = pc[0];
    const cur = pc.length ? pc[0] : "_";
    rows.push([phonemeIdMap[p], phonemeIdMap[cur], q, phonemeIdMap[lastPunc], phonemeIdMap[lastSent]]);
    embs.push(bert[b]);
  }
  rows.reverse(); embs.reverse();
  return { rows, embs };
}
