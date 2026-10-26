(() => {
  // This module only touches registered Bridge roots. Website captions, input
  // values, voice identities and the host site's language are never translated.
  const languages = Object.freeze([
    { code: "ru", name: "Русский" }, { code: "en", name: "English" }, { code: "uz", name: "O‘zbekcha" }
  ]);
  const normalize = value => languages.some(item => item.code === value) ? value : "ru";
  let locale = "ru";
  const roots = new Set(), listeners = new Set(), languageCache = new Map();
  const messages = [
    // BEGIN MESSAGES
    ["Язык интерфейса Bridge", "Bridge interface language", "Bridge interfeysi tili"],
    ["Только кнопки и настройки. Языки видео и голоса не меняются.", "Buttons and settings only. Video and voice languages stay the same.", "Faqat tugmalar va sozlamalar. Video va ovoz tillari o‘zgarmaydi."],
    ["Не удалось сохранить язык интерфейса.", "Could not save the interface language.", "Interfeys tilini saqlab bo‘lmadi."],
    ["Настройки Bridge", "Bridge settings", "Bridge sozlamalari"],
    ["Настройки голоса", "Voice settings", "Ovoz sozlamalari"],
    ["Настройки перевода Bridge", "Bridge translation settings", "Bridge tarjima sozlamalari"],
    ["Bridge — настройки голоса", "Bridge — voice settings", "Bridge — ovoz sozlamalari"],
    ["Язык видео", "Video language", "Video tili"],
    ["Исходные субтитры", "Source subtitles", "Asl subtitrlar"],
    ["Перевести и озвучить на", "Translate and read in", "Tarjima va ovoz tili"],
    ["Переводить и озвучивать на", "Translate and read in", "Tarjima va ovoz tili"],
    ["Озвучить субтитры на", "Read subtitles in", "Subtitrlarni o‘qish tili"],
    ["Язык озвучки", "Voice language", "Ovoz tili"],
    ["Автоматически", "Automatic", "Avtomatik"],
    ["Авто", "Auto", "Avto"],
    ["Авто · по звучанию", "Auto · from audio", "Avto · tovush bo‘yicha"],
    ["Показывать субтитры на видео", "Show subtitles on the video", "Videoda subtitrlarni ko‘rsatish"],
    ["Можно скрыть текст и оставить озвучку. Выбор сохраняется автоматически и действует, пока включён Bridge.", "Hide the text and keep the voice. This choice is saved automatically and applies while Bridge is on.", "Matnni yashirib, ovozni qoldirish mumkin. Tanlov avtomatik saqlanadi va Bridge yoqilganida amal qiladi."],
    ["Голос озвучки", "Subtitle voice", "Subtitrlar ovozi"],
    ["Режим голоса в видео", "Video voice mode", "Videodagi ovoz rejimi"],
    ["Женский", "Female", "Ayol"],
    ["Мужской", "Male", "Erkak"],
    ["женский", "female", "ayol"],
    ["мужской", "male", "erkak"],
    ["другой", "another", "boshqa"],
    ["не установлен", "not installed", "o‘rnatilmagan"],
    ["тип не указан", "type not specified", "turi ko‘rsatilmagan"],
    ["Тип не указан", "Type not specified", "Turi ko‘rsatilmagan"],
    ["Для выбранного режима голос не установлен. Выберите подходящий пакет ниже или другой режим.", "No voice is installed for this mode. Choose a suitable pack below or another mode.", "Bu rejim uchun ovoz o‘rnatilmagan. Quyidan mos paket yoki boshqa rejimni tanlang."],
    ["Авто подбирает мужской или женский голос по коротким фрагментам звука. Может ошибаться. Ниже можно установить доступные голоса Bridge.", "Auto uses short audio samples to choose a male or female voice. It can be wrong. Install available Bridge voices below.", "Avto qisqa tovush parchalariga qarab erkak yoki ayol ovozini tanlaydi. Adashishi mumkin. Mavjud Bridge ovozlarini quyida o‘rnating."],
    ["Авто слушает оригинал. Пока тембр не определён, используется доступный голос.", "Auto listens to the original audio. An available voice is used until a voice type is detected.", "Avto asl tovushni tinglaydi. Tembr aniqlanguncha mavjud ovoz ishlatiladi."],
    ["Пока нет звука для определения тембра. Можно выбрать «Женский» или «Мужской» вручную; иначе звучит доступный голос.", "No audio is available for voice detection yet. Choose Female or Male manually, or use the available voice.", "Tembrni aniqlash uchun tovush hali yo‘q. Ayol yoki Erkak ovozini qo‘lda tanlang yoki mavjud ovozdan foydalaning."],
    ["Звук есть, но тембр пока не распознан. Музыка и несколько голосов могут мешать. Можно выбрать голос вручную.", "Audio is present, but the voice type is unclear. Music or multiple speakers can interfere. You can choose a voice manually.", "Tovush bor, ammo tembr hali aniqlanmagan. Musiqa yoki bir nechta ovoz xalaqit berishi mumkin. Ovozni qo‘lda tanlash mumkin."],
    ["Громкость озвучки", "Speech volume", "O‘qish ovozi balandligi"],
    ["Громкость голоса", "Voice volume", "Ovoz balandligi"],
    ["Приглушать видео во время озвучки", "Lower original audio during speech", "O‘qish paytida asl tovushni pasaytirish"],
    ["Сила приглушения оригинала", "Original audio reduction", "Asl tovushni pasaytirish darajasi"],
    ["Приглушение выключено: оригинал звучит с громкостью плеера.", "Audio reduction is off: the original uses the player's volume.", "Tovushni pasaytirish o‘chiq: asl tovush pleyer balandligida yangraydi."],
    ["При 0% оригинал не приглушается. Увеличьте силу приглушения.", "At 0%, the original audio is unchanged. Increase the reduction level.", "0% da asl tovush pasaymaydi. Pasaytirish darajasini oshiring."],
    ["Громкость голоса меняется со следующей реплики.", "Voice volume changes from the next utterance.", "Ovoz balandligi keyingi jumladan o‘zgaradi."],
    ["В коротких паузах уровень сохраняется, затем плавно восстанавливается.", "The level is held through short gaps, then restored smoothly.", "Qisqa tanaffuslarda daraja saqlanadi, keyin asta tiklanadi."],
    ["Сохранено.", "Saved.", "Saqlandi."],
    ["Сохраняем…", "Saving…", "Saqlanmoqda…"],
    ["0% — оригинал без изменений, 100% — без оригинала на время речи. Настройки сохраняются автоматически.", "0% keeps the original unchanged; 100% removes it during speech. Settings are saved automatically.", "0% asl tovushni o‘zgartirmaydi, 100% o‘qish paytida uni o‘chiradi. Sozlamalar avtomatik saqlanadi."],
    ["Скрыть стороннюю кнопку скачивания", "Hide the third-party download button", "Begona yuklab olish tugmasini yashirish"],
    ["Убирает кнопку All-in-One Downloader, которая открывает другой сайт. Озвучка Bridge не требует скачивания видео.", "Hides the All-in-One Downloader button that opens another site. Bridge speech does not require downloading videos.", "Boshqa saytni ochadigan All-in-One Downloader tugmasini yashiradi. Bridge orqali o‘qish uchun videoni yuklab olish shart emas."],
    ["Убирает кнопку All-in-One Downloader на YouTube, которая открывает другой сайт. Переключатель сохраняется сразу.", "Hides the All-in-One Downloader button on YouTube that opens another site. The choice is saved immediately.", "YouTube’dagi boshqa saytni ochadigan All-in-One Downloader tugmasini yashiradi. Tanlov darhol saqlanadi."],
    ["Повторить запуск", "Try again", "Qayta ishga tushirish"],
    ["Озвучить субтитры", "Read subtitles aloud", "Subtitrlarni ovozli o‘qish"],
    ["Отключить", "Turn off", "O‘chirish"],
    ["Отключить озвучку", "Turn off speech", "Ovozli o‘qishni o‘chirish"],
    ["Включить озвучку", "Turn on speech", "Ovozli o‘qishni yoqish"],
    ["Приостановить озвучку", "Pause speech", "Ovozli o‘qishni to‘xtatish"],
    ["Отменить запуск", "Cancel startup", "Ishga tushirishni bekor qilish"],
    ["Отменить запуск озвучки", "Cancel speech startup", "Ovozli o‘qishni boshlashni bekor qilish"],
    ["Озвучка выключена.", "Speech is off.", "Ovozli o‘qish o‘chiq."],
    ["Озвучка остановлена.", "Speech stopped.", "Ovozli o‘qish to‘xtatildi."],
    ["Озвучка отменена.", "Speech cancelled.", "Ovozli o‘qish bekor qilindi."],
    ["Озвучка ждёт продолжения видео.", "Speech is waiting for video playback.", "Ovozli o‘qish video davom etishini kutmoqda."],
    ["Озвучка включена в другой вкладке.", "Speech was enabled in another tab.", "Ovozli o‘qish boshqa varaqda yoqildi."],
    ["Озвучка видео остановлена для проверки голоса.", "Video speech was stopped for the voice preview.", "Ovozni sinash uchun videoni ovozli o‘qish to‘xtatildi."],
    ["Озвучка отключена. Нажмите кнопку, чтобы включить снова.", "Speech is off. Press the button to turn it on again.", "Ovozli o‘qish o‘chiq. Qayta yoqish uchun tugmani bosing."],
    ["Откройте видео YouTube.", "Open a YouTube video.", "YouTube videosini oching."],
    ["Открывается другое видео. Включите озвучку после перехода.", "Another video is opening. Enable speech after navigation.", "Boshqa video ochilmoqda. O‘tgandan so‘ng ovozli o‘qishni yoqing."],
    ["Видео изменилось. Включите озвучку для нового видео.", "The video changed. Enable speech for the new video.", "Video o‘zgardi. Yangi video uchun ovozli o‘qishni yoqing."],
    ["Плеер изменился. Включите озвучку для нового видео.", "The player changed. Enable speech for the new video.", "Pleyer o‘zgardi. Yangi video uchun ovozli o‘qishni yoqing."],
    ["Видео закончилось. Можно отключить озвучку.", "The video ended. You can turn speech off.", "Video tugadi. Ovozli o‘qishni o‘chirish mumkin."],
    ["Меняем исходный язык…", "Changing the source language…", "Asl til o‘zgartirilmoqda…"],
    ["Меняем язык озвучки…", "Changing the voice language…", "Ovoz tili o‘zgartirilmoqda…"],
    ["Сохраняем язык…", "Saving the language…", "Til saqlanmoqda…"],
    ["Сохраняем исходный язык…", "Saving the source language…", "Asl til saqlanmoqda…"],
    ["Сохраняем язык перевода…", "Saving the target language…", "Tarjima tili saqlanmoqda…"],
    ["Выбираем установленный голос…", "Selecting the installed voice…", "O‘rnatilgan ovoz tanlanmoqda…"],
    ["Язык и голос на компьютере", "On-device language and voice", "Kompyuterdagi til va ovoz"],
    ["Использовать", "Use", "Foydalanish"],
    ["Удалить", "Remove", "O‘chirish"],
    ["Источник и условия", "Source and terms", "Manba va shartlar"],
    ["Карточка голоса", "Voice model card", "Ovoz modeli kartasi"],
    ["Голос выбран и сохранён.", "Voice selected and saved.", "Ovoz tanlandi va saqlandi."],
    ["Голос удалён. Его можно установить снова.", "Voice removed. You can install it again.", "Ovoz o‘chirildi. Uni qayta o‘rnatish mumkin."],
    ["Начинаем загрузку выбранного голоса…", "Starting the selected voice download…", "Tanlangan ovozni yuklash boshlanmoqda…"],
    ["Модели сохраняются после закрытия Chrome. Можно удалить ненужный голос и позже скачать снова.", "Models remain after closing Chrome. Remove unused voices and download them again later.", "Chrome yopilgandan keyin modellar saqlanadi. Keraksiz ovozni o‘chirib, keyin qayta yuklash mumkin."],
    ["Отменить загрузку", "Cancel download", "Yuklashni bekor qilish"],
    ["Отменить подготовку", "Cancel preparation", "Tayyorlashni bekor qilish"],
    ["Подготовить локальный перевод", "Prepare local translation", "Mahalliy tarjimani tayyorlash"],
    ["Быстродействие", "Performance", "Ishlash tezligi"],
    ["Экономить память", "Save memory", "Xotirani tejash"],
    ["Для слабого компьютера: один голос в памяти, выгрузка после простоя. Отключите для более быстрого переключения двух голосов.", "For slower computers: keep one voice in memory and unload it when idle. Turn this off to switch between two voices faster.", "Sekin kompyuter uchun: xotirada bitta ovoz, ishlatilmaganda bo‘shatiladi. Ikki ovoz o‘rtasida tezroq almashish uchun bu rejimni o‘chiring."],
    ["Готовые субтитры уже на нужном языке. Локальный пакет перевода не требуется.", "Captions are already in the target language. No local translation pack is needed.", "Subtitrlar kerakli tilda. Mahalliy tarjima paketi kerak emas."],
    ["Перевод: средствами YouTube. Отдельный локальный пакет для этого плеера не нужен.", "Translation is provided by YouTube. This player needs no separate local translation pack.", "Tarjimani YouTube bajaradi. Bu pleyer uchun alohida mahalliy tarjima paketi kerak emas."],
    ["Перевод не нужен: исходный язык совпадает с языком голоса.", "No translation needed: source and voice languages match.", "Tarjima kerak emas: asl til va ovoz tili bir xil."],
    ["Локальный перевод: готов. Дополнительная загрузка сейчас не нужна.", "Local translation is ready. No further download is needed now.", "Mahalliy tarjima tayyor. Hozir qo‘shimcha yuklash kerak emas."],
    ["Локальный перевод: доступен. Можно подготовить только эту пару языков.", "Local translation is available. You can prepare just this language pair.", "Mahalliy tarjima mavjud. Faqat shu til juftligini tayyorlash mumkin."],
    ["Локальный перевод: Chrome готовит нужный языковой пакет.", "Local translation: Chrome is preparing the language pack.", "Mahalliy tarjima: Chrome kerakli til paketini tayyorlamoqda."],
    ["Локальный перевод: браузер не поддерживает Translator. Нужен подходящий Chrome 138+.", "Local translation: this browser does not support Translator. A compatible Chrome 138+ is needed.", "Mahalliy tarjima: brauzer Translator’ni qo‘llamaydi. Mos Chrome 138+ kerak."],
    ["Локальный перевод: эта пара языков не поддерживается на этом устройстве. Установка голоса не добавит перевод.", "Local translation: this language pair is unavailable on this device. Installing a voice will not add translation.", "Mahalliy tarjima: bu qurilmada ushbu til juftligi qo‘llanmaydi. Ovoz o‘rnatish tarjimani qo‘shmaydi."],
    ["Локальный перевод: язык исходных субтитров определится в видео. Пакет загрузится только при первом реальном переводе.", "Local translation: the source caption language will be detected in the video. The pack downloads only for the first actual translation.", "Mahalliy tarjima: asl subtitrlar tili videoda aniqlanadi. Paket faqat birinchi haqiqiy tarjimada yuklanadi."],
    ["стандартное", "standard", "standart"],
    ["повышенное", "high", "yuqori"],
    ["лёгкий пакет", "lightweight", "yengil paket"],
    ["ВАШЕ РАСШИРЕНИЕ", "YOUR EXTENSION", "KENGAYTMANGIZ"],
    ["Только нужные языки", "Only the languages you need", "Faqat kerakli tillar"],
    ["Выберите язык и установите нужный голос. Остальные модели не скачиваются. Ненужные пакеты можно удалить.", "Choose a language and install the voice you need. Other models are not downloaded. Remove packs you no longer need.", "Tilni tanlab, kerakli ovozni o‘rnating. Boshqa modellar yuklanmaydi. Keraksiz paketlarni o‘chirish mumkin."],
    ["НАЧНЁМ С ГЛАВНОГО", "LET'S GET STARTED", "ASOSIYSIDAN BOSHLAYMIZ"],
    ["Настроим ваш голос", "Set up your voice", "Ovozingizni sozlaymiz"],
    ["Выберите язык, послушайте голос и подберите удобную скорость.", "Choose a language, listen to a voice and set a comfortable speed.", "Tilni tanlang, ovozni tinglang va qulay tezlikni belgilang."],
    ["Для языка видео по умолчанию выбрано «Автоматически». При необходимости задайте его вручную. Язык перевода выбирается отдельно. Оба выбора сохраняются сразу.", "The source language defaults to Automatic. Set it manually if needed. Choose the target language separately. Both choices are saved immediately.", "Video tili odatda Avtomatik holatda. Zarur bo‘lsa, uni qo‘lda belgilang. Tarjima tili alohida tanlanadi. Ikkala tanlov ham darhol saqlanadi."],
    ["YouTube, TED, Vimeo, Udemy, Coursera, VK Видео, RUTUBE и Twitch. На YouTube перевод делает сайт. На остальных площадках — готовая дорожка или локальный Translator Chrome 138+. Для первой загрузки языкового пакета нужен интернет; текст остаётся на компьютере. Для закрытого курса войдите в свой аккаунт площадки.", "YouTube, TED, Vimeo, Udemy, Coursera, VK Video, RUTUBE and Twitch. YouTube provides its own translation. Other sites use an available caption track or local Chrome 138+ Translator. The first language-pack download needs internet; text stays on your computer. Sign in to the site for private courses.", "YouTube, TED, Vimeo, Udemy, Coursera, VK Video, RUTUBE va Twitch. YouTube tarjimani o‘zi bajaradi. Boshqa saytlarda tayyor subtitr yoki Chrome 138+ mahalliy Translator ishlatiladi. Birinchi til paketini yuklashga internet kerak; matn kompyuterda qoladi. Yopiq kurs uchun o‘sha saytdagi hisobingizga kiring."],
    ["Языки и звучание", "Languages and sound", "Tillar va tovush"],
    ["Оба языка запоминаются автоматически.", "Both languages are saved automatically.", "Ikkala til ham avtomatik saqlanadi."],
    ["«Автоматически» определяет язык по дорожке YouTube. Ручной выбор использует доступные исходные субтитры на выбранном языке.", "Automatic uses YouTube's caption-track metadata. A manual choice uses available source captions in that language.", "Avtomatik rejim YouTube subtitr yo‘lagiga qarab tilni aniqlaydi. Qo‘lda tanlanganda shu tildagi mavjud asl subtitrlar ishlatiladi."],
    ["Выбор сохраняется сразу. Ниже отдельно показаны доступность перевода и голоса. Установите только тот голос, который хотите слушать.", "Your choice is saved immediately. Translation and voice availability are shown separately below. Install only the voice you want to hear.", "Tanlov darhol saqlanadi. Quyida tarjima va ovoz mavjudligi alohida ko‘rsatiladi. Faqat tinglamoqchi bo‘lgan ovozingizni o‘rnating."],
    ["«Авто» приблизительно подбирает тембр по коротким фрагментам звука, без нейросети. В плеере можно в любой момент выбрать «Женский» или «Мужской» для текущей и следующих реплик. Для проверки ниже используется выбранный локальный голос.", "Auto estimates the voice type from short audio samples without a neural network. Choose Female or Male in the player at any time for current and future utterances. The preview below uses the selected local voice.", "Avto qisqa tovush parchalaridan neyrotarmoqsiz tembrni taxminan tanlaydi. Pleyerda joriy va keyingi jumlalar uchun istalgan payt Ayol yoki Erkakni tanlash mumkin. Quyidagi sinov tanlangan mahalliy ovozdan foydalanadi."],
    ["Локальный голос", "Local voice", "Mahalliy ovoz"],
    ["Обновить список", "Refresh list", "Ro‘yxatni yangilash"],
    ["Проверяем установленные голоса…", "Checking installed voices…", "O‘rnatilgan ovozlar tekshirilmoqda…"],
    ["Локальный голос не найден", "No local voice found", "Mahalliy ovoz topilmadi"],
    ["Сохранённый голос больше недоступен. Выберите другой локальный голос.", "The saved voice is no longer available. Choose another local voice.", "Saqlangan ovoz endi mavjud emas. Boshqa mahalliy ovozni tanlang."],
    ["Для этого языка и типа нет доступного голоса. Установите пакет Bridge ниже или выберите доступный режим.", "No voice is available for this language and type. Install a Bridge pack below or choose another available mode.", "Bu til va tur uchun ovoz mavjud emas. Quyida Bridge paketini o‘rnating yoki boshqa mavjud rejimni tanlang."],
    ["Выбран локальный нейроголос Bridge. Он работает без интернета и использует сохранённую модель.", "A local Bridge neural voice is selected. It uses the saved model and works without internet.", "Mahalliy Bridge neyroovozi tanlangan. U saqlangan modeldan foydalanadi va internetsiz ishlaydi."],
    ["Выбран улучшенный локальный голос. Послушайте пример и сравните звучание.", "An enhanced local voice is selected. Listen to the sample and compare.", "Yaxshilangan mahalliy ovoz tanlangan. Namunani tinglab, tovushni solishtiring."],
    ["Выбран обычный системный голос. Ниже можно установить доступные голоса Bridge или выбрать улучшенный голос ОС.", "A standard system voice is selected. Install an available Bridge voice below or choose an enhanced OS voice.", "Oddiy tizim ovozi tanlangan. Quyidan mavjud Bridge ovozini o‘rnating yoki yaxshilangan tizim ovozini tanlang."],
    ["Настроить естественную речь", "Set up natural speech", "Tabiiy nutqni sozlash"],
    ["Выберем лучший доступный локальный голос, включим чтение фразами и обычную скорость 1×. Сохраним и дадим послушать.", "Select the best available local voice, enable phrase reading and normal 1× speed, then save and preview it.", "Eng yaxshi mavjud mahalliy ovoz, jumlalab o‘qish va oddiy 1× tezlik tanlanadi, so‘ng saqlanib, tinglash uchun qo‘yiladi."],
    ["Когда Bridge включён, можно слушать озвучку без текста на экране. Выбор сохраняется сразу.", "When Bridge is on, you can listen without on-screen text. The choice is saved immediately.", "Bridge yoqilganda ekrandagi matnsiz tinglash mumkin. Tanlov darhol saqlanadi."],
    ["Плавное чтение фразами", "Smooth phrase reading", "Jumlalarni ravon o‘qish"],
    ["Короткие фрагменты объединяются. Знаки вопроса, запятые и точки помогают голосу выбрать интонацию; оформление и пометки звуков пропускаются.", "Short fragments are combined. Questions, commas and periods guide intonation; formatting and sound labels are skipped.", "Qisqa parchalar birlashtiriladi. So‘roq, vergul va nuqtalar ohangga yordam beradi; bezaklar va tovush izohlari o‘qilmaydi."],
    ["Скорость речи", "Speech speed", "O‘qish tezligi"],
    ["Скорость", "Speed", "Tezlik"],
    ["Спокойнее", "Slower", "Sekinroq"],
    ["Быстрее", "Faster", "Tezroq"],
    ["Тише", "Quieter", "Pastroq"],
    ["Громче", "Louder", "Balandroq"],
    ["Оригинал плавно становится тише, пока говорит Bridge. На паузе, после речи и при отключении громкость восстанавливается.", "The original audio fades down while Bridge speaks. Volume returns on pause, after speech and when disabled.", "Bridge gapirganda asl tovush asta pasayadi. Pauzada, nutqdan keyin va o‘chirilganda balandlik tiklanadi."],
    ["0% — без приглушения, 100% — только озвучка во время речи. Исходная громкость задаётся обычным регулятором YouTube. В плеере эти настройки можно менять и сохранять сразу.", "0% means no reduction; 100% means voice only during speech. Set the original volume with YouTube's normal slider. Player settings change and save immediately.", "0% — pasaytirishsiz, 100% — nutq paytida faqat o‘qish ovozi. Asl balandlik YouTube odatiy regulyatori bilan belgilanadi. Pleyer sozlamalari darhol o‘zgarib, saqlanadi."],
    ["Сохранить настройки", "Save settings", "Sozlamalarni saqlash"],
    ["Сбросить", "Reset", "Tiklash"],
    ["Загружаем настройки…", "Loading settings…", "Sozlamalar yuklanmoqda…"],
    ["Настройки загружены с компьютера.", "Settings loaded from this computer.", "Sozlamalar kompyuterdan yuklandi."],
    ["Есть изменения — сохраните настройки.", "You have changes — save your settings.", "O‘zgarishlar bor — sozlamalarni saqlang."],
    ["Настройки сохранены на компьютере.", "Settings saved on this computer.", "Sozlamalar kompyuterda saqlandi."],
    ["Исходный язык сохранён автоматически.", "Source language saved automatically.", "Asl til avtomatik saqlandi."],
    ["Язык перевода сохранён автоматически. Остальные изменения сохраните кнопкой ниже.", "Target language saved automatically. Save other changes with the button below.", "Tarjima tili avtomatik saqlandi. Boshqa o‘zgarishlarni quyidagi tugma bilan saqlang."],
    ["Показ субтитров сохранён.", "Subtitle visibility saved.", "Subtitrlar ko‘rinishi saqlandi."],
    ["Видимость кнопки скачивания сохранена.", "Download button visibility saved.", "Yuklab olish tugmasining ko‘rinishi saqlandi."],
    ["Исходные значения восстановлены. Нажмите «Сохранить настройки».", "Defaults restored. Press Save settings.", "Dastlabki qiymatlar tiklandi. Sozlamalarni saqlashni bosing."],
    ["Настройки обновлены из плеера или другого окна Bridge и уже сохранены.", "Settings were updated from the player or another Bridge window and are already saved.", "Sozlamalar pleyer yoki boshqa Bridge oynasidan yangilandi va saqlandi."],
    ["Лёгкий режим включён по умолчанию: один голос в памяти и выгрузка после минуты простоя. Установленные файлы сохраняются. Для быстрых переключений двух голосов можно отключить экономию памяти. Старые ноутбуки требуют отдельной проверки.", "Light mode is on by default: one voice in memory, unloaded after a minute idle. Installed files remain. Disable memory saving for faster switching between two voices. Older laptops need separate testing.", "Yengil rejim odatda yoqilgan: xotirada bitta ovoz, bir daqiqa ishlatilmasa bo‘shatiladi. O‘rnatilgan fayllar saqlanadi. Ikki ovoz orasida tez almashish uchun xotira tejashni o‘chirish mumkin. Eski noutbuklarda alohida tekshirish kerak."],
    ["Послушайте голос", "Listen to the voice", "Ovozni tinglang"],
    ["Небольшая проверка перед просмотром.", "A quick check before watching.", "Ko‘rishdan oldin qisqa tekshiruv."],
    ["Текст для проверки", "Preview text", "Sinov matni"],
    ["Послушать", "Listen", "Tinglash"],
    ["Проверить голос", "Preview voice", "Ovozni sinash"],
    ["Остановить", "Stop", "To‘xtatish"],
    ["Выберите установленный голос и нажмите «Послушать». Пример звучит на вашем компьютере.", "Choose an installed voice and press Listen. The sample plays on your computer.", "O‘rnatilgan ovozni tanlab, Tinglashni bosing. Namuna kompyuteringizda yangraydi."],
    ["Нужен голос для выбранного языка", "A voice is needed for this language", "Tanlangan til uchun ovoz kerak"],
    ["Нажмите «Установить голоса», если для языка есть пакет. Либо добавьте локальный голос в ОС и обновите список.", "Install a voice if a pack is available for the language. Or add a local OS voice and refresh the list.", "Bu til uchun paket mavjud bo‘lsa, ovozni o‘rnating. Yoki tizimga mahalliy ovoz qo‘shib, ro‘yxatni yangilang."],
    ["При установке скачиваются только файлы модели; текст не отправляется. Речь работает на компьютере. На YouTube перевод делает сайт, на остальных площадках доступен локальный перевод Chrome.", "Installation downloads model files only; text is not sent. Speech runs on your computer. YouTube provides its translation; other sites can use local Chrome translation.", "O‘rnatishda faqat model fayllari yuklanadi; matn yuborilmaydi. Nutq kompyuterda ishlaydi. YouTube tarjimani o‘zi bajaradi, boshqa saytlarda Chrome mahalliy tarjimasi mavjud."],
    ["ЛОКАЛЬНАЯ ОЗВУЧКА ВИДЕО", "LOCAL VIDEO SPEECH", "VIDEONI MAHALLIY O‘QISH"],
    ["Субтитры звучат", "Subtitles become speech", "Subtitrlar ovozga aylanadi"],
    ["Голос для субтитров", "A voice for subtitles", "Subtitrlar uchun ovoz"],
    ["Выберите язык доступных субтитров и локальный голос.", "Choose an available subtitle language and a local voice.", "Mavjud subtitrlar tili va mahalliy ovozni tanlang."],
    ["Настроить голос", "Set up voice", "Ovozni sozlash"],
    ["Голос", "Voice", "Ovoz"],
    ["Нужен локальный голос", "A local voice is needed", "Mahalliy ovoz kerak"],
    ["Ищем видео в текущей вкладке…", "Looking for a video in this tab…", "Joriy varaqdan video qidirilmoqda…"],
    ["Загружаем…", "Loading…", "Yuklanmoqda…"],
    ["Проверяем…", "Checking…", "Tekshirilmoqda…"],
    ["Голос работает на компьютере.", "Voice runs on your computer.", "Ovoz kompyuterda ishlaydi."],
    ["Озвучка локальная. Нужны субтитры на выбранном языке; автоперевод подключён на YouTube.", "Speech is local. Captions in the selected language are required; YouTube provides auto-translation.", "Ovozli o‘qish mahalliy. Tanlangan tilda subtitrlar kerak; YouTube’da avtomatik tarjima ishlaydi."],
    ["Оба языка можно выбрать в шестерёнке Bridge в плеере. Слева по умолчанию «Автоматически». Выбор сохраняется сразу. Перевод YouTube требует интернета. На других площадках используется локальный перевод Chrome 138+; первый языковой пакет скачивается.", "Choose both languages in the player's Bridge gear menu. The source defaults to Automatic. Choices are saved immediately. YouTube translation needs internet. Other sites use local Chrome 138+ translation; the first language pack must be downloaded.", "Ikkala tilni pleyerdagi Bridge sozlamalaridan tanlang. Asl til odatda Avtomatik. Tanlov darhol saqlanadi. YouTube tarjimasi uchun internet kerak. Boshqa saytlarda Chrome 138+ mahalliy tarjimasi ishlaydi; birinchi til paketi yuklanadi."],
    ["Сейчас звучит локальный голос.", "A local voice is speaking.", "Mahalliy ovoz yangramoqda."],
    ["Проверка завершена. Как вам звучание?", "Preview complete. How does it sound?", "Sinov tugadi. Ovoz sizga yoqdimi?"],
    ["Запускаем локальный голос…", "Starting the local voice…", "Mahalliy ovoz ishga tushirilmoqda…"],
    ["Готовим встроенный голос…", "Preparing the bundled voice…", "Ichki ovoz tayyorlanmoqda…"],
    ["Готовим выбранный голос…", "Preparing the selected voice…", "Tanlangan ovoz tayyorlanmoqda…"],
    ["Подготавливаем речь локально…", "Preparing speech locally…", "Nutq kompyuterda tayyorlanmoqda…"],
    ["Создаём речь локально…", "Generating speech locally…", "Nutq kompyuterda yaratilmoqda…"],
    ["Проверяем локальный голос…", "Checking the local voice…", "Mahalliy ovoz tekshirilmoqda…"],
    ["Команда отправлена локальному голосу.", "Request sent to the local voice.", "So‘rov mahalliy ovozga yuborildi."],
    ["Команда отправлена голосу. Чтобы прервать, нажмите «Остановить».", "Request sent to the voice. Press Stop to interrupt it.", "So‘rov ovozga yuborildi. To‘xtatish uchun To‘xtatishni bosing."],
    ["В тексте нет слов для озвучки: знаки оформления пропущены.", "There are no words to read; formatting symbols were skipped.", "Matnda o‘qiladigan so‘zlar yo‘q; bezak belgilari tashlab ketildi."],
    ["Список локальных голосов обновлён.", "Local voice list refreshed.", "Mahalliy ovozlar ro‘yxati yangilandi."],
    ["Голоса Bridge готовы. Язык и режим сохранены.", "Bridge voices are ready. Language and mode saved.", "Bridge ovozlari tayyor. Til va rejim saqlandi."],
    ["Локальный голос Bridge", "Local Bridge voice", "Mahalliy Bridge ovozi"],
    ["Улучшенный", "Enhanced", "Yaxshilangan"],
    ["Системный", "System", "Tizim"],
    ["Премиум", "Premium", "Premium"],
    ["Откройте настройки и выберите установленный голос.", "Open settings and choose an installed voice.", "Sozlamalarni ochib, o‘rnatilgan ovozni tanlang."],
    ["Откройте видео на поддерживаемой площадке. После обновления Bridge перезагрузите страницу видео.", "Open a video on a supported site. Reload the video page after updating Bridge.", "Qo‘llanadigan saytda video oching. Bridge yangilangandan keyin video sahifasini qayta yuklang."],
    ["Не удалось подключиться. Обновите страницу видео.", "Could not connect. Reload the video page.", "Ulanib bo‘lmadi. Video sahifasini qayta yuklang."],
    ["Обновите страницу YouTube после установки или обновления Bridge.", "Reload YouTube after installing or updating Bridge.", "Bridge o‘rnatilgandan yoki yangilangandan keyin YouTube sahifasini qayta yuklang."],
    ["Связь с Bridge потеряна. Обновите страницу YouTube.", "Connection to Bridge was lost. Reload YouTube.", "Bridge bilan aloqa uzildi. YouTube sahifasini qayta yuklang."],
    ["Голос не ответил. Откройте настройки Bridge и проверьте локальный голос.", "The voice did not respond. Open Bridge settings and check the local voice.", "Ovoz javob bermadi. Bridge sozlamalarida mahalliy ovozni tekshiring."],
    ["Голос не сообщил о завершении речи. Выберите другой локальный голос в Bridge.", "The voice did not report completion. Choose another local voice in Bridge.", "Ovoz tugagani haqida xabar bermadi. Bridge’da boshqa mahalliy ovozni tanlang."],
    ["Синтез речи занимает слишком много времени. Попробуйте системный голос в настройках Bridge.", "Speech synthesis is taking too long. Try a system voice in Bridge settings.", "Nutq yaratish juda ko‘p vaqt olyapti. Bridge sozlamalaridan tizim ovozini sinab ko‘ring."],
    ["Субтитры сейчас не отображаются. Перезапустите озвучку кнопкой Bridge.", "Captions are not visible now. Restart speech with the Bridge button.", "Hozir subtitrlar ko‘rinmayapti. Bridge tugmasi bilan ovozli o‘qishni qayta yoqing."],
    ["Не удалось перевести субтитры локально. Повторите запуск Bridge.", "Could not translate captions locally. Try starting Bridge again.", "Subtitrlarni mahalliy tarjima qilib bo‘lmadi. Bridge’ni qayta ishga tushiring."],
    ["Введите текст для проверки голоса.", "Enter text to preview the voice.", "Ovozni sinash uchun matn kiriting."],
    ["Для проверки используйте не более 500 символов.", "Use no more than 500 characters for the preview.", "Sinov uchun 500 belgidan oshmagan matn kiriting."],
    ["Локальный голос недоступен. Выберите установленный голос для этого языка и обновите список.", "Local voice unavailable. Choose an installed voice for this language and refresh the list.", "Mahalliy ovoz mavjud emas. Shu til uchun o‘rnatilgan ovozni tanlab, ro‘yxatni yangilang."],
    ["Для выбранного режима нет локального голоса. Выберите другой режим в Bridge.", "No local voice is available for this mode. Choose another mode in Bridge.", "Bu rejim uchun mahalliy ovoz yo‘q. Bridge’da boshqa rejimni tanlang."],
    ["Для выбранного языка нет локального голоса. Откройте настройки Bridge.", "No local voice is available for this language. Open Bridge settings.", "Tanlangan til uchun mahalliy ovoz yo‘q. Bridge sozlamalarini oching."],
    ["Для этого языка нет локального голоса. Установите его в настройках речи вашей ОС.", "There is no local voice for this language. Install one in your OS speech settings.", "Bu til uchun mahalliy ovoz yo‘q. Uni tizim nutq sozlamalaridan o‘rnating."],
    ["Голос не найден.", "Voice not found.", "Ovoz topilmadi."],
    ["Установите голос для выбранного языка.", "Install a voice for the selected language.", "Tanlangan til uchun ovoz o‘rnating."],
    ["Этот голос удалён. Выберите другой голос в Bridge.", "This voice was removed. Choose another voice in Bridge.", "Bu ovoz o‘chirildi. Bridge’da boshqa ovozni tanlang."],
    ["Такой локальный голос для выбранного языка не установлен. Добавьте его в настройках речи ОС и обновите страницу.", "This voice type is not installed for the language. Add it in OS speech settings and reload the page.", "Tanlangan til uchun bu turdagi ovoz o‘rnatilmagan. Tizim nutq sozlamalaridan qo‘shib, sahifani yangilang."],
    ["Системный голос не смог озвучить субтитры.", "The system voice could not read the captions.", "Tizim ovozi subtitrlarni o‘qiy olmadi."],
    ["Системный голос не смог произнести текст. Попробуйте другой локальный голос.", "The system voice could not read the text. Try another local voice.", "Tizim ovozi matnni o‘qiy olmadi. Boshqa mahalliy ovozni sinang."],
    ["Не удалось запустить локальную озвучку.", "Could not start local speech.", "Mahalliy ovozli o‘qishni boshlashning iloji bo‘lmadi."],
    ["Проверьте, что расширение включено в Chrome.", "Check that the extension is enabled in Chrome.", "Chrome’da kengaytma yoqilganini tekshiring."],
    ["Нет активной вкладки", "No active tab", "Faol varaq yo‘q"],
    ["Не найдено меню субтитров Shorts. Попробуйте другое короткое видео.", "Shorts caption menu was not found. Try another short video.", "Shorts subtitr menyusi topilmadi. Boshqa qisqa videoni sinab ko‘ring."],
    ["YouTube не предоставил меню субтитров для этого Shorts.", "YouTube did not provide a caption menu for this Short.", "YouTube bu Shorts uchun subtitr menyusini bermadi."],
    ["В этом Shorts нет выбранной исходной дорожки субтитров.", "The selected source caption track is unavailable for this Short.", "Bu Shorts’da tanlangan asl subtitr yo‘lagi yo‘q."],
    ["YouTube не подтвердил исходный язык субтитров Shorts.", "YouTube did not confirm the Short's source caption language.", "YouTube Shorts asl subtitr tilini tasdiqlamadi."],
    ["YouTube не открыл языки субтитров Shorts.", "YouTube did not open the Short's caption languages.", "YouTube Shorts subtitr tillarini ochmadi."],
    ["В этом Shorts нет выбранного языка и автоперевода субтитров. Исходный текст не озвучивается.", "This Short has neither the target language nor auto-translation. Source text will not be read as a translation.", "Bu Shorts’da kerakli til ham, avtomatik tarjima ham yo‘q. Asl matn tarjima sifatida o‘qilmaydi."],
    ["В автопереводе Shorts нет выбранного языка.", "The selected language is unavailable in Shorts auto-translation.", "Shorts avtomatik tarjimasida tanlangan til yo‘q."],
    ["YouTube не подтвердил выбранный язык субтитров Shorts.", "YouTube did not confirm the Short's target caption language.", "YouTube Shorts uchun tanlangan subtitr tilini tasdiqlamadi."],
    ["YouTube не предоставил субтитры для этого видео.", "YouTube did not provide captions for this video.", "YouTube bu video uchun subtitr bermadi."],
    ["Не найдено меню языков YouTube. Обновите страницу видео.", "YouTube's language menu was not found. Reload the video page.", "YouTube tillar menyusi topilmadi. Video sahifasini qayta yuklang."],
    ["Не удалось открыть список субтитров YouTube. Проверьте доступность CC и язык интерфейса сайта.", "Could not open YouTube captions. Check CC availability and the site's interface language.", "YouTube subtitrlar ro‘yxatini ochib bo‘lmadi. CC mavjudligi va sayt interfeysi tilini tekshiring."],
    ["YouTube не подтвердил выбранный исходный язык. Попробуйте «Автоматически».", "YouTube did not confirm the selected source language. Try Automatic.", "YouTube tanlangan asl tilni tasdiqlamadi. Avtomatik rejimni sinang."],
    ["YouTube не открыл языки субтитров.", "YouTube did not open caption languages.", "YouTube subtitrlar tillarini ochmadi."],
    ["Не найден пункт «Перевести» или «Автоперевод» в меню субтитров YouTube.", "Translate or Auto-translate was not found in YouTube's caption menu.", "YouTube subtitrlar menyusida Tarjima yoki Avtomatik tarjima bandi topilmadi."],
    ["В автопереводе YouTube нет выбранного языка. Язык Bridge сохранён; выберите другое видео или язык.", "YouTube auto-translation lacks this language. Your Bridge choice is saved; try another video or language.", "YouTube avtomatik tarjimasida bu til yo‘q. Bridge tanlovi saqlangan; boshqa video yoki tilni tanlang."],
    ["YouTube не подтвердил выбранный язык перевода. Исходный текст не озвучивается; язык Bridge сохранён.", "YouTube did not confirm the translation language. Source text will not be read; your Bridge choice is saved.", "YouTube tanlangan tarjima tilini tasdiqlamadi. Asl matn o‘qilmaydi; Bridge tanlovi saqlangan."],
    ["Повторим выбор автоматически.", "The selection will be retried automatically.", "Tanlash avtomatik qayta uriniladi."],
    ["Голос ещё не установлен. Выберите голос и нажмите «Установить» в Bridge.", "The voice is not installed yet. Select a voice and press Install in Bridge.", "Ovoz hali o‘rnatilmagan. Bridge’da ovozni tanlab, O‘rnatishni bosing."],
    ["Загружаем выбранные голоса…", "Downloading selected voices…", "Tanlangan ovozlar yuklanmoqda…"],
    ["Установка отменена. Уже установленные голоса сохранены.", "Installation cancelled. Previously installed voices are kept.", "O‘rnatish bekor qilindi. Avval o‘rnatilgan ovozlar saqlandi."],
    ["Голоса установлены на компьютере. Можно слушать без интернета.", "Voices are installed on this computer. They can be used offline.", "Ovozlar kompyuterga o‘rnatildi. Internetsiz tinglash mumkin."],
    ["Не удалось подготовить произношение субтитров.", "Could not prepare subtitle pronunciation.", "Subtitrlar talaffuzini tayyorlab bo‘lmadi."],
    ["Файл голоса загружен не полностью. Повторите установку.", "The voice file is incomplete. Try installing again.", "Ovoz fayli to‘liq yuklanmagan. Qayta o‘rnating."],
    ["Контрольная сумма голоса не совпала. Файл не установлен.", "The voice checksum does not match. The file was not installed.", "Ovozning nazorat yig‘indisi mos emas. Fayl o‘rnatilmadi."],
    ["Не удалось сохранить голос. Проверьте свободное место.", "Could not save the voice. Check available storage.", "Ovozni saqlab bo‘lmadi. Bo‘sh joyni tekshiring."],
    ["Хранилище голосов недоступно в этом браузере.", "Voice storage is unavailable in this browser.", "Bu brauzerda ovozlar ombori mavjud emas."],
    ["Для локального перевода нужен Chrome 138 или новее с поддержкой Translator. Обновите Chrome или выберите язык имеющихся субтитров.", "Local translation needs Chrome 138+ with Translator support. Update Chrome or use an available caption language.", "Mahalliy tarjima uchun Translator’li Chrome 138+ kerak. Chrome’ni yangilang yoki mavjud subtitr tilini tanlang."],
    ["Chrome не поддерживает локальный перевод для этих языков на этом компьютере. Выберите доступную дорожку или другой язык.", "Chrome cannot translate this language pair locally on this computer. Choose an available track or another language.", "Bu kompyuterda Chrome ushbu til juftligini mahalliy tarjima qilmaydi. Mavjud yo‘lak yoki boshqa tilni tanlang."],
    ["Эта пара языков недоступна локальному переводчику Chrome.", "This language pair is unavailable in Chrome's local Translator.", "Chrome mahalliy tarjimonida bu til juftligi mavjud emas."],
    ["Готовим локальный перевод…", "Preparing local translation…", "Mahalliy tarjima tayyorlanmoqda…"],
    ["Chrome загружает языковой пакет для локального перевода. Дождитесь завершения; текст остаётся на компьютере.", "Chrome is downloading local translation data. Wait for it to finish; text stays on your computer.", "Chrome mahalliy tarjima uchun til paketini yuklamoqda. Tugashini kuting; matn kompyuterda qoladi."],
    ["Не удалось определить язык субтитров. Выберите исходный язык слева в Bridge.", "Could not detect the caption language. Select the source language on the left in Bridge.", "Subtitr tilini aniqlab bo‘lmadi. Bridge’da chapdan asl tilni tanlang."],
    ["Не удалось определить язык субтитров. Выберите исходный язык слева в Bridge и повторите запуск.", "Could not detect the caption language. Select the source language on the left and try again.", "Subtitr tilini aniqlab bo‘lmadi. Chapdan asl tilni tanlab, qayta ishga tushiring."],
    ["Дорожка субтитров изменена в плеере. Включите Bridge заново для выбранного языка.", "The player's caption track changed. Restart Bridge for the selected language.", "Pleyerda subtitr yo‘lagi o‘zgardi. Tanlangan til uchun Bridge’ni qayta yoqing."],
    ["У этого видео нет выбранной исходной дорожки субтитров.", "This video does not have the selected source caption track.", "Bu videoda tanlangan asl subtitr yo‘lagi yo‘q."],
    ["Дождитесь завершения установки этого голоса.", "Wait for this voice installation to finish.", "Bu ovoz o‘rnatilishi tugashini kuting."],
    ["Выберите доступный пакет голоса.", "Choose an available voice pack.", "Mavjud ovoz paketini tanlang."],
    ["Исходный язык выбран вручную. Нужна дорожка субтитров на этом языке. Вернуться к определению можно через «Автоматически».", "The source language was chosen manually. A caption track in that language is required. Choose Automatic to return to detection.", "Asl til qo‘lda tanlangan. Shu tilda subtitr yo‘lagi kerak. Aniqlashga qaytish uchun Avtomatikni tanlang."],
    ["Слева — автоматическое определение или ручной выбор. Справа — язык перевода. Оба выбора сохраняются сразу.", "Left: automatic detection or a manual source. Right: target language. Both choices are saved immediately.", "Chapda — avtomatik aniqlash yoki qo‘lda tanlash. O‘ngda — tarjima tili. Ikkala tanlov ham darhol saqlanadi."],
    ["Перевод — через YouTube. Голос — на вашем компьютере. Нужны доступные субтитры.", "YouTube provides translation. Voice runs on your computer. Available captions are required.", "Tarjimani YouTube bajaradi. Ovoz kompyuterda ishlaydi. Mavjud subtitrlar kerak."],
    ["Язык или настройки голоса изменены. Включите озвучку ещё раз.", "Language or voice settings changed. Enable speech again.", "Til yoki ovoz sozlamalari o‘zgardi. Ovozli o‘qishni qayta yoqing."],
    ["Язык субтитров YouTube изменён вручную. Нажмите Bridge для возврата к сохранённому языку перевода.", "YouTube's caption language was changed manually. Press Bridge to return to the saved target language.", "YouTube subtitr tili qo‘lda o‘zgartirildi. Saqlangan tarjima tiliga qaytish uchun Bridge’ni bosing."],
    ["Нажмите Play для озвучки.", "Press Play to hear speech.", "Ovozli o‘qish uchun Play’ni bosing."],
    ["Ждём субтитры.", "Waiting for captions.", "Subtitrlar kutilmoqda."],
    ["Озвучка без перевода", "Speech without translation", "Tarjimasiz ovozli o‘qish"],
    ["Дорожка", "Track", "Yo‘lak"],
    ["Русский", "Russian", "Ruscha"],
    ["русский", "Russian", "ruscha"],
    ["Английский", "English", "Inglizcha"],
    ["английский", "English", "inglizcha"],
    ["Корейский", "Korean", "Koreyscha"],
    ["корейский", "Korean", "koreyscha"],
    ["Узбекский", "Uzbek", "O‘zbekcha"],
    ["узбекский", "Uzbek", "o‘zbekcha"],
    ["Немецкий", "German", "Nemischa"],
    ["немецкий", "German", "nemischa"],
    ["Французский", "French", "Fransuzcha"],
    ["французский", "French", "fransuzcha"],
    ["Испанский", "Spanish", "Ispancha"],
    ["испанский", "Spanish", "ispancha"],
    ["Казахский", "Kazakh", "Qozoqcha"],
    ["казахский", "Kazakh", "qozoqcha"],
    ["Китайский", "Chinese", "Xitoycha"],
    ["китайский", "Chinese", "xitoycha"],
    ["Японский", "Japanese", "Yaponcha"],
    ["японский", "Japanese", "yaponcha"],
    ["{0} (создано автоматически)", "{0} (auto-generated)", "{0} (avtomatik yaratilgan)"],
    ["{0} (локальный)", "{0} (local)", "{0} (mahalliy)"],
    ["Локальная речь · {0}", "Local speech · {0}", "Mahalliy nutq · {0}"],
    ["{0} МБ", "{0} MB", "{0} MB"],
    ["Установить · {0}", "Install · {0}", "O‘rnatish · {0}"],
    ["Авто · {0}", "Auto · {0}", "Avto · {0}"],
    ["Автоматически: {0}", "Automatic: {0}", "Avtomatik: {0}"],
    ["Исходный язык выбран вручную: {0}", "Source language chosen manually: {0}", "Asl til qo‘lda tanlangan: {0}"],
    ["Авто: {0} тембр. Голос переключается со следующей реплики. Можно исправить выбор вручную.", "Auto: {0} voice. Changes apply from the next utterance. You can choose manually.", "Avto: {0} ovozi. Ovoz keyingi jumladan almashadi. Qo‘lda tuzatish mumkin."],
    ["Выбран {0} голос для текущей и следующих реплик. Выбор сохраняется. Для автоматического переключения выберите «Авто».", "A {0} voice is selected for current and future utterances. The choice is saved. Choose Auto for automatic switching.", "Joriy va keyingi jumlalar uchun {0} ovozi tanlangan. Tanlov saqlanadi. Avtomatik almashish uchun Avto’ni tanlang."],
    ["Определён {0} тембр, но такого локального голоса нет. Звучит {1}.", "A {0} voice was detected, but no matching local voice exists. Using {1}.", "{0} tembri aniqlandi, ammo mos mahalliy ovoz yo‘q. {1} ishlatilmoqda."],
    ["Во время речи оригинал тише на {0}%.", "Original audio is lowered by {0}% during speech.", "O‘qish paytida asl tovush {0}% ga pasayadi."],
    ["Голосов на устройстве: {0}", "Voices on this device: {0}", "Qurilmadagi ovozlar: {0}"],
    ["Качество: {0}. Лицензия: {1}", "Quality: {0}. License: {1}", "Sifat: {0}. Litsenziya: {1}"],
    ["Язык: {0}. Установите только нужный голос; остальные не скачиваются.", "Language: {0}. Install only the voice you need; others are not downloaded.", "Til: {0}. Faqat kerakli ovozni o‘rnating; boshqalari yuklanmaydi."],
    ["Язык: {0}. Пакета Bridge нет, но доступен локальный голос ОС.", "Language: {0}. No Bridge pack exists, but a local OS voice is available.", "Til: {0}. Bridge paketi yo‘q, ammo mahalliy tizim ovozi mavjud."],
    ["Язык: {0}. Подходящий локальный пакет в каталоге Bridge не найден. Загрузка не начинается.", "Language: {0}. No suitable local pack was found in the Bridge catalogue. No download will start.", "Til: {0}. Bridge katalogida mos mahalliy paket topilmadi. Yuklash boshlanmaydi."],
    ["Удаляем голос {0}…", "Removing voice {0}…", "{0} ovozi o‘chirilmoqda…"],
    ["Устанавливаем {0}… {1}%", "Installing {0}… {1}%", "{0} o‘rnatilmoqda… {1}%"],
    ["Устанавливаем {0}…", "Installing {0}…", "{0} o‘rnatilmoqda…"],
    ["Открываем локальный голос {0}…", "Opening local voice {0}…", "{0} mahalliy ovozi ochilmoqda…"],
    ["Не удалось установить голос. {0} Уже установленные голоса сохранены.", "Could not install the voice. {0} Previously installed voices are kept.", "Ovozni o‘rnatib bo‘lmadi. {0} Avval o‘rnatilgan ovozlar saqlandi."],
    ["У этого видео нет исходной дорожки субтитров на языке «{0}». Выберите «Автоматически» или доступную дорожку.", "This video has no source captions in {0}. Choose Automatic or an available track.", "Bu videoda {0} tilidagi asl subtitr yo‘q. Avtomatikni yoki mavjud yo‘lakni tanlang."],
    ["Недоступен: {0}", "Unavailable: {0}", "Mavjud emas: {0}"],
    ["Озвучиваем: {0}.", "Reading aloud: {0}.", "O‘qilmoqda: {0}."],
    ["Переводим локально: {0}…", "Translating locally: {0}…", "Mahalliy tarjima qilinmoqda: {0}…"],
    ["Определяем дорожку YouTube и выбираем перевод: {0}…", "Detecting the YouTube track and selecting translation: {0}…", "YouTube yo‘lagi aniqlanib, tarjima tanlanmoqda: {0}…"],
    ["Выбираем дорожку {0}: {1}…", "Selecting a {0} track: {1}…", "{0} yo‘lagi tanlanmoqda: {1}…"],
    ["Язык выбран: {0}. Ждём следующую реплику {1}.", "Language selected: {0}. Waiting for the next {1} utterance.", "Til tanlandi: {0}. Keyingi {1} jumlasi kutilmoqda."],
    ["Исходный язык сохранён: {0}.", "Source language saved: {0}.", "Asl til saqlandi: {0}."],
    ["Язык перевода сохранён: {0}.", "Target language saved: {0}.", "Tarjima tili saqlandi: {0}."],
    ["Исходный язык не сохранён: {0}", "Source language was not saved: {0}", "Asl til saqlanmadi: {0}"],
    ["Язык не сохранён: {0}", "Language was not saved: {0}", "Til saqlanmadi: {0}"],
    ["Не удалось сохранить: {0}", "Could not save: {0}", "Saqlab bo‘lmadi: {0}"],
    ["Не удалось загрузить настройки. {0}", "Could not load settings. {0}", "Sozlamalarni yuklab bo‘lmadi. {0}"],
    ["Плавная речь сохранена. Голос: {0}. Скорость: 1×.", "Smooth speech saved. Voice: {0}. Speed: 1×.", "Ravon nutq saqlandi. Ovoz: {0}. Tezlik: 1×."],
    ["{0} → {1}: озвучка исходных субтитров без перевода.", "{0} → {1}: reading source captions without translation.", "{0} → {1}: asl subtitrlar tarjimasiz o‘qiladi."],
    ["Нажмите «Озвучить субтитры» — Bridge выберет доступную дорожку {0}.", "Press Read subtitles aloud — Bridge will select an available {0} caption track.", "Subtitrlarni ovozli o‘qishni bosing — Bridge mavjud {0} subtitr yo‘lagini tanlaydi."],
    ["Откройте видео {0} и дождитесь появления плеера.", "Open a {0} video and wait for the player.", "{0} videosini ochib, pleyer paydo bo‘lishini kuting."],
    ["{0} не передал текст субтитров. Откройте настройки Bridge в плеере и нажмите «Повторить запуск».", "{0} did not provide caption text. Open Bridge settings in the player and press Try again.", "{0} subtitr matnini bermadi. Pleyerda Bridge sozlamalarini ochib, Qayta ishga tushirishni bosing."],
    ["{0}: нужны доступные субтитры. Готовая дорожка имеет приоритет; иначе перевод выполняется локально средствами Chrome 138+. Первый языковой пакет требует скачивания. Голос работает на компьютере.", "{0}: available captions are required. An existing target track takes priority; otherwise Chrome 138+ translates locally. The first language pack must be downloaded. Voice runs on your computer.", "{0}: mavjud subtitrlar kerak. Tayyor yo‘lak ustun; aks holda Chrome 138+ mahalliy tarjima qiladi. Birinchi til paketi yuklanishi kerak. Ovoz kompyuterda ishlaydi."],
    ["{0}: справа — язык результата. Если готовой дорожки нет, Bridge использует локальный перевод Chrome. При первом запуске Chrome скачивает языковой пакет.", "{0}: the target language is on the right. If no target track exists, Bridge uses local Chrome translation. Chrome downloads a language pack on first use.", "{0}: natija tili o‘ngda. Tayyor yo‘lak bo‘lmasa, Bridge Chrome mahalliy tarjimasidan foydalanadi. Birinchi ishga tushirishda Chrome til paketini yuklaydi."],
    ["{0}: {1} → {2}. {3}", "{0}: {1} → {2}. {3}", "{0}: {1} → {2}. {3}"],
    // END MESSAGES
  ];
  const clean = value => value.replace(/\s+/g, " ").trim();
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new Map(), patterns = [];
  for (const [ru, en, uz] of messages) {
    const key = clean(ru), targets = { en, uz };
    if (!/\{\d+\}/.test(key)) exact.set(key, targets);
    else {
      const parts = key.split(/(\{\d+\})/), indices = [];
      const pattern = parts.map(part => /^\{\d+\}$/.test(part) ? (indices.push(Number(part.slice(1, -1))), "(.+?)") : escape(part)).join("");
      patterns.push({ regex: new RegExp(`^${pattern}$`, "u"), targets, indices });
    }
  }
  function translate(value, depth = 0) {
    if (locale === "ru" || typeof value !== "string" || !value.trim() || depth > 5) return value;
    const key = clean(value), entry = exact.get(key);
    let result = entry?.[locale];
    if (!result) for (const { regex, targets, indices } of patterns) {
      const match = regex.exec(key);
      if (!match) continue;
      const args = new Map(indices.map((index, i) => [index, translate(match[i + 1], depth + 1)]));
      result = targets[locale].replace(/\{(\d+)\}/g, (_, index) => args.get(Number(index)) || "");
      break;
    }
    if (!result) {
      const prefix = /^(✓ |▶ |■ )/.exec(key)?.[0];
      if (prefix) result = prefix + translate(key.slice(prefix.length), depth + 1);
      else if (key.includes(" · ")) result = key.split(" · ").map(part => translate(part, depth + 1)).join(" · ");
      else {
        const sentences = key.split(/(?<=[.!?])\s+(?=[А-ЯЁ])/u);
        if (sentences.length > 1) result = sentences.map(part => translate(part, depth + 1)).join(" ");
      }
    }
    return result ? value.slice(0, value.indexOf(value.trimStart())) + result + (value.match(/\s*$/)?.[0] || "") : value;
  }
  function languageName(code) {
    const key = `${locale}:${code}`;
    if (!languageCache.has(key)) {
      try {
        const name = new Intl.DisplayNames([locale], { type: "language" }).of(String(code).split(/[-_]/)[0]);
        languageCache.set(key, name[0].toLocaleUpperCase(locale) + name.slice(1));
      } catch { languageCache.set(key, code); }
    }
    return languageCache.get(key);
  }
  function mount(root) {
    if (!root) return () => {};
    const textSources = new WeakMap(), attributeSources = new WeakMap();
    const ignored = node => node.parentElement?.closest("script,style,textarea,[data-bridge-i18n-ignore]");
    function text(node) {
      if (ignored(node)) return;
      const previous = textSources.get(node);
      const source = previous && node.data === previous.output ? previous.source : node.data;
      let output = translate(source);
      const option = node.parentElement;
      if (option?.tagName === "OPTION" && ["language", "source-language", "bridge-source-language", "bridge-target-language"].includes(option.parentElement?.id) && option.value !== "auto") output = languageName(option.value);
      textSources.set(node, { source, output });
      if (node.data !== output) node.data = output;
    }
    function attributes(node) {
      if (node.closest?.("[data-bridge-i18n-ignore]")) return;
      let saved = attributeSources.get(node);
      if (!saved) { saved = new Map(); attributeSources.set(node, saved); }
      for (const name of ["title", "aria-label", "placeholder"]) if (node.hasAttribute?.(name)) {
        const current = node.getAttribute(name), previous = saved.get(name);
        const source = previous && current === previous.output ? previous.source : current, output = translate(source);
        saved.set(name, { source, output });
        if (current !== output) node.setAttribute(name, output);
      }
    }
    function apply(node) {
      if (node.nodeType === 3) { text(node); return; }
      if (node.nodeType !== 1 || node.closest?.("[data-bridge-i18n-ignore]")) return;
      attributes(node);
      const walker = root.ownerDocument.createTreeWalker(node, 5);
      while (walker.nextNode()) { const current = walker.currentNode; if (current.nodeType === 3) text(current); else attributes(current); }
    }
    const state = { update() {
      apply(root); root.lang = locale;
      if (root === root.ownerDocument.body) root.ownerDocument.documentElement.lang = locale;
      for (const select of root.querySelectorAll("[data-bridge-ui-language]")) select.value = locale;
    } };
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "childList") for (const node of record.addedNodes) apply(node);
        else apply(record.target);
      }
    });
    roots.add(state); state.update();
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder"] });
    return () => { observer.disconnect(); roots.delete(state); };
  }
  function setLocale(value) {
    const next = normalize(value);
    if (next === locale) return;
    locale = next;
    for (const root of roots) root.update();
    for (const callback of listeners) callback(locale);
  }
  function createControl(document, id, save) {
    const element = document.createElement("div"), label = document.createElement("label"), select = document.createElement("select"), help = document.createElement("p");
    element.className = "bridge-ui-language"; label.htmlFor = id; label.textContent = "Язык интерфейса Bridge";
    select.id = id; select.dataset.bridgeUiLanguage = ""; select.dataset.bridgeI18nIgnore = "";
    for (const item of languages) { const option = document.createElement("option"); option.value = item.code; option.textContent = item.name; select.append(option); }
    select.value = locale; help.className = "bridge-ui-language-help";
    help.textContent = "Только кнопки и настройки. Языки видео и голоса не меняются.";
    select.addEventListener("change", async () => {
      const previous = locale; select.disabled = true;
      try { const result = await save(select.value); setLocale(result?.uiLanguage || result?.settings?.uiLanguage || select.value); help.textContent = "Только кнопки и настройки. Языки видео и голоса не меняются."; }
      catch { select.value = previous; help.textContent = "Не удалось сохранить язык интерфейса."; }
      finally { select.disabled = false; }
    });
    element.append(label, select, help); return element;
  }
  globalThis.BridgeI18n = Object.freeze({ languages, normalize, translate, languageName, mount, setLocale, createControl,
    get locale() { return locale; }, onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); } });
})();
