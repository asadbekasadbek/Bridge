(() => {
  const mb = bytes => `${Math.ceil(bytes / 1024 / 1024)} МБ`;
  const name = pack => pack.voiceName.replace(/^Bridge — /, '').replace(/ \(локальный\)$/, '');
  const languageName = code => { try { return globalThis.BridgeI18n?.locale !== 'ru' && globalThis.BridgeI18n ? globalThis.BridgeI18n.languageName(code) : new Intl.DisplayNames(['ru'], {type:'language'}).of(code.split('-')[0]); } catch { return code; } };
  function create({request, language, source = () => 'auto', provider = 'local', translation = null, nativeVoices = () => [], onUse, onRemoved = async () => {}}) {
    const element = document.createElement('section'); element.className = 'bridge-voice-packs';
    const heading = document.createElement('strong'); heading.textContent = 'Язык и голос на компьютере';
    const description = document.createElement('p'), cards = document.createElement('div'), message = document.createElement('p');
    cards.className = 'bridge-pack-cards'; message.setAttribute('role','status');
    const cancel = document.createElement('button'); cancel.type='button';cancel.className='bridge-pack-action';cancel.textContent='Отменить загрузку';cancel.hidden=true;cancel.dataset.bridgeCancelInstall='';
    const translatorText = document.createElement('p'), prepare = document.createElement('button');
    translatorText.dataset.bridgeTranslationStatus='';prepare.type='button';prepare.className='bridge-pack-action';prepare.textContent='Подготовить локальный перевод';prepare.hidden=true;prepare.dataset.bridgePrepareTranslation='';
    const installed = document.createElement('details'), installedTitle = document.createElement('summary'), installedRows = document.createElement('div');
    installed.append(installedTitle,installedRows);installed.className='bridge-installed-packs';
    const performance = document.createElement('details'), performanceTitle = document.createElement('summary'), performanceLabel = document.createElement('label'), economy = document.createElement('input'), performanceHelp = document.createElement('p');
    performanceTitle.textContent='Быстродействие';economy.type='checkbox';economy.checked=true;economy.dataset.bridgeResourceMode='';performanceLabel.append(economy,' Экономить память');performanceHelp.textContent='Для слабого компьютера: один голос в памяти, выгрузка после простоя. Отключите для более быстрого переключения двух голосов.';performance.append(performanceTitle,performanceLabel,performanceHelp);
    element.append(heading,description,cards,message,cancel,translatorText,prepare,installed,performance);
    let timer=null, generation=0, busy=false, waiting=null, mode='light', modeSaving=false, translationBusy=false, preparedKey='', translationError=null;
    const button = (text, action) => { const el=document.createElement('button');el.type='button';el.className='bridge-pack-action';el.textContent=text;el.addEventListener('click',event=>{if(event.isTrusted)action(el);});return el; };
    async function remove(pack) {
      if(busy)return;busy=true;message.textContent=`Удаляем голос ${name(pack)}…`;
      try { await request('bridge:remove-voice-pack',{id:pack.id});await onRemoved(pack);message.textContent='Голос удалён. Его можно установить снова.'; }
      catch(error){message.textContent=error.message;}
      finally{busy=false;await refresh();}
    }
    function row(pack, code, compact=false) {
      const row=document.createElement('div');row.className='bridge-pack-card';row.dataset.packId=pack.id;
      const title=document.createElement('p');title.textContent=`${name(pack)} · ${{male:'мужской',female:'женский'}[pack.gender]||'тип не указан'} · ${mb(pack.bytes)}`;row.append(title);
      if(compact){title.textContent=`${languageName(pack.lang)} · ${name(pack)} · ${mb(pack.bytes)}`;}
      else if(pack.installed){const use=button('Использовать',async el=>{if(busy)return;el.disabled=true;try{await onUse([pack],code);message.textContent='Голос выбран и сохранён.';}catch(error){message.textContent=error.message;}finally{el.disabled=false;}});use.dataset.bridgeUseVoices=pack.id;use.disabled=busy;row.append(use);}
      else {
        const install=button(`Установить · ${mb(pack.bytes)}`,async()=>{
          if(busy)return;busy=true;message.textContent='Начинаем загрузку выбранного голоса…';
          try{await request('bridge:install-voice-packs',{ids:[pack.id]});waiting={id:pack.id,language:code};await refresh();}
          catch(error){busy=false;message.textContent=error.message;}
        });install.dataset.bridgeInstallVoices=pack.id;install.disabled=busy;row.append(install);
      }
      if(pack.installed){const drop=button('Удалить',()=>remove(pack));drop.dataset.bridgeRemoveVoice=pack.id;drop.disabled=busy;row.append(drop);}
      if(!compact){const details=document.createElement('details'),summary=document.createElement('summary'),license=document.createElement('p'),link=document.createElement('a');summary.textContent='Источник и условия';license.textContent=`Качество: ${pack.quality==='medium'?'стандартное':pack.quality==='high'?'повышенное':'лёгкий пакет'}. Лицензия: ${pack.license}`;link.textContent='Карточка голоса';link.href=pack.source;link.target='_blank';link.rel='noopener noreferrer';details.append(summary,license,link);row.append(details);}
      return row;
    }
    async function refreshTranslation(revision) {
      const from=source(),to=language(),key=`${from}:${to}`;
      const currentProvider=typeof provider==='function'?provider():provider;
      if(currentProvider==='site'){translatorText.textContent='Перевод: средствами YouTube. Отдельный локальный пакет для этого плеера не нужен.';prepare.hidden=true;return;}
      if(currentProvider==='captions'){translatorText.textContent='Готовые субтитры уже на нужном языке. Локальный пакет перевода не требуется.';prepare.hidden=true;return;}
      if(translationBusy){if(preparedKey===key)return;translation?.cancel?.();translationBusy=false;}
      const status=translation?await translation.status(from,to):'unsupported';
      if(revision!==generation)return;
      const labels={
        'source-needed':'Локальный перевод: язык исходных субтитров определится в видео. Пакет загрузится только при первом реальном переводе.',
        'same-language':'Перевод не нужен: исходный язык совпадает с языком голоса.',
        available:'Локальный перевод: готов. Дополнительная загрузка сейчас не нужна.',
        downloadable:'Локальный перевод: доступен. Можно подготовить только эту пару языков.',
        downloading:'Локальный перевод: Chrome готовит нужный языковой пакет.',
        unsupported:'Локальный перевод: браузер не поддерживает Translator. Нужен подходящий Chrome 138+.',
        unavailable:'Локальный перевод: эта пара языков не поддерживается на этом устройстве. Установка голоса не добавит перевод.'
      };
      translatorText.textContent=translationError?.key===key?translationError.message:labels[status]||labels.unavailable;prepare.hidden=!['downloadable','downloading'].includes(status);prepare.disabled=false;prepare.textContent='Подготовить локальный перевод';
    }
    async function refresh() {
      clearTimeout(timer);const revision=++generation,code=language();if(!code)return;
      try{
        const info=await request('bridge:voice-packs',{language:code});if(revision!==generation||language()!==code)return;
        busy=info.status.busy;
        if(!modeSaving){mode=info.resourceMode||'light';economy.checked=mode==='light';}
        const system=nativeVoices().filter(voice=>voice.lang.split('-')[0]===code.split('-')[0]);
        description.textContent=info.packs.length?`Язык: ${languageName(code)}. Установите только нужный голос; остальные не скачиваются.`:system.length?`Язык: ${languageName(code)}. Пакета Bridge нет, но доступен локальный голос ОС.`:`Язык: ${languageName(code)}. Подходящий локальный пакет в каталоге Bridge не найден. Загрузка не начинается.`;
        cards.replaceChildren(...info.packs.map(pack=>row(pack,code)));
        const all=info.installed||[];installedTitle.textContent=`Голосов на устройстве: ${all.length} · ${mb(all.reduce((sum,pack)=>sum+pack.bytes,0))}`;installedRows.replaceChildren(...all.map(pack=>row(pack,code,true)));installed.hidden=!all.length;
        cancel.hidden=!busy;message.textContent=busy?`${info.status.message} ${info.status.progress}%`:info.status.phase==='error'&&info.status.ids?.some(id=>info.packs.some(pack=>pack.id===id))?info.status.message:'Модели сохраняются после закрытия Chrome. Можно удалить ненужный голос и позже скачать снова.';
        if(busy)timer=setTimeout(refresh,1000);
        else if(waiting){const done=waiting;waiting=null;const pack=all.find(pack=>pack.id===done.id);if(info.status.phase==='done'&&pack&&code===done.language)await onUse([pack],code);}
        await refreshTranslation(revision);
      }catch(error){busy=false;message.textContent=error.message;}
    }
    cancel.addEventListener('click',async event=>{if(!event.isTrusted)return;try{await request('bridge:cancel-voice-install');waiting=null;await refresh();}catch(error){message.textContent=error.message;}});
    economy.addEventListener('change',async event=>{if(!event.isTrusted)return;modeSaving=true;economy.disabled=true;try{const result=await request('bridge:resource-mode',{resourceMode:economy.checked?'light':'balanced'});mode=result.settings.resourceMode;}catch(error){message.textContent=error.message;}finally{modeSaving=false;economy.disabled=false;await refresh();}});
    prepare.addEventListener('click',async event=>{
      if(!event.isTrusted||!translation)return;
      if(translationBusy){translation.cancel?.();translationBusy=false;await refresh();return;}
      const from=source(),to=language();preparedKey=`${from}:${to}`;translationError=null;translationBusy=true;prepare.textContent='Отменить подготовку';
      try{await translation.prepare(from,to,{onProgress:text=>{if(preparedKey===`${source()}:${language()}`)translatorText.textContent=text;}});}
      catch(error){if(error.name!=='AbortError'){translationError={key:preparedKey,message:error.message};translatorText.textContent=error.message;}}
      finally{translationBusy=false;prepare.textContent='Подготовить локальный перевод';await refreshTranslation(generation);}
    });
    window.addEventListener('pagehide',()=>{clearTimeout(timer);if(translationBusy)translation?.cancel?.();},{once:true});
    return {element,refresh,get mode(){return mode;}};
  }
  globalThis.BridgeVoicePackControls=Object.freeze({create});
})();
