export const $=s=>document.querySelector(s);
export const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
export const nice=n=>new Date(`2000-01-01T${clock(n)}:00`).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'});
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(t=>p.find(p=>p.type===t).value).join('-');};
export const dayLabel=d=>new Date(d+'T12:00:00+10:00').toLocaleDateString('en-AU',{timeZone:'Australia/Brisbane',weekday:'short',day:'numeric',month:'short'});
export const addDay=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
export async function api(path,method='GET',data){const r=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const b=await r.json();if(!r.ok)throw Error(b.error||'Unable to load.');return b;}
export function notice(text,error=false){const n=$('#notice');n.textContent=text;n.className=error?'notice error':'notice';n.hidden=false;}
