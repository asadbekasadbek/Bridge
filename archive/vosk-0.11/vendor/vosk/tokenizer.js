// BERT WordPiece (BertWordPieceTokenizer, lowercase=false).

export class WordPiece {
  constructor(vocabText) {
    this.vocab = new Map();
    vocabText.split("\n").forEach((t, i) => { if (t !== "") this.vocab.set(t.replace(/\r$/, ""), i); });
    this.unk = this.vocab.get("[UNK]");
  }
  static isPunct(ch) {
    const c = ch.codePointAt(0);
    return (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126) || /\p{P}/u.test(ch);
  }
  static isCjk(c) {
    return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x20000 && c <= 0x2a6df) ||
      (c >= 0x2a700 && c <= 0x2ebef) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0x2f800 && c <= 0x2fa1f);
  }
  pieces(word) {
    const chars = [...word];
    if (chars.length > 100) return [{ t: "[UNK]", id: this.unk }];
    const res = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length, found = null;
      while (start < end) {
        let s = chars.slice(start, end).join("");
        if (start > 0) s = "##" + s;
        if (this.vocab.has(s)) { found = { t: s, id: this.vocab.get(s) }; break; }
        end--;
      }
      if (!found) return [{ t: "[UNK]", id: this.unk }];
      res.push(found);
      start = end;
    }
    return res;
  }
  encode(text) {
    let clean = "";
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (c === 0 || c === 0xfffd || /\p{Cc}|\p{Cf}/u.test(ch) && !/\s/.test(ch)) continue;
      clean += /\s/.test(ch) ? " " : WordPiece.isCjk(c) ? ` ${ch} ` : ch;
    }
    const words = [];
    for (const w of clean.split(" ")) {
      if (!w) continue;
      let cur = "";
      for (const ch of w) {
        if (WordPiece.isPunct(ch)) { if (cur) words.push(cur); words.push(ch); cur = ""; } else cur += ch;
      }
      if (cur) words.push(cur);
    }
    const toks = [{ t: "[CLS]", id: this.vocab.get("[CLS]") }];
    for (const w of words) toks.push(...this.pieces(w));
    toks.push({ t: "[SEP]", id: this.vocab.get("[SEP]") });
    return toks;
  }
}
