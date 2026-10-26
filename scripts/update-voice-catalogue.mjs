// Build small, pinned metadata. This script never downloads acoustic models.
import { VOICE_PACKS as current } from '../extension/shared/voice-pack-catalogue.js';
import {mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const revision='5041a7a49ae5b3a0f30e6837769eb03fdbb231bd', base='https://huggingface.co/rhasspy/piper-voices';
async function read(path,raw=false){const r=await fetch(raw?`${base}/raw/${revision}/${path}`:path);if(!r.ok)throw Error(`${r.status}: ${path}`);return new Uint8Array(await r.arrayBuffer());}
const voices=JSON.parse(new TextDecoder().decode(await read(`${base}/raw/${revision}/voices.json`)));
const chosen=new Map(current.map(p=>[p.id,{gender:p.gender,name:p.voiceName}]));
chosen.set('ru_RU-denis-medium',{gender:'male',name:'Bridge — Денис (локальный)'});
chosen.set('ru_RU-irina-medium',{gender:'female',name:'Bridge — Ирина (локальный)'});
const families=new Set(Object.values(voices).map(v=>v.language.family));
const quality={medium:0,low:1,x_low:2,high:3};
for(const family of families){if([...chosen].some(([id])=>voices[id]?.language.family===family))continue;
 const list=Object.values(voices).filter(v=>v.language.family===family).sort((a,b)=>(a.num_speakers===1?0:1)-(b.num_speakers===1?0:1)||(quality[a.quality]??4)-(quality[b.quality]??4));
 for(const voice of list){const file=Object.keys(voice.files).find(p=>p.endsWith('.json'));try{const cfg=JSON.parse(new TextDecoder().decode(await read(file,true)));if((cfg.phoneme_type||'espeak')!=='espeak'||!cfg.espeak?.voice||cfg.num_symbols>512)continue;chosen.set(voice.key,{name:`Bridge — ${voice.name} (локальный)`,gender:''});break;}catch{}}
}
const output=[],queue=[...chosen];let at=0;
async function task(){while(at<queue.length){const [id,meta]=queue[at++];const v=voices[id];const files=Object.keys(v.files),model=files.find(p=>p.endsWith('.onnx')),config=files.find(p=>p.endsWith('.json')),card=files.find(p=>p.endsWith('MODEL_CARD'));
 const cfg=await read(config,true),doc=await read(card,true);const text=new TextDecoder().decode(doc);
 const folder=model.slice(0,model.lastIndexOf('/'));const tree=JSON.parse(new TextDecoder().decode(await read(`https://huggingface.co/api/models/rhasspy/piper-voices/tree/${revision}/${folder}`)));
 const gender=meta.gender||(/\bfemale\b/i.test(text)?'female':/\bmale\b/i.test(text)?'male':'');
 const pack={id,voiceName:meta.name,lang:v.language.code.replace('_','-'),gender,quality:v.quality,speaker:0,license:text.match(/\* License:\s*([^\n]+)/)?.[1].trim()||'См. источник',revision,model:{path:model,bytes:v.files[model].size_bytes,sha256:tree.find(f=>f.path===model).lfs.oid},config:{path:config,bytes:cfg.byteLength,sha256:createHash('sha256').update(cfg).digest('hex')},source:`${base}/tree/${revision}/${folder}`};
 const dir=new URL(`../extension/voices/catalogue/${id}/`,import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('MODEL_CARD.md',dir),doc);
 const testDir=new URL('../tests/voice-configs/',import.meta.url);await mkdir(testDir,{recursive:true});await writeFile(new URL(id+'.json',testDir),cfg);
 output.push(pack);console.log(id,pack.lang,gender||'unspecified');
}}
await Promise.all(Array.from({length:4},task));output.sort((a,b)=>a.lang.localeCompare(b.lang)||a.id.localeCompare(b.id));
await writeFile(new URL('../extension/shared/voice-pack-catalogue.js',import.meta.url),'export const VOICE_PACKS = Object.freeze('+JSON.stringify(output,null,2)+'.map(Object.freeze));\nexport const packById = id => VOICE_PACKS.find(pack => pack.id === id);\nexport const asVoice = pack => ({ voiceName: pack.voiceName, lang: pack.lang, ...(pack.gender ? { gender: pack.gender } : {}), engine: "bundled", speaker: pack.speaker || 0, modelId: pack.id });\n');
console.log('Languages',new Set(output.map(p=>p.lang.split('-')[0])).size,'Voices',output.length);
