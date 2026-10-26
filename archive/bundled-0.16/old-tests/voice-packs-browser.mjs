import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);const {chromium}=require(require.resolve('playwright',{paths:[process.env.BRIDGE_PLAYWRIGHT_ROOT||process.cwd()]}));
const profile=await mkdtemp(join(tmpdir(),'bridge-packs-')), extensionPath=fileURLToPath(new URL('../extension/',import.meta.url)),output=fileURLToPath(new URL('../test-results/',import.meta.url));await mkdir(output,{recursive:true});
const launch=()=>chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1280,height:950},args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,'--no-first-run','--mute-audio']});
let context=await launch();const stats=[];
try{
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 await worker.evaluate(()=>{chrome.tts.getVoices=callback=>callback([]);});
 const core=await context.newPage();await core.goto(`chrome-extension://${id}/speech/offscreen.html`);
 const audio=[];await core.exposeFunction('recordVoice',record=>audio.push(record));
 const result=await core.evaluate(async()=>{
  const engine=new Worker(chrome.runtime.getURL('speech/worker.js'),{type:'module'}),results=[];
  try{
   for(const [modelId,name] of [['en_US-john-medium','english-male'],['en_US-kristin-medium','english-female'],['en_US-john-medium','english-male-cache']]){
    const chunks=[],before=performance.now();
    await new Promise((resolve,reject)=>{engine.onerror=event=>reject(new Error(event.message));engine.onmessage=({data})=>{if(data.type==='error')reject(new Error(data.error));if(data.type==='audio')chunks.push({sampleRate:data.sampleRate,samples:Array.from(new Float32Array(data.audio)),cached:data.cached});if(data.type==='complete')resolve();};engine.postMessage({type:'speak',id:name,modelId,text:'Hello! This is a local English voice. Your translated subtitles are ready.',speaker:0,rate:1});});
    await window.recordVoice({name,chunks});results.push({name,ms:performance.now()-before,samples:chunks.reduce((sum,c)=>sum+c.samples.length,0),cached:chunks.every(c=>c.cached)});
   }
   const {createLocalPhonemizer}=await import('./phonemizer.js'),{VOICE_PACKS}=await import('../shared/voice-pack-catalogue.js');const phonemize=await createLocalPhonemizer();
   for(const pack of VOICE_PACKS){const cfg=await (await fetch(`../voices/catalogue/${pack.id}/config.json`)).json();const text=pack.lang.startsWith('kk')?'Сәлеметсіз бе! Бұл қазақша дауыс.':pack.lang.startsWith('fr')?'Bonjour! Ceci est une voix locale.':pack.lang.startsWith('de')?'Guten Tag! Dies ist eine lokale Stimme.':pack.lang.startsWith('pt')?'Olá! Esta é uma voz local.':pack.lang.startsWith('es')?'Hola! Esta es una voz local.':'Hello! This is a local voice.';const ids=await phonemize(text,cfg.espeak.voice,cfg);if(!ids.length)throw Error(pack.id+' no phonemes');}
  }finally{engine.terminate();}return results;
 });stats.push(...result);assert.equal(result[2].cached,true);assert.ok(result.every(r=>r.samples>1000));await core.close();
 for(const record of audio.filter(r=>!r.name.endsWith('cache'))){const samples=record.chunks.flatMap(c=>c.samples),rate=record.chunks[0].sampleRate,bytes=Buffer.alloc(44+samples.length*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);samples.forEach((v,i)=>bytes.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(v*32767))),44+i*2));await writeFile(join(output,`bridge-${record.name}.wav`),bytes);}
 console.log('Настоящие английские мужской/женский голоса и фонемы каталога: OK',JSON.stringify(result));
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/options.html`);await page.locator('#settings-fields:not([disabled])').waitFor();
 await context.setOffline(true);await page.locator('#language').selectOption('en-US');await page.locator('#voice-gender').selectOption('female');await page.locator('#volume').fill('0');await page.locator('#sample').fill('The translation is ready.');await page.locator('#preview').click();await page.getByText('Проверка завершена. Как вам звучание?').waitFor({timeout:120000});
 assert.match(await page.locator('#voice').inputValue(),/Кристин/);await page.screenshot({path:join(output,'english-pack-settings.png'),fullPage:true});console.log('Настоящая женская английская речь без сети и голосов ОС: OK');
 await context.setOffline(false);await page.locator('#language').selectOption('de-DE');const install=page.locator('[data-bridge-install-voices]');await install.waitFor({state:'visible'});await install.click();
 await page.waitForFunction(()=>document.querySelector('.bridge-voice-packs [role=status]').textContent.includes('установлены')||document.querySelector('.bridge-voice-packs [role=status]').textContent.includes('Не удалось'),{timeout:180000});
 assert.doesNotMatch(await page.locator('.bridge-voice-packs [role=status]').textContent(),/Не удалось/);
 await page.waitForFunction(()=>document.querySelector('#voice option')?.textContent.includes('Керстин'));
 await page.locator('#save').click();await page.getByText('✓ Настройки сохранены на компьютере.').waitFor();console.log('Установка двух немецких пакетов кнопкой через настоящий HTTPS: OK');
 await context.close();context=await launch();await context.setOffline(true);worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');await worker.evaluate(()=>{chrome.tts.getVoices=callback=>callback([]);});
 const restored=await context.newPage();await restored.goto(`chrome-extension://${id}/options.html`);await restored.locator('#settings-fields:not([disabled])').waitFor();assert.equal(await restored.locator('#language').inputValue(),'de-DE');assert.match(await restored.locator('#voice').inputValue(),/Керстин/);await restored.locator('#volume').fill('0');await restored.locator('#preview').click();await restored.getByText('Проверка завершена. Как вам звучание?').waitFor({timeout:120000});
 await writeFile(join(output,'voice-packs-browser.json'),JSON.stringify({stats,englishOffline:true,germanDownloaded:true,restartOffline:true,nativeVoices:false},null,2));console.log('Установленный немецкий голос сохранён после закрытия Chrome и звучит без сети: OK');
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
