export function describeSpeechEvent(event) {
  switch (event?.type) {
    case "loading": return { text: event.message || "Готовим встроенный голос…", speaking: true, error: false };
    case "start": return { text: "Сейчас звучит локальный голос.", speaking: true, error: false };
    case "end": return { text: "Проверка завершена. Как вам звучание?", speaking: false, error: false };
    case "stopped":
    case "cancelled":
    case "interrupted": return { text: "Озвучка остановлена.", speaking: false, error: false };
    case "error": return { text: event.error || "Системный голос не смог произнести текст. Попробуйте другой локальный голос.", speaking: false, error: true };
    default: return null;
  }
}
