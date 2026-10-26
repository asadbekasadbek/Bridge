const entities = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", ndash: "–", mdash: "—" };
const soundCue = /[\[(]\s*(?:music|musical interlude|applause|laughter|laughs?|laughing|sighs?|sighing|silence|inaudible|музыка|аплодисменты|смех|смеётся|вздох|вздыхает|тишина|неразборчиво)\s*[\])]/gi;

export function cleanSpeechText(input, language = "ru-RU") {
  if (typeof input !== "string") return "";
  let text = input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== "#") return entities[entity.toLowerCase()] ?? match;
    const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : " ";
  });
  text = text.replace(/<[^>]*>/g, " ").replace(/\{\\[^}]*\}/g, " ").replace(soundCue, " ");
  const russianMarkup = language.startsWith("ru") && (/[А-Яа-яЁё]/.test(text) || /^i$/i.test(text.replace(/[^\p{L}]/gu, "")));
  text = text.replace(/[\u0000-\u001f\u200b-\u200d\ufeff\ufe0f]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[<>*_`~#|•♪♫♬★☆]/g, " ")
    .replace(/[\[\]{}]/g, " ")
    .replace(/(^|[\s,.;:!?…()[\]])\/?i(?=$|[\s,.;:!?…()[\]])/gi, (match, prefix) => {
      // Keep the English pronoun. In Russian captions a stray i is often
      // italic markup or a word-sized rolling fragment, not spoken dialogue.
      return russianMarkup ? prefix : match;
    })
    .replace(/(?:^|\s)[—–-]+\s*/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([,;:!?])\1+/g, "$1")
    .replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(text) ? text : "";
}

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function speechMarkup(text) {
  // Let the native voice interpret questions, emphasis and sentence endings.
  // Replacing punctuation with fixed breaks erases those cues and also breaks
  // abbreviations. Only our own XML wrapper is allowed through to the engine.
  return `<?xml version="1.0"?><speak>${escapeXml(text)}</speak>`;
}
