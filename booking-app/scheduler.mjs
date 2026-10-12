export const defaults={open:420,close:1020,travel:30,services:{exterior:{name:'Exterior wash',minutes:60,price:70},interior:{name:'Interior detail',minutes:120,price:110},full:{name:'Full detail',minutes:180,price:170}}};
export const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function minute(s){if(!/^\d{2}:\d{2}$/.test(s||''))throw Error('Choose a valid time.');const [h,m]=s.split(':').map(Number);if(h>23||m>59)throw Error('Choose a valid time.');return h*60+m;}
export function validDay(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'')&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;}
export function future(d,m,now=Date.now()){return validDay(d)&&new Date(`${d}T${clock(m)}:00+10:00`).getTime()>now;}
export const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;
export function occupied(job){return {start:job.start,end:job.end+job.travel};}
export function canFit({start,end,travel=30},jobs,blocks,exclude){const candidate={start,end:end+travel};return !jobs.some(j=>j.id!==exclude&&['pending','confirmed'].includes(j.status)&&overlaps(candidate,occupied(j)))&&!blocks.some(b=>overlaps(candidate,b));}
export function availability(day,offers,jobs,blocks,settings,service,now=Date.now()){
 const s=settings.services[service];if(!s)return [];
 return offers.filter(o=>o.day===day&&o.services.includes(service)).map(o=>({id:o.id,day,start:o.start,end:o.start+s.minutes,travel:settings.travel})).filter(o=>o.start>=settings.open&&o.end<=settings.close&&future(day,o.start,now)&&canFit(o,jobs.filter(j=>j.day===day),blocks.filter(b=>b.day===day)));
}
