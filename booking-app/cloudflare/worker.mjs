import {createRemoteJWKSet,jwtVerify} from 'jose';
import {openCloudStore} from './store.generated.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'}});
const keys=new Map();
function configured(e){return !!(e.PUBLIC_ORIGIN&&e.ACCESS_TEAM_DOMAIN&&e.ACCESS_AUD&&e.OWNER_EMAIL);}
export async function owner(request,env){
 if(!configured(env))return false;
 const token=request.headers.get('Cf-Access-Jwt-Assertion')||request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('CF_Authorization='))?.slice(17);
 if(!token)return false;
 try{
  const issuer='https://'+env.ACCESS_TEAM_DOMAIN;
  if(!keys.has(issuer))keys.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')));
  const {payload}=await jwtVerify(token,keys.get(issuer),{issuer,audience:env.ACCESS_AUD,algorithms:['RS256']});
  return typeof payload.email==='string'&&payload.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase();
 }catch{return false;}
}
export async function readBody(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing request.');
 let size=0,text='';const decoder=new TextDecoder();
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();throw Error('Request is too large.');}text+=decoder.decode(value,{stream:true});}
 const b=JSON.parse(text+decoder.decode());if(!b||Array.isArray(b)||typeof b!=='object')throw Error('Invalid request.');return b;
}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!['GET','POST','DELETE'].includes(request.method))return json({error:'Method not allowed.'},405);
 if(request.method!=='GET'&&(url.origin!==env.PUBLIC_ORIGIN||request.headers.get('Origin')!==env.PUBLIC_ORIGIN||!request.headers.get('Content-Type')?.startsWith('application/json')))return json({error:'Please use the booking website to make changes.'},403);
 if(path==='/api/public-config')return json({sitekey:env.TURNSTILE_SITE_KEY||''});
 const privatePath=path==='/admin'||path==='/owner-login'||path.startsWith('/api/admin/');
 const signedIn=(privatePath||path==='/api/session')?await owner(request,env):false;
 if(path==='/api/session')return json({configured:configured(env),signedIn,localPreview:false});
 if(privatePath&&!signedIn){
  if(!configured(env))return json({error:'Owner login is awaiting Cloudflare account setup.'},503);
  if(path.startsWith('/api/'))return json({error:'Sign in again to your private diary.'},401);
  if(path==='/owner-login')return json({error:'Your account does not have owner access. Check the Access email allowlist.'},403);
  return Response.redirect(url.origin+'/owner-login',302);
 }
 if(path==='/owner-login')return Response.redirect(url.origin+'/admin',302);
 if(path==='/api/availability'||path.startsWith('/api/admin/')||path==='/api/requests'){
  if(path==='/api/requests'&&(!configured(env)||!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY))return json({error:'Online requests are not open yet. Please call 0405 848 867.'},503);
  // Never forward caller-supplied owner flags. The DO is reachable only via this binding.
  const headers=new Headers(request.headers);headers.delete('X-RR-Owner');if(signedIn)headers.set('X-RR-Owner','verified');
  return env.DIARY.get(env.DIARY.idFromName('rr-detailing-v1')).fetch(new Request(request,{headers}));
 }
 const routes={'/':'/index.html','/book':'/book.html','/admin':'/admin.html','/app.css':'/app.css','/book.js':'/book.js','/admin.js':'/admin.js','/shared.js':'/shared.js'};
 if(request.method==='GET'&&routes[path]){
  const assetUrl=new URL(routes[path],url);const asset=await env.ASSETS.fetch(new Request(assetUrl));
  const response=new Response(asset.body,asset);response.headers.set('Cache-Control','no-store');response.headers.set('X-Frame-Options','DENY');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','same-origin');return response;
 }
 return json({error:'Not found.'},404);
}};
export class BookingDiary {
 constructor(ctx,env){this.env=env;this.store=openCloudStore(ctx.storage);this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS request_limits (ip TEXT PRIMARY KEY, count INTEGER, until INTEGER)');}
 async fetch(request){
  const url=new URL(request.url),path=url.pathname,s=this.store;
  try{
   if(path==='/api/availability'&&request.method==='GET'){const settings=s.get('settings');return json({slots:s.slots(url.searchParams.get('day'),url.searchParams.get('service')),services:settings.services,open:settings.open,close:settings.close});}
   if(path==='/api/requests'&&request.method==='POST'){
    const b=await readBody(request);if(b.website||b.consent!==true)return json({error:'Please complete the booking form and consent.'},400);
    const ip=request.headers.get('CF-Connecting-IP')||'unknown',now=Date.now();
    this.sql.exec('DELETE FROM request_limits WHERE until < ?',now);
    this.sql.exec('INSERT INTO request_limits VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET count=count+1',ip,now+900000);
    if(this.sql.exec('SELECT count FROM request_limits WHERE ip=?',ip).toArray()[0].count>15)return json({error:'Too many requests. Please call us.'},429);
    if(typeof b.turnstileToken!=='string'||b.turnstileToken.length>2048)return json({error:'Please complete the security check.'},400);
    const check=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:this.env.TURNSTILE_SECRET_KEY,response:b.turnstileToken,remoteip:ip})});
    const verified=await check.json();if(!verified.success||verified.action!=='booking'||verified.hostname!==new URL(this.env.PUBLIC_ORIGIN).hostname)return json({error:'Please retry the security check.'},400);
    const job=s.saveJob({day:b.day,start:Number(b.start),service:b.service,name:b.name,phone:b.phone,email:b.email,vehicle:b.vehicle,suburb:b.suburb,notes:b.notes,travel:s.get('settings').travel},true);
    return json({reference:job.id.slice(0,8)},201);
   }
   if(!path.startsWith('/api/admin/')||request.headers.get('X-RR-Owner')!=='verified')return json({error:'Owner access required.'},401);
   if((path==='/api/admin/state'||path==='/api/admin/export')&&request.method==='GET'){
    const response=json({exported:new Date().toISOString(),jobs:s.jobs(),offers:s.offers(),blocks:s.blocks(),settings:s.get('settings')});
    if(path.endsWith('/export'))response.headers.set('Content-Disposition','attachment; filename="rr-bookings-backup.json"');return response;
   }
   const b=await readBody(request);
   if(path==='/api/admin/jobs'&&request.method==='POST')s.saveJob(b);
   else if(path==='/api/admin/status'&&request.method==='POST')s.status(b.id,b.status);
   else if(path==='/api/admin/offers'&&request.method==='POST')s.offer(b);
   else if(path==='/api/admin/offers'&&request.method==='DELETE')s.removeOffer(b.id);
   else if(path==='/api/admin/blocks'&&request.method==='POST')s.block(b);
   else if(path==='/api/admin/blocks'&&request.method==='DELETE')s.removeBlock(b.id);
   else if(path==='/api/admin/settings'&&request.method==='POST'){
    const settings=s.get('settings');if(!Number.isInteger(b.open)||!Number.isInteger(b.close)||b.open<0||b.close>1440||b.open>=b.close||!Number.isInteger(b.travel)||b.travel<0||b.travel>240)throw Error('Check the opening hours and travel allowance.');
    for(const k of Object.keys(settings.services)){const n=b.services?.[k]?.minutes;if(!Number.isInteger(n)||n<15||n>600)throw Error('Service lengths must be 15–600 minutes.');settings.services[k].minutes=n;}
    s.put('settings',{...settings,open:b.open,close:b.close,travel:b.travel});
   }else return json({error:'Not found.'},404);
   return json({ok:true});
  }catch(e){return json({error:/SQL|syntax|JSON|constraint/i.test(e.message)?'Unable to process the request. Refresh and try again.':e.message},400);}
 }
}
