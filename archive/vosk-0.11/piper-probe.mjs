import { createRequire } from "node:module";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
const require=createRequire(import.meta.url);
const {chromium}=require(require.resolve('playwright',{paths:[process.env.BRIDGE_PLAYWRIGHT_ROOT]}));
const profile=await mkdtemp('/private/tmp/bridge-piper-profile-');
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--load-extension=/private/tmp/bridge-piper-probe','--disable-extensions-except=/private/tmp/bridge-piper-probe','--no-first-run']});
try{
 const sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const page=await context.newPage();await page.goto(`chrome-extension://${new URL(sw.url()).host}/index.html`);
 await context.route(/^https?:/,route=>route.abort());
 const records=await page.evaluate(async()=>{const engine=new Worker('./worker.js',{type:'module'}), records=[];try{for(let i=0;i<4;i++){const text=['Привет! Как ваши дела?','Здравствуйте! Откуда вы, ребята? Вы из Англии?','Я хочу смотреть видео с естественной озвучкой, которая не отстаёт от изображения.','Проверяем повторное использование готового голоса.'][i];const r=await new Promise((resolve,reject)=>{engine.onerror=e=>reject(new Error(e.message));engine.onmessage=({data})=>{if(data.error)reject(new Error(data.error));else if(data.audio)resolve(data);};engine.postMessage({id:i,text,threads:1});});records.push({...r,audio:Array.from(new Float32Array(r.audio))});}}finally{engine.terminate();}return records;});
 const pcm=records[1].audio;const b=Buffer.alloc(44+pcm.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(22050,24);b.writeUInt32LE(44100,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);pcm.forEach((v,i)=>b.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(v*32767))),44+i*2));await writeFile('/private/tmp/bridge-piper-probe/denis.wav',b);
 console.log(JSON.stringify(records.map(({audio,...stats})=>stats),null,2));
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
