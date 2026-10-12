import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {defaults,availability,canFit,validDay,future} from './scheduler.mjs';
export function openStore(path){
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS offers(id TEXT PRIMARY KEY,day TEXT NOT NULL,start INTEGER NOT NULL,services TEXT NOT NULL,UNIQUE(day,start));
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,day TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,travel INTEGER NOT NULL,service TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,vehicle TEXT NOT NULL,suburb TEXT NOT NULL,notes TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS blocks(id TEXT PRIMARY KEY,day TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,note TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS job_day ON jobs(day); CREATE INDEX IF NOT EXISTS offer_day ON offers(day); CREATE INDEX IF NOT EXISTS block_day ON blocks(day);`);
 const get=key=>{const r=db.prepare('SELECT value FROM config WHERE key=?').get(key);return r?JSON.parse(r.value):null;};
 const put=(key,value)=>db.prepare('INSERT INTO config VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
 if(!get('settings'))put('settings',defaults);
 const jobs=()=>db.prepare('SELECT * FROM jobs ORDER BY day,start').all();
 const blocks=()=>db.prepare('SELECT * FROM blocks ORDER BY day,start').all();
 const offers=()=>db.prepare('SELECT * FROM offers ORDER BY day,start').all().map(o=>({...o,services:JSON.parse(o.services)}));
 const slots=(day,service)=>availability(day,offers(),jobs(),blocks(),get('settings'),service);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 function saveJob(input,publicRequest=false){return transaction(()=>{
  const s=get('settings'),existing=input.id?db.prepare('SELECT * FROM jobs WHERE id=?').get(input.id):null;
  if(input.id&&!existing)throw Error('Booking not found.');
  const v={...existing,...input};
  if(!validDay(v.day)||!Number.isInteger(v.start)||!s.services[v.service])throw Error('Check the date, time and service.');
  v.travel=Number(v.travel??s.travel);if(!Number.isInteger(v.travel)||v.travel<0||v.travel>240)throw Error('Travel time must be between 0 and 240 minutes.');
  v.end=v.start+s.services[v.service].minutes;
  if(v.start<0||v.end>1440)throw Error('The service must finish on the same day.');
  if(!future(v.day,v.start))throw Error('Choose a future appointment.');
  for(const key of ['name','phone','vehicle','suburb'])if(typeof v[key]!=='string'||!v[key].trim())throw Error('Name, phone, vehicle and suburb are required.');
  for(const key of ['name','phone','email','vehicle','suburb','notes']){v[key]=String(v[key]||'').trim();if(v[key].length>(key==='notes'?1500:150))throw Error('One of the fields is too long.');}
  if(v.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))throw Error('Check the email address.');
  if(!/^[+()\d\s-]{8,30}$/.test(v.phone))throw Error('Check the phone number.');
  v.status=publicRequest?'pending':v.status||'confirmed';
  if(!['pending','confirmed','declined','cancelled','completed'].includes(v.status))throw Error('Invalid booking status.');
  if(publicRequest&&!slots(v.day,v.service).some(o=>o.start===v.start))throw Error('That time is no longer available. Please choose another or call us.');
  if(['pending','confirmed'].includes(v.status)&&!canFit(v,jobs().filter(j=>j.day===v.day),blocks().filter(b=>b.day===v.day),v.id))throw Error('This overlaps a booking, travel time or blocked time. Adjust the time or travel allowance first.');
  const now=new Date().toISOString();v.id=existing?.id||randomUUID();v.created=existing?.created||now;v.updated=now;
  db.prepare(`INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET day=excluded.day,start=excluded.start,end=excluded.end,travel=excluded.travel,service=excluded.service,name=excluded.name,phone=excluded.phone,email=excluded.email,vehicle=excluded.vehicle,suburb=excluded.suburb,notes=excluded.notes,status=excluded.status,updated=excluded.updated`).run(...['id','day','start','end','travel','service','name','phone','email','vehicle','suburb','notes','status','created','updated'].map(k=>v[k]));return v;
 });}
 function status(id,status){return transaction(()=>{const j=db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!j)throw Error('Booking not found.');const allowed={pending:['confirmed','declined','cancelled'],confirmed:['cancelled','completed'],completed:[],cancelled:[],declined:[]};if(!allowed[j.status]?.includes(status))throw Error('That status change is not available.');if(status==='confirmed'&&!canFit(j,jobs().filter(x=>x.day===j.day),blocks().filter(x=>x.day===j.day),id))throw Error('This time now conflicts with another booking.');db.prepare('UPDATE jobs SET status=?,updated=? WHERE id=?').run(status,new Date().toISOString(),id);});}
 function block(v){if(!validDay(v.day)||!Number.isInteger(v.start)||!Number.isInteger(v.end)||v.start<0||v.end>1440||v.start>=v.end)throw Error('Check the blocked time.');if(!canFit({...v,travel:0},jobs().filter(j=>j.day===v.day),[]))throw Error('Move or cancel the booking in this period before blocking it.');db.prepare('INSERT INTO blocks VALUES (?,?,?,?,?)').run(randomUUID(),v.day,v.start,v.end,String(v.note||'Time off').slice(0,300));}
 function offer(v){const s=get('settings');if(!validDay(v.day)||!Number.isInteger(v.start)||v.start<s.open||v.start>=s.close||!future(v.day,v.start))throw Error('Choose a future start time during business hours.');if(!Array.isArray(v.services)||!v.services.length||v.services.some(k=>!s.services[k]||v.start+s.services[k].minutes>s.close))throw Error('Every selected service must finish by closing time.');db.prepare('INSERT INTO offers VALUES (?,?,?,?) ON CONFLICT(day,start) DO UPDATE SET services=excluded.services').run(randomUUID(),v.day,v.start,JSON.stringify(v.services));}
 return {db,get,put,jobs,blocks,offers,slots,saveJob,status,block,offer,removeOffer:id=>db.prepare('DELETE FROM offers WHERE id=?').run(id),removeBlock:id=>db.prepare('DELETE FROM blocks WHERE id=?').run(id)};
}
