import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scryptSync,randomBytes,timingSafeEqual} from 'node:crypto';
import {openStore} from './store.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const dbPath=process.env.RR_DB||resolve(root,'data/bookings.sqlite');mkdirSync(dirname(dbPath),{recursive:true});
const store=openStore(dbPath),sessions=new Map(),attempts=new Map();
const port=Number(process.env.PORT||4174);const origin=`http://127.0.0.1:${port}`;
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const session=req=>{const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('rr_session='))?.slice(11);const expires=sessions.get(token);if(expires&&expires>Date.now())return token;if(token)sessions.delete(token);return null;};
const limited=(key,max)=>{const now=Date.now();let r=attempts.get(key);if(!r||r.until<now){r={count:0,until:now+900000};attempts.set(key,r);}return ++r.count>max;};
async function body(req){let size=0,parts=[];for await(const p of req){size+=p.length;if(size>12000)throw Error('Request is too large.');parts.push(p);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw Error('Invalid request.');}}
http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
 try{
  if(req.headers.host!==`127.0.0.1:${port}`)return json(res,403,{error:'Use the local preview address.'});
  const url=new URL(req.url,origin),path=url.pathname;
  if(!['GET','POST','DELETE'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
  if(req.method!=='GET'&&(req.headers.origin!==origin||!String(req.headers['content-type']).startsWith('application/json')))return json(res,403,{error:'Please use the booking website to make changes.'});
  if(path==='/api/session'&&req.method==='GET')return json(res,200,{configured:!!store.get('password'),signedIn:!!session(req),localPreview:true});
  if((path==='/api/setup'||path==='/api/login')&&req.method==='POST'){
   if(limited('login',20))return json(res,429,{error:'Too many attempts. Try again in 15 minutes.'});
   const {password}=await body(req);if(typeof password!=='string'||password.length<12||password.length>200)throw Error('Use a password between 12 and 200 characters.');
   let saved=store.get('password');if(path==='/api/setup'){if(saved)return json(res,409,{error:'Owner access is already set up.'});const salt=randomBytes(24).toString('hex');saved={salt,hash:scryptSync(password,salt,64).toString('hex')};store.put('password',saved);}
   if(!saved||!timingSafeEqual(Buffer.from(saved.hash,'hex'),scryptSync(password,saved.salt,64)))return json(res,401,{error:'Password not recognised.'});
   const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);res.setHeader('Set-Cookie',`rr_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return json(res,200,{ok:true});
  }
  if(path==='/api/logout'&&req.method==='POST'){sessions.delete(session(req));res.setHeader('Set-Cookie','rr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
  if(path==='/api/availability'&&req.method==='GET'){
   const day=url.searchParams.get('day'),service=url.searchParams.get('service');const s=store.get('settings');return json(res,200,{slots:store.slots(day,service),services:s.services,open:s.open,close:s.close});
  }
  if(path==='/api/requests'&&req.method==='POST'){
   if(!store.get('password'))return json(res,503,{error:'Booking requests are not open yet. Please call 0405 848 867.'});
   if(limited('requests:'+req.socket.remoteAddress,15))return json(res,429,{error:'Too many requests. Please call us to discuss your booking.'});
   const b=await body(req);if(b.website)throw Error('Unable to accept this request.');if(b.consent!==true)throw Error('Please agree that we can contact you about this request.');
   const j=store.saveJob({day:b.day,start:Number(b.start),service:b.service,name:b.name,phone:b.phone,email:b.email,vehicle:b.vehicle,suburb:b.suburb,notes:b.notes,travel:store.get('settings').travel},true);return json(res,201,{reference:j.id.slice(0,8),message:'Request received. We will contact you to confirm the time, travel and final price. Your booking is not confirmed yet.'});
  }
  if(path.startsWith('/api/admin/')){
   if(!session(req))return json(res,401,{error:'Sign in to your private diary.'});
   if(path==='/api/admin/state'&&req.method==='GET')return json(res,200,{jobs:store.jobs(),offers:store.offers(),blocks:store.blocks(),settings:store.get('settings')});
   if(path==='/api/admin/export'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="rr-bookings-backup.json"');return json(res,200,{exported:new Date().toISOString(),jobs:store.jobs(),offers:store.offers(),blocks:store.blocks(),settings:store.get('settings')});}
   const b=await body(req);
   if(path==='/api/admin/jobs'&&req.method==='POST')store.saveJob(b);
   else if(path==='/api/admin/status'&&req.method==='POST')store.status(b.id,b.status);
   else if(path==='/api/admin/offers'&&req.method==='POST')store.offer(b);
   else if(path==='/api/admin/offers'&&req.method==='DELETE')store.removeOffer(b.id);
   else if(path==='/api/admin/blocks'&&req.method==='POST')store.block(b);
   else if(path==='/api/admin/blocks'&&req.method==='DELETE')store.removeBlock(b.id);
   else if(path==='/api/admin/settings'&&req.method==='POST'){
    const s=store.get('settings');if(!Number.isInteger(b.open)||!Number.isInteger(b.close)||b.open<0||b.close>1440||b.open>=b.close||!Number.isInteger(b.travel)||b.travel<0||b.travel>240)throw Error('Check your opening hours and travel allowance.');
    for(const k of Object.keys(s.services)){if(!Number.isInteger(b.services?.[k]?.minutes)||b.services[k].minutes<15||b.services[k].minutes>600)throw Error('Service lengths must be 15–600 minutes.');s.services[k].minutes=b.services[k].minutes;}
    store.put('settings',{...s,open:b.open,close:b.close,travel:b.travel});
   }else return json(res,404,{error:'Not found.'});return json(res,200,{ok:true});
  }
  const files={'/':'customer.html','/book':'book.html','/admin':'admin.html','/app.css':'app.css','/admin.js':'admin.js','/book.js':'book.js','/shared.js':'shared.js'};
  if(req.method==='GET'&&files[path]){const file=files[path];res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(readFileSync(resolve(root,'public',file)));return;}
  json(res,404,{error:'Not found.'});
 }catch(e){json(res,400,{error:e.message?.includes('SQLITE')?'Unable to save. Refresh and try again.':e.message||'Unable to complete request.'});}
}).listen(port,'127.0.0.1',()=>console.log(`R&R local development preview: ${origin}/admin\nCustomer view: ${origin}/book\nLocal database: ${dbPath}\nNot deployed. Keep real customer records out of development previews.`));
