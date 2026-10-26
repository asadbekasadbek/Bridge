// The catalogue does not promise a voice or caption track on this computer or
// video. Existing saved language codes are preserved across upgrades.
const preferred = ["ru-RU", "en-US", "uz-UZ", "kk-KZ", "de-DE", "es-ES"];
const codes = `ab aa af ak sq am ar hy as ay az ba eu be bn bho bs br bg my ca ceb zh co hr cs da dv dz nl en eo es et ee fo fj fil fi fr fy gaa gl lg ka de el gn gu ht ha haw he hi hmn hu is ig id iu ga it ja jv kn kk km ko kha rw kri ku ky lo la lv ln lt lua luo lb mk mg ms ml mt mi mr mfe mn gv ne new no nso ny oc or om os pam pa fa pl pt ps qu ro rn ru sm sg sa gd sr crs st sn sd si sk sl so ss su sw sv tg ta tt te th bo ti to tn ts tr tk tum ug uk ur uz ve vi cy war wo xh yi yo zu`.split(/\s+/);
const savedCodes = { ru: "ru-RU", en: "en-US", uz: "uz-UZ", kk: "kk-KZ", de: "de-DE", es: "es-ES",
  fr: "fr-FR", it: "it-IT", pt: "pt-PT", ar: "ar-SA", hi: "hi-IN", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN", tr: "tr-TR", uk: "uk-UA" };
const names = { ru: "Русский", en: "English", uz: "O‘zbekcha", kk: "Қазақша", de: "Deutsch", es: "Español",
  gaa: "Га", lua: "Луба-лулуа", luo: "Луо", mfe: "Маврикийский креольский", new: "Неварский", pam: "Капампанганский",
  crs: "Сейшельский креольский", tum: "Тумбука", war: "Варайский", kri: "Крио", hmn: "Хмонг" };
const samples = {
  ru: "Привет! Это мой голос для субтитров. Давайте выберем удобную скорость и громкость.",
  en: "Hello! This is my voice for subtitles. Let us choose a comfortable speed and volume.",
  uz: "Salom! Bu subtitrlar uchun mening ovozim. Keling, qulay tezlik va ovoz balandligini tanlaymiz.",
  kk: "Сәлем! Бұл субтитрлерге арналған дауысым. Ыңғайлы жылдамдық пен дыбыс деңгейін таңдайық.",
  de: "Hallo! Das ist meine Stimme für Untertitel. Wählen wir eine angenehme Geschwindigkeit und Lautstärke.",
  es: "¡Hola! Esta es mi voz para los subtítulos. Vamos a elegir una velocidad y un volumen cómodos.",
  fr: "Bonjour ! Voici ma voix pour les sous-titres. Choisissons une vitesse confortable.",
  it: "Ciao! Questa è la mia voce per i sottotitoli. Scegliamo una velocità comoda.",
  pt: "Olá! Esta é a minha voz para as legendas. Vamos escolher uma velocidade confortável.",
  uk: "Привіт! Це мій голос для субтитрів. Виберімо зручну швидкість і гучність.",
  ar: "مرحباً! هذا صوتي لقراءة الترجمة. لنختَر سرعة مريحة.",
  hi: "नमस्ते! यह उपशीर्षकों के लिए मेरी आवाज़ है। आइए एक आरामदायक गति चुनें।",
  ja: "こんにちは。これは字幕を読み上げる声です。聞きやすい速さを選びましょう。",
  ko: "안녕하세요. 자막을 읽어 주는 목소리입니다. 편안한 속도를 선택해 주세요.",
  zh: "你好，这是朗读字幕的声音。请选择舒适的语速。",
  tr: "Merhaba! Bu, altyazılar için sesim. Rahat bir konuşma hızı seçelim.",
  pl: "Cześć! To mój głos do napisów. Wybierzmy wygodną prędkość.",
  nl: "Hallo! Dit is mijn stem voor ondertitels. Laten we een prettige snelheid kiezen."
};
const display = new Intl.DisplayNames(["ru"], { type: "language" });
const catalogue = codes.map((base) => {
  const label = names[base] || display.of(base);
  let nativeName = base;
  try { nativeName = new Intl.DisplayNames([base], { type: "language" }).of(base); } catch { /* An uncommon locale can be unavailable. */ }
  return Object.freeze({ code: savedCodes[base] || base, name: label[0].toLocaleUpperCase() + label.slice(1), sample: samples[base] || nativeName });
});
catalogue.sort((left, right) => {
  const leftPriority = preferred.indexOf(left.code), rightPriority = preferred.indexOf(right.code);
  if (leftPriority !== -1 || rightPriority !== -1) return (leftPriority === -1 ? preferred.length : leftPriority) - (rightPriority === -1 ? preferred.length : rightPriority);
  return left.name.localeCompare(right.name, "ru");
});
export const LANGUAGES = Object.freeze(catalogue);
