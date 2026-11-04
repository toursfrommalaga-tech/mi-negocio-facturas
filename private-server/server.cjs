'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const Engine = require('../site/engine.js');
const pdf = require('./pdf.cjs');
const root = path.resolve(__dirname, '..');
const runtime = path.resolve(process.env.PILOTO_DATA_DIR || path.join(root, 'datos-privados'));
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(runtime, 'adjuntos'), { mode: 0o700, recursive: true });
fs.mkdirSync(path.join(runtime, 'copias'), { mode: 0o700, recursive: true });
const dbPath = path.join(runtime, 'negocio.json'), lockPath = path.join(runtime, 'servidor.lock');
try { fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 }); }
catch { throw Error('Ya existe un servidor o un cierre dejó servidor.lock. Comprueba que el servidor anterior esté cerrado antes de retirar ese archivo.'); }
function cleanup() { try { fs.unlinkSync(lockPath); } catch {} }
process.on('exit', cleanup); process.on('SIGTERM', () => process.exit(0)); process.on('SIGINT', () => process.exit(0));
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const credentials = password => { const salt = crypto.randomBytes(24).toString('hex'); return { salt, digest: crypto.scryptSync(password, salt, 64).toString('hex') }; };
function persist(data) { const temp = dbPath + '.tmp'; const fd = fs.openSync(temp, 'w', 0o600); try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } if(fs.existsSync(dbPath)){const backup=path.join(runtime,'copias','rev-'+data.state.revision+'-'+crypto.randomUUID()+'.json');fs.copyFileSync(dbPath,backup,fs.constants.COPYFILE_EXCL);fs.chmodSync(backup,0o600);}fs.renameSync(temp, dbPath); }
let store;
if (!fs.existsSync(dbPath)) {
  const email = process.env.PILOTO_ADMIN_EMAIL || 'admin@example.invalid';
  const password = process.env.PILOTO_INITIAL_PASSWORD || crypto.randomBytes(18).toString('base64url');
  store = { state: Engine.initial(email), credentials: { [email]: credentials(password) } }; persist(store);
  fs.writeFileSync(path.join(runtime, 'ACCESO_INICIAL.txt'), 'Acceso local al piloto\nCorreo: ' + email + '\nContraseña: ' + password + '\nEstos datos solo sirven en este ordenador. No compartir.\n', { mode: 0o600 });
} else store = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const sessions = new Map(), attempts = new Map();
const context = () => ({ now: new Date().toISOString(), today: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date()), id: prefix => prefix + '-' + crypto.randomUUID(), hash });
const page = fs.readFileSync(path.join(root, 'private-server/Index.html'), 'utf8');
const port = Number(process.env.PORT || 8765);
const origin = 'http://127.0.0.1:' + port;
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function readBody(req) { return new Promise((resolve, reject) => { let parts = [], size = 0; req.on('data', b => { size += b.length; if (size > 6000000) { reject(Error('Archivo superior al límite')); req.destroy(); } else parts.push(b); }); req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { reject(Error('Petición no válida')); } }); req.on('error', reject); }); }
function session(req) {
  const token = /(?:^|; )piloto_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  const s = token && sessions.get(token); if (!s || s.expires < Date.now()) throw Error('Inicia sesión para continuar'); Engine.auth(store.state, s.email); return s;
}
function detect(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return 'image/webp'; return '';
}
async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.headers.host !== '127.0.0.1:' + port && req.headers.host !== 'localhost:' + port) return json(res, 403, { error: 'Host no autorizado' });
  const url = new URL(req.url, origin);
  if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); return; }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    try { const s = session(req); return json(res, 200, { email: s.email, csrf: s.csrf, environment: 'local' }); } catch { return json(res, 401, { error: 'Inicia sesión' }); }
  }
  if (req.method !== 'POST' || !['/api/login', '/api/logout', '/api/action'].includes(url.pathname)) return json(res, 404, { error: 'No encontrado' });
  if (req.headers.origin !== origin && req.headers.origin !== 'http://localhost:' + port) return json(res, 403, { error: 'Origen no autorizado' });
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Formato no permitido' });
  const p = await readBody(req);
  if (url.pathname === '/api/login') {
    const email = String(p.email || '').toLowerCase().trim(), entry = attempts.get(req.socket.remoteAddress) || { count: 0, since: Date.now() };
    if (Date.now() - entry.since > 900000) { entry.count = 0; entry.since = Date.now(); }
    if (entry.count >= 15) return json(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
    entry.count++; attempts.set(req.socket.remoteAddress, entry);
    const c = store.credentials[email], candidate = crypto.scryptSync(String(p.password || '').slice(0, 256), c?.salt || 'sin-cuenta', 64);
    if (!c || !crypto.timingSafeEqual(candidate, Buffer.from(c.digest, 'hex')) || !store.state.users.some(u => u.email === email && u.active)) return json(res, 401, { error: 'Cuenta o contraseña incorrecta' });
    const token = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(24).toString('hex'); sessions.set(token, { email, csrf, expires: Date.now() + 8 * 3600000 }); entry.count = 0;
    res.setHeader('Set-Cookie', 'piloto_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'); return json(res, 200, { csrf, email, environment: 'local' });
  }
  const sess = session(req); if (req.headers['x-csrf-token'] !== sess.csrf) return json(res, 403, { error: 'Sesión no válida; vuelve a entrar' });
  if (url.pathname === '/api/logout') { for (const [token, s] of sessions) if (s === sess) sessions.delete(token); res.setHeader('Set-Cookie','piloto_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  let { action, payload = {} } = p;
  // Nunca aceptar extracciones ni metadatos de almacenamiento declarados por el navegador.
  if (action === 'addDocument') throw Error('Usa la subida protegida de documentos');
  if (action === 'syncReceived') throw Error('La sincronización con Google requiere instalar y autorizar Apps Script. En local no se accede al original.');
  if (action === 'readDocument') {
    const u = Engine.auth(store.state, sess.email), doc = store.state.documents.find(d => d.id === payload.id && (u.role !== 'employee' || d.createdBy === u.email));
    if (!doc || !/^[a-f0-9-]+$/.test(doc.storageId)) throw Error('Documento no autorizado');
    return json(res, 200, { name: doc.name, mime: doc.mime, base64: fs.readFileSync(path.join(runtime, 'adjuntos', doc.storageId)).toString('base64') });
  }
  if (action === 'draftPDF') {
    const d = Engine.run(store.state, sess.email, action, payload, context()).result;
    return json(res, 200, { name: d.draft.id + '.pdf', mime: 'application/pdf', base64: pdf(d.company, d.draft).toString('base64') });
  }
  if (action === 'importExcel') {
    const u = Engine.auth(store.state, sess.email); if (u.role !== 'admin') throw Error('Acceso denegado');
    const bytes = Buffer.from(String(payload.base64 || ''), 'base64'); if (bytes.length > 4 * 1024 * 1024) throw Error('Excel superior a 4 MB');
    const result = spawnSync('python3', [path.join(__dirname, 'xlsx_rows.py')], { input: bytes, timeout: 10000, maxBuffer: 2000000 });
    if (result.status !== 0) throw Error(String(result.stderr || 'Excel no válido').trim());
    payload = { rows: JSON.parse(result.stdout), account: payload.account, name: payload.name, requestId: payload.requestId }; action = 'importBank';
  }
  let upload;
  if (action === 'upload') {
    const bytes = Buffer.from(String(payload.base64 || ''), 'base64'); if (detect(bytes) !== payload.mime || !payload.mime) throw Error('El archivo no coincide con su formato');
    const existing = store.state.requests.find(r => r.key === payload.requestId && r.email === sess.email);
    if (existing) { const doc = store.state.documents.find(d => d.hash === hash(bytes) && d.createdBy === sess.email); if (!doc) throw Error('Operación reutilizada'); return json(res, 200, doc); }
    upload = { bytes, name: crypto.randomUUID() };
    payload = { requestId: payload.requestId, name: String(payload.name || '').replace(/[\\/\x00-\x1f]/g,'_').slice(0,100), mime: payload.mime, size: bytes.length, hash: hash(bytes), storageId: upload.name }; action = 'addDocument';
  }
  const userPassword = action === 'setUser' ? payload.password : undefined;
  if (action === 'setUser') { payload = { ...payload }; delete payload.password; }
  const out = Engine.run(store.state, sess.email, action, payload, context());
  if (out.changed) {
    const next = { state: out.state, credentials: { ...store.credentials } };
    if (action === 'setUser' && userPassword) {
      if (String(userPassword).length < 12 || String(userPassword).length > 128) throw Error('Usa una contraseña de 12 a 128 caracteres');
      next.credentials[out.result.email] = credentials(userPassword);
    }
    // Las contraseñas nunca se guardan ni se devuelven en registros del motor.
    if (upload) fs.writeFileSync(path.join(runtime, 'adjuntos', upload.name), upload.bytes, { flag: 'wx', mode: 0o600 });
    persist(next); store = next;
  }
  return json(res, 200, out.result);
}
let queue = Promise.resolve();
const server = http.createServer((req, res) => { queue = queue.then(() => handle(req, res)).catch(e => { if (!res.headersSent && !res.destroyed) json(res, /Inicia sesión/.test(e.message) ? 401 : 400, { error: e.message }); else if (!res.destroyed) res.end(); }); });
server.requestTimeout = 20000; server.headersTimeout = 15000;
server.listen(port, '127.0.0.1', () => console.log('Piloto disponible en ' + origin + ' · solo este ordenador'));
