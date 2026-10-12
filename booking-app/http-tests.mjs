import assert from 'node:assert/strict';
const base=process.env.RR_TEST_URL||'http://127.0.0.1:4175';
const password='Only-for-local-QA-2026!';
async function call(path,method='GET',data,cookie,origin=base){const r=await fetch(base+path,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {r,b:await r.json()};}
assert.equal((await call('/api/admin/state')).r.status,401);
const setup=await call('/api/session');
const login=await call(setup.b.configured?'/api/login':'/api/setup','POST',{password});assert.equal(login.r.status,200);const cookie=login.r.headers.get('set-cookie').split(';')[0];
assert.match(login.r.headers.get('set-cookie'),/HttpOnly/);assert.match(login.r.headers.get('set-cookie'),/SameSite=Strict/);
assert.equal((await call('/api/admin/state','GET',null,cookie)).r.status,200);
assert.equal((await call('/api/admin/offers','POST',{},cookie,'https://other.example')).r.status,403);
assert.equal((await call('/api/setup','POST',{password})).r.status,409);
assert.equal((await call('/api/login','POST',{password:'Wrong-password-here!'})).r.status,401);
const publicData=await call('/api/availability?day=2035-06-15&service=exterior');assert.equal(publicData.r.status,200);assert(!JSON.stringify(publicData.b).includes('password'));
assert.equal((await call('/api/requests','POST',{consent:false})).r.status,400);
assert.equal((await call('/api/admin/export')).r.status,401);
console.log('PASS: private diary and export require login; password check; one-time setup; HttpOnly/SameSite cookie; cross-origin writes rejected; public response privacy; consent required. QA account prepared in isolated test database only.');
