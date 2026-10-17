import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),out=new URL('./public/',import.meta.url);
mkdirSync(out,{recursive:true});
for(const file of ['customer.html','admin.html','book.html','admin.js','book.js','shared.js','app.css']){
 let s=readFileSync(new URL('public/'+file,root),'utf8');
 s=s.replace(/<div class="preview">.*?<\/div>/s,'');
 if(file==='customer.html')s=s.replace('</footer>','<p><a href="/admin">Owner login</a></p></footer>');
 if(file==='admin.js'){
  s=s.replace('configured=s.configured;',`if(!s.signedIn){location.replace('/owner-login');return;}configured=true;`);
  s=s.replace("await api('/api/logout','POST',{});", "location.assign('/cdn-cgi/access/logout');return;");
 }
 if(file==='book.html')s=s.replace('<button id="submit-request"','<div id="human-check" class="wide"></div><button id="submit-request"');
 if(file==='book.js'){
  s=s.replace("let service=", "let widget;\nasync function humanCheck(){const c=await api('/api/public-config');if(!c.sitekey)return;window.rrTurnstileReady=()=>{widget=turnstile.render('#human-check',{sitekey:c.sitekey,action:'booking'});};const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=rrTurnstileReady&render=explicit';document.head.append(script);}\nhumanCheck().catch(e=>notice(e.message,true));\nlet service=");
  s=s.replace('service,consent:', "service,turnstileToken:window.turnstile?.getResponse(widget)||'',consent:");
  s=s.replace('notice(e.message,true);await load();','notice(e.message,true);if(window.turnstile&&widget!==undefined)turnstile.reset(widget);await load();');
 }
 writeFileSync(new URL(file==='customer.html'?'index.html':file,out),s);
}
// Keep the same booking rules in both environments; swap only the SQL adapter.
let s=readFileSync(new URL('store.mjs',root),'utf8');
s=s.replace("import {DatabaseSync} from 'node:sqlite';\n",'').replace("import {randomUUID} from 'node:crypto';",'const randomUUID=()=>crypto.randomUUID();');
s=s.replace("'./scheduler.mjs'","'../scheduler.mjs'");
s=s.replace('export function openStore(path){\n const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;','export function openCloudStore(storage){\n const db={exec:s=>storage.sql.exec(s),prepare:s=>({all:(...a)=>storage.sql.exec(s,...a).toArray(),get:(...a)=>storage.sql.exec(s,...a).toArray()[0],run:(...a)=>storage.sql.exec(s,...a).toArray()})};db.exec(`');
s=s.replace(/const transaction=fn=>\{db.exec\('BEGIN IMMEDIATE'\).*?\};/, 'const transaction=fn=>storage.transactionSync(fn);');
if(s.includes('DatabaseSync')||s.includes('BEGIN IMMEDIATE'))throw Error('Store adapter generation failed');
writeFileSync(new URL('./store.generated.mjs',import.meta.url),s);
console.log('Cloudflare assets and shared booking store prepared.');
