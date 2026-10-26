import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {packById} from '../extension/shared/voice-pack-catalogue.js';
const require=createRequire(import.meta.url),{chromium}=require(require.resolve('playwright',{paths:[process.env.BRIDGE_PLAYWRIGHT_ROOT||process.cwd()]}));const profile=await mkdtemp(join(tmpdir(),'bridge-library-')),extensionPath=fileURLToPath(new URL('../extension/',import.meta.url)),output=new URL('../test-results/',import.meta.url);await mkdir(output,{recursive:true});
const launch=()=>chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1280,height:1000},args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,'--no-first-run','--mute-audio']});
let context=await launch();let modelDownloads=0;
try{
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;await worker.evaluate(()=>{chrome.tts.getVoices=callback=>callback([]);});
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/options.html`);await page.locator('#settings-fields:not([disabled])').waitFor();
 await page.locator('[data-bridge-install-voices="ru_RU-denis-medium"]').waitFor();
 assert.equal(await worker.evaluate(async()=> (await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length),0,'Открытие настроек не создаёт фонетический Worker/offscreen');
 await page.locator('[data-bridge-install-voices="ru_RU-denis-medium"]').click();
 await page.waitForFunction(()=>document.querySelector('#voice').value.includes('Денис'),null,{timeout:60000});
 await context.setOffline(true);await page.locator('#volume').fill('0');await page.locator('#preview').click();await page.getByText('Проверка завершена. Как вам звучание?').waitFor({timeout:120000});await context.setOffline(false);
 await page.locator('#language').selectOption('uz-UZ');await page.locator('#source-language').selectOption('en-US');await page.waitForFunction(()=>document.querySelector('.bridge-voice-packs').textContent.includes('не найден'));
 assert.equal(await page.locator('[data-bridge-install-voices]').count(),0);await page.screenshot({path:fileURLToPath(new URL('uzbek-language-status.png',output)),fullPage:true});
 const pack=packById('en_US-john-medium');
 await page.locator('#language').selectOption('en-US');await page.locator(`[data-bridge-install-voices="${pack.id}"]`).click();
 await page.waitForFunction(()=>document.querySelector('#voice').value.includes('Джон'),null,{timeout:60000});
 assert.equal(await page.locator('[data-bridge-install-voices="en_US-kristin-medium"]').count(),1,'Второй голос не устанавливается автоматически');
 assert.equal((await page.evaluate(()=>new Promise(resolve=>chrome.runtime.sendMessage({type:'bridge:voice-packs',language:'en-US'},resolve)))).packs.filter(pack=>pack.installed).length,1);
 await context.setOffline(true);await page.locator('#volume').fill('0');await page.locator('#sample').fill('The selected language is ready.');await page.locator('#preview').click();await page.getByText('Проверка завершена. Как вам звучание?').waitFor({timeout:120000});
 await page.locator('#save').click();await page.getByText('✓ Настройки сохранены на компьютере.').waitFor();await page.screenshot({path:fileURLToPath(new URL('language-library-installed.png',output)),fullPage:true});
 await context.close();context=await launch();await context.setOffline(true);worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');await worker.evaluate(()=>{chrome.tts.getVoices=callback=>callback([]);});
 const restored=await context.newPage();await restored.goto(`chrome-extension://${id}/options.html`);await restored.locator('#settings-fields:not([disabled])').waitFor();assert.match(await restored.locator('#voice').inputValue(),/Джон/);assert.equal(await restored.locator('[data-bridge-resource-mode]').isChecked(),true);
 await restored.locator('#volume').fill('0');await restored.locator('#preview').click();await restored.getByText('Проверка завершена. Как вам звучание?').waitFor({timeout:120000});
 await restored.locator(`.bridge-pack-cards [data-bridge-remove-voice="${pack.id}"]`).click();await restored.waitForFunction(()=>document.querySelector('#preview').disabled);await restored.locator(`[data-bridge-install-voices="${pack.id}"]`).waitFor();
 assert.equal((await restored.evaluate(()=>new Promise(resolve=>chrome.runtime.sendMessage({type:'bridge:voice-packs',language:'en-US'},resolve)))).packs.filter(pack=>pack.installed).length,0,'Удалённый пакет больше не объявляется установленным');
 await writeFile(new URL('language-library-browser.json',output),JSON.stringify({noStartupModel:true,uzbekUnavailable:true,installedExactlyOneVoice:true,russianOffline:true,englishOffline:true,restartOffline:true,removed:true,fixtureDownload:false,realDownload:true,realSynthesis:true},null,2));
 console.log('Библиотека: нулевая загрузка моделей при старте, узбекский недоступен, отдельный голос, офлайн после перезапуска, удаление — OK.');
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
