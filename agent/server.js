'use strict';
/* Automaton 24/7: ejecuta en el servidor el mismo código de la app (js/a1..a5.js), sin navegador.
   - El estado se guarda en tu repositorio de GitHub (rama "estado") si hay GITHUB_TOKEN; si no, solo en memoria.
   - API interna (la publica app.py en /agent/...):
       GET  /agent/state  -> estado ligero para que el móvil lo muestre
       POST /agent/cmd    -> {cmd, args, key} órdenes (pausa, capital, ajustes, replicar, importar…)
       GET  /agent/health -> estado del proceso */
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const crypto = require('crypto');

const WEB = process.env.WEB_DIR || path.join(__dirname, '..', 'js');
const PORT = +(process.env.AGENT_PORT || 7000);
const KEY = process.env.AGENT_KEY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = process.env.GITHUB_REPO || 'carmona86c-hub/Autokill';
const BRANCH = process.env.STATE_BRANCH || 'estado';
const FILE = 'agent.json';
const LS_KEY = 'automaton.app.real.v1';
const SAVE_MS = +(process.env.SAVE_MS || 10 * 60e3);
const log = (...a) => console.log(new Date().toISOString(), ...a);
const SELF_ORIGIN = (process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || '').replace(/\/+$/, '');

/* ---------- navegador mínimo: lo justo para que el código de la app funcione sin pantalla ---------- */
function el() {
  const store = { value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, open: false, className: '', checked: false };
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k in store) return store[k];
      if (k === 'options' || k === 'files') return [];
      if (k === 'dataset' || k === 'style') return store[k] || (store[k] = {});
      return proxy;
    },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return proxy; },
  });
  return proxy;
}
const els = {};
const storage = new Map();
const doc = {
  getElementById: id => els[id] || (els[id] = el()),
  querySelector: () => el(), querySelectorAll: () => [],
  addEventListener() {}, visibilityState: 'visible', documentElement: el(),
};
const sandbox = {
  __SERVER__: true, console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  fetch: process.env.AGENT_MOCK ? require(path.resolve(process.env.AGENT_MOCK)) : (u, o) => {
    o = Object.assign({}, o || {}); delete o.mode;  /* "no-cors" es cosa de navegadores */
    /* Kronos está en este mismo servidor: se le llama por dentro, sin salir a internet y volver (más rápido y sin fallos de red) */
    if (SELF_ORIGIN && typeof u === 'string' && u.startsWith(SELF_ORIGIN + '/forecast')) u = 'http://127.0.0.1:' + (process.env.PORT || 10000) + u.slice(SELF_ORIGIN.length);
    return fetch(u, o);
  },
  AbortController, URLSearchParams, FormData, Blob, TextEncoder, TextDecoder, performance,
  WebSocket: process.env.AGENT_MOCK ? undefined : globalThis.WebSocket,  /* conexión continua de precios (Node 22) */
  document: doc, navigator: { onLine: true }, location: { protocol: 'https:', href: 'https://servidor/' },
  localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  addEventListener() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }), devicePixelRatio: 1,
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
const run = code => vm.runInContext(code, ctx);

/* ---------- guardado en GitHub ---------- */
const GH = (process.env.GITHUB_API || 'https://api.github.com') + '/repos/' + REPO;
const gh = (p, o = {}) => fetch(GH + p, Object.assign({}, o, { headers: Object.assign({ Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'automaton-agent', 'X-GitHub-Api-Version': '2022-11-28' }, o.headers || {}) }));
let fileSha = null, lastSaved = '', saveInfo = { at: 0, ok: null, err: null };
async function ensureBranch() {
  const r = await gh('/git/ref/heads/' + BRANCH);
  if (r.ok) return;
  const repo = await (await gh('')).json();
  const main = await (await gh('/git/ref/heads/' + (repo.default_branch || 'main'))).json();
  const c = await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + BRANCH, sha: main.object.sha }) });
  if (!c.ok) throw new Error('no se pudo crear la rama ' + BRANCH + ': ' + c.status);
}
async function loadRemote() {
  if (!TOKEN) return null;
  try {
    await ensureBranch();
    const m = await gh('/contents/' + FILE + '?ref=' + BRANCH);
    if (m.status === 404) return null;
    if (!m.ok) throw new Error('GitHub ' + m.status);
    fileSha = (await m.json()).sha;
    const raw = await gh('/contents/' + FILE + '?ref=' + BRANCH, { headers: { Accept: 'application/vnd.github.raw' } });
    const txt = await raw.text();
    lastSaved = txt;
    return txt;
  } catch (e) { saveInfo.err = 'carga: ' + e.message; log('No se pudo cargar el estado de GitHub:', e.message); return null; }
}
async function saveRemote(force) {
  const cur = storage.get(LS_KEY);
  if (!cur || !TOKEN) return;
  let s; try { s = JSON.parse(cur); } catch (e) { return; }
  if (s.settings && s.settings.notify) s.settings.notify.token = '';  /* el repositorio es público: el token de Telegram no se sube */
  /* números con decimales a 10 cifras significativas: el estado ocupa bastante menos y el error es de millonésimas de céntimo */
  const txt = JSON.stringify(s, (k, v) => typeof v === 'number' && !Number.isInteger(v) && isFinite(v) ? +v.toPrecision(10) : v);
  if (!force && txt === lastSaved) return;
  try {
    const body = { message: 'estado del agente ' + new Date().toISOString(), content: Buffer.from(txt).toString('base64'), branch: BRANCH };
    if (fileSha) body.sha = fileSha;
    let r = await gh('/contents/' + FILE, { method: 'PUT', body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) {  /* sha desfasado: se vuelve a leer y se reintenta una vez */
      const m = await gh('/contents/' + FILE + '?ref=' + BRANCH); if (m.ok) { body.sha = (await m.json()).sha; r = await gh('/contents/' + FILE, { method: 'PUT', body: JSON.stringify(body) }); }
    }
    if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + (await r.text()).slice(0, 120));
    fileSha = (await r.json()).content.sha; lastSaved = txt;
    saveInfo = { at: Date.now(), ok: true, err: null };
  } catch (e) { saveInfo = { at: Date.now(), ok: false, err: e.message }; log('No se pudo guardar en GitHub:', e.message); }
}

/* ---------- arranque ---------- */
async function main() {
  let prev = await loadRemote();
  /* en una actualización, el servidor viejo sigue un momento y guarda al apagarse: si el estado guardado es reciente,
     se espera (hasta 90 s) a ese último guardado para no pisar lo que hizo en ese rato */
  try {
    const ls = prev && JSON.parse(prev).lastSeen;
    if (TOKEN && ls && Date.now() - ls < 11 * 60e3) {
      log('Estado reciente: espero el último guardado del servidor anterior (hasta 90 s)…');
      const sha0 = fileSha;
      for (let i = 0; i < 9; i++) {
        await new Promise(r => setTimeout(r, 10e3));
        const m = await gh('/contents/' + FILE + '?ref=' + BRANCH).catch(() => null);
        if (m && m.ok && (await m.json()).sha !== sha0) { prev = await loadRemote(); log('Recibido el último guardado del servidor anterior.'); break; }
      }
    }
  } catch (e) { log('Espera de relevo:', e.message); }
  if (prev) { storage.set(LS_KEY, prev); log('Estado recuperado de GitHub (' + prev.length + ' bytes).'); }
  else log(TOKEN ? 'Sin estado previo en GitHub: arranca un agente nuevo.' : 'Sin GITHUB_TOKEN: el estado vive solo en memoria.');
  for (const f of ['a1.js', 'a2.js', 'a3.js', 'a4.js', 'a5.js']) run(fs.readFileSync(path.join(WEB, f), 'utf8'));
  /* dinero real: solo si en Render se pone LIVE_TRADING=si (hoy no). Aun así, el modo real tiene que activarse expresamente */
  if (process.env.LIVE_TRADING === 'si') { const br = require('./broker'); sandbox.__liveSend = o => br.send(o, log).catch(e => { o.err = e.message; log('Orden real fallida:', e.message); }); log('ATENCIÓN: conector de órdenes reales cargado.'); }
  /* el token de Telegram puede venir de Render, así sobrevive a reinicios sin estar en el repositorio */
  setTimeout(() => {
    try {
      if (process.env.TELEGRAM_TOKEN) run(`(()=>{const n=nset();n.token=${JSON.stringify(process.env.TELEGRAM_TOKEN)};if(${JSON.stringify(process.env.TELEGRAM_CHAT || '')})n.chat=${JSON.stringify(process.env.TELEGRAM_CHAT || '')};})()`);
      run(`if(!S.settings.device)S.settings.device='Servidor 24/7';`);
    } catch (e) { log(e); }
  }, 3000);
  setInterval(() => { run('save(true)'); saveRemote(false); }, SAVE_MS);
  /* además, se guarda en cuanto se abre o se cierra una operación (si el servidor se cae, no se pierde) */
  let opSig = '';
  setInterval(() => { try { const s = run(`S?S.agents.map(a=>a.positions.length+':'+a.closed.length+':'+(a.vault||0).toFixed(2)).join('|'):''`); if (s && s !== opSig) { const first = !opSig; opSig = s; if (!first) { run('save(true)'); saveRemote(false); } } } catch (e) { } }, 20e3);
  /* Render apaga el plan gratuito tras 15 min sin visitas: el propio agente se visita por su dirección pública cada 9 min */
  const SELF = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
  if (SELF) { const ping = () => fetch(SELF.replace(/\/+$/, '') + '/agent/health').catch(e => log('Autovisita fallida:', e.message)); setTimeout(ping, 60e3); setInterval(ping, 9 * 60e3); }
  http.createServer(handle).listen(PORT, '127.0.0.1', () => log('Agente escuchando en ' + PORT));
  const bye = async () => { try { run('save(true)'); await saveRemote(true); } catch (e) { } process.exit(0); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
}

function send(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(b);
}
function readBody(req) {
  return new Promise((ok, ko) => {
    let n = 0; const ch = [];
    req.on('data', d => { n += d.length; if (n > 8e6) { ko(new Error('demasiado grande')); req.destroy(); } else ch.push(d); });
    req.on('end', () => ok(Buffer.concat(ch).toString('utf8'))); req.on('error', ko);
  });
}
const ready = () => { try { return run('!!S'); } catch (e) { return false; } };
/* diagnóstico: cuánto se queda bloqueado el agente (si pasa de varios segundos, la app no recibe respuesta a tiempo) */
const LAG = { max: 0, maxAt: 0, over5: 0, big: [] }; let lagLast = Date.now();
setInterval(() => { const n = Date.now(), d = n - lagLast - 500; lagLast = n;
  if (d > LAG.max || n - LAG.maxAt > 3600e3) { LAG.max = Math.max(0, d); LAG.maxAt = n; }
  if (d > 5000) { LAG.over5++; LAG.big.unshift([new Date(n).toISOString().slice(11, 19), d]); LAG.big.length = Math.min(LAG.big.length, 8); log('Agente bloqueado', d, 'ms'); } }, 500).unref();
const diag = () => ({ up_s: Math.round(process.uptime()), rss_mb: Math.round(process.memoryUsage().rss / 1048576), lag_max_ms: LAG.max, lag_over5s: LAG.over5, lag_big: LAG.big, state_ms: STATE_MS, kronos: (() => { try { return run('({ok:KR.ok,err:KR.err,asked:KR.asked,ms:KR.ms,loading:!!KR.loading})'); } catch (e) { return null; } })(), gate: (() => { try { return run('({pares:GATE.pairs?Object.keys(GATE.pairs).length:0,err:GATE.err,fallos:GATE.fails})'); } catch (e) { return null; } })(), alpaca: AL ? { practica: true, cuenta: AL.acct, err: AL.err, enviadas: AL.sent, fallos: AL.fails, ultimas: AL.last.slice(0, 5) } : null });
let STATE_MS = 0;
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/agent/health') return send(res, 200, { ok: true, ready: ready(), saved: saveInfo, github: !!TOKEN, keyRequired: !!KEY, diag: diag() });
    if (!ready()) return send(res, 503, { error: 'el agente está arrancando' });
    /* avisos push: clave pública (para suscribirse) y alta/baja de la suscripción del móvil */
    if (req.method === 'GET' && u.pathname === '/agent/push/key') return send(res, 200, { ok: !!VAPID, key: VAPID ? VAPID.pubB64 : null });
    if (req.method === 'POST' && (u.pathname === '/agent/push/sub' || u.pathname === '/agent/push/test')) {
      if (KEY && req.headers['x-agent-key'] !== KEY) return send(res, 401, { ok: false, msg: 'clave incorrecta' });
      if (!VAPID) return send(res, 200, { ok: false, msg: 'El servidor no tiene secreto para los avisos (falta GITHUB_TOKEN o VAPID_SECRET en Render).' });
      const b = JSON.parse(await readBody(req) || '{}');
      if (u.pathname === '/agent/push/sub') {
        const sub = b.sub; if (!sub || !/^https:\/\//.test(sub.endpoint || '') || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return send(res, 400, { ok: false, msg: 'suscripción no válida' });
        const list = pushSubs().filter(x => x.endpoint !== sub.endpoint); if (!b.off) list.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, at: Date.now() });
        pushSave(list); if (b.off) return send(res, 200, { ok: true, msg: 'Avisos desactivados en este móvil.' });
        if (!b.test) return send(res, 200, { ok: true, msg: 'Suscripción guardada.' });  /* renovación silenciosa: sin aviso de prueba */
      }
      const n = await pushSend(b.text || '✅ Avisos activados: te llegarán las compras, ventas y cambios importantes aunque la app esté cerrada.');
      return send(res, 200, { ok: n > 0, msg: n > 0 ? 'Aviso de prueba enviado.' : 'No se pudo enviar el aviso de prueba.' });
    }
    if (req.method === 'GET' && u.pathname === '/agent/state') {
      if (KEY && req.headers['x-agent-key'] !== KEY && u.searchParams.get('key') !== KEY) return send(res, 401, { error: 'clave incorrecta' });
      const t0 = Date.now(), v = run('exportView()'); v.server = { saved: saveInfo, github: !!TOKEN, gate: (() => { try { return run('({pares:GATE.pairs?Object.keys(GATE.pairs).length:0,err:GATE.err})'); } catch (e) { return null; } })(), alpaca: AL ? { cuenta: AL.acct, err: AL.err, enviadas: AL.sent, fallos: AL.fails, ultimas: AL.last.slice(0, 5) } : null }; STATE_MS = Date.now() - t0;
      return send(res, 200, v);
    }
    if (req.method === 'POST' && u.pathname === '/agent/cmd') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (KEY && b.key !== KEY && req.headers['x-agent-key'] !== KEY) return send(res, 401, { ok: false, msg: 'clave incorrecta' });
      ctx.__cmd = { c: String(b.cmd || ''), a: b.args || {} };
      const r = run('(()=>{const c=__cmd.c,a=__cmd.a,r=applyCmd(c,a);if(r.ok){save(true);if(["scan","capital","settings","import","run"].includes(c)&&S.running)setTimeout(()=>tick(c!=="run"),50);}return r;})()');
      if (r.ok && ['import', 'capital', 'settings', 'spawn', 'fund', 'prune', 'unvault'].includes(b.cmd)) saveRemote(false);
      return send(res, 200, r);
    }
    send(res, 404, { error: 'no existe' });
  } catch (e) { log('Error en', u.pathname, e); send(res, 500, { ok: false, msg: 'error del servidor: ' + e.message }); }
}


/* =====================================================================================
   AVISOS PUSH AL MÓVIL (Web Push estándar, sin servicios de pago ni librerías externas)
   La app instalada en el móvil se suscribe; el servidor le envía los avisos (compras, ventas,
   cambios importantes) a través del servicio de avisos del navegador (Google para Chrome),
   y llegan aunque la app esté cerrada.
   - Claves VAPID derivadas de un secreto que ya está en Render (VAPID_SECRET o, si no, GITHUB_TOKEN):
     no se guardan en ningún sitio y son siempre las mismas.
   - Las suscripciones se guardan CIFRADAS dentro del estado (el repositorio es público).
   - Cifrado del mensaje: RFC 8291 (aes128gcm) · firma: RFC 8292 (VAPID, ES256).
   ===================================================================================== */
const PUSH_SECRET = process.env.VAPID_SECRET || TOKEN || '';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const VAPID = (() => {
  if (!PUSH_SECRET) return null;
  try {
    const N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
    let d = BigInt('0x' + crypto.createHmac('sha256', PUSH_SECRET).update('automaton-vapid-1').digest('hex')) % (N - 1n) + 1n;
    const dB = Buffer.from(d.toString(16).padStart(64, '0'), 'hex'), ec = crypto.createECDH('prime256v1'); ec.setPrivateKey(dB);
    const pub = ec.getPublicKey();
    const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(dB), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
    return { pub, pubB64: b64u(pub), key, enc: crypto.createHmac('sha256', PUSH_SECRET).update('automaton-push-store').digest() };
  } catch (e) { log('Avisos push: no se pudieron preparar las claves', e.message); return null; }
})();
const hkdf = (salt, ikm, info, len) => { const prk = crypto.createHmac('sha256', salt).update(ikm).digest(); return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len); };
function pushEncrypt(sub, text) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth), as = crypto.createECDH('prime256v1'); as.generateKeys();
  const asPub = as.getPublicKey(), shared = as.computeSecret(ua), salt = crypto.randomBytes(16);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce), body = Buffer.concat([c.update(Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, body]);
}
function vapidAuth(endpoint) {
  const aud = new URL(endpoint).origin, h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
    p = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://autokill.onrender.com' }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key: VAPID.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${h}.${p}.${b64u(sig)}, k=${VAPID.pubB64}`;
}
/* suscripciones cifradas dentro del estado del agente */
function pushSubs() {
  try { const raw = run('S&&S.pushSubs||""'); if (!raw || !VAPID) return []; const b = Buffer.from(raw, 'base64'), iv = b.subarray(0, 12), tag = b.subarray(12, 28);
    const d = crypto.createDecipheriv('aes-256-gcm', VAPID.enc, iv); d.setAuthTag(tag); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')); } catch (e) { return []; }
}
function pushSave(list) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', VAPID.enc, iv), enc = Buffer.concat([c.update(JSON.stringify(list.slice(-5)), 'utf8'), c.final()]);
  ctx.__ps = Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64'); run('S.pushSubs=__ps;save(true);'); saveRemote(false);
}
async function pushSend(text, title) {
  if (!VAPID) return 0; const subs = pushSubs(); if (!subs.length) return 0; let ok = 0; const keep = [];
  const payload = JSON.stringify({ title: title || 'Automaton', body: String(text).slice(0, 1500), t: Date.now() });
  for (const s of subs) {
    try {
      const r = await fetch(s.endpoint, { method: 'POST', headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal', Authorization: vapidAuth(s.endpoint) }, body: pushEncrypt(s, payload) });
      if (r.status === 404 || r.status === 410) { log('Aviso push: suscripción caducada, se quita'); continue; }
      if (r.ok) ok++; else log('Aviso push rechazado', r.status, (await r.text().catch(() => '')).slice(0, 120));
    } catch (e) { log('Aviso push fallido', e.message); }
    keep.push(s);
  }
  if (keep.length !== subs.length) pushSave(keep);
  return ok;
}
/* cada 20 s: lo nuevo del Registro (compras, ventas y cambios importantes) se envía de una vez */
let pushLastT = 0;
setInterval(async () => {
  try {
    if (!VAPID || !ready()) return; const L0 = run('S.log.slice(0,40).map(e=>({t:e.t,type:e.type,msg:e.msg}))'), ops = run('S.settings.notify?S.settings.notify.ops!==false:true');
    const top = L0.length ? L0[0].t : 0; if (!pushLastT) { pushLastT = top || Date.now(); return; }
    const nu = L0.filter(e => e.t > pushLastT && (['open', 'close'].includes(e.type) ? ops : ['evolve', 'dead', 'tier', 'spawn'].includes(e.type))).reverse();
    if (top > pushLastT) pushLastT = top; if (!nu.length) return;
    await pushSend(nu.slice(-12).map(e => (e.type === 'open' ? '🟢 ' : e.type === 'close' ? '🔵 ' : '⚠️ ') + e.msg).join('\n'));
  } catch (e) { log('Avisos push:', e.message); }
}, 20e3).unref();


/* =====================================================================================
   ALPACA · CUENTA DE PRÁCTICA (paper trading). Solo si en Render existen ALPACA_KEY_ID y ALPACA_SECRET
   y ALPACA_PAPER no es «no». Cada compra y venta de acciones que la simulación hace en Alpaca se envía
   también a tu cuenta de práctica, para ver a qué precio la ejecuta Alpaca de verdad.
   SIEMPRE a paper-api.alpaca.markets (dinero ficticio). La dirección de dinero real no está en este código.
   ===================================================================================== */
const AL = (() => { const id = process.env.ALPACA_KEY_ID || '', sec = process.env.ALPACA_SECRET || '';
  if (!id || !sec || process.env.ALPACA_PAPER === 'no') return null;
  return { base: 'https://paper-api.alpaca.markets', h: { 'APCA-API-KEY-ID': id, 'APCA-API-SECRET-KEY': sec, 'Content-Type': 'application/json' }, acct: null, err: null, sent: 0, fails: 0, last: [] }; })();
async function alCall(method, path, body) {
  const r = await fetch(AL.base + path, { method, headers: AL.h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { }
  if (!r.ok) throw new Error('Alpaca ' + r.status + ' ' + ((j && (j.message || j.code)) || t).toString().slice(0, 160));
  return j;
}
async function alAccount() { try { const a = await alCall('GET', '/v2/account'); AL.acct = { status: a.status, cash: +a.cash, equity: +a.equity, buying_power: +a.buying_power, pdt: a.pattern_day_trader, at: Date.now() }; AL.err = null; } catch (e) { AL.err = e.message; } }
if (AL) { setTimeout(alAccount, 15e3); setInterval(alAccount, 10 * 60e3).unref(); log('Alpaca: cuenta de práctica configurada (paper-api.alpaca.markets)'); }
/* cada 10 s: órdenes nuevas de la simulación en Alpaca → a la cuenta de práctica */
const alDone = new Set(); let alStart = Date.now();
setInterval(async () => {
  if (!AL || !ready()) return;
  try {
    const os = run(`(S.orders||[]).slice(0,30).filter(o=>o.req&&o.req.api==='POST /v2/orders'&&['abrir','cerrar','parcial'].includes(o.kind)).map(o=>({t:o.t,sym:o.sym,kind:o.kind,p:o.req.p,price:o.price}))`);
    for (const o of os.reverse()) {
      const key = o.t + '|' + o.sym + '|' + o.kind; if (alDone.has(key) || o.t < alStart) continue; alDone.add(key);
      try {
        let r;
        if (o.kind === 'cerrar') r = await alCall('DELETE', '/v2/positions/' + encodeURIComponent(o.p.symbol));  /* cierra lo que haya en la cuenta de práctica, aunque la cantidad difiera por redondeos */
        else {
          const body = Object.assign({}, o.p, { client_order_id: ('am-' + o.t + '-' + o.kind).slice(0, 48) });
          try { r = await alCall('POST', '/v2/orders', body); }
          catch (e) {  /* acción que Alpaca no permite comprar en fracciones: se compran acciones enteras con ese importe, si llega a una */
            const n = body.notional && o.price > 0 ? Math.floor(body.notional / o.price) : 0;
            if (!/fraction/i.test(e.message) || n < 1) throw e;
            delete body.notional; body.qty = String(n); body.client_order_id = body.client_order_id.slice(0, 44) + '-w'; r = await alCall('POST', '/v2/orders', body);
          }
        }
        AL.sent++; AL.last.unshift({ t: Date.now(), sym: o.p.symbol, kind: o.kind, sim: o.price, id: r && (r.id || r.order_id) || null, status: r && r.status || 'enviada' });
      } catch (e) { AL.fails++; AL.err = e.message; AL.last.unshift({ t: Date.now(), sym: o.p.symbol, kind: o.kind, err: e.message }); log('Alpaca práctica:', e.message); }
      AL.last.length = Math.min(AL.last.length, 20);
    }
    if (alDone.size > 2000) { alDone.clear(); alStart = Date.now(); }
  } catch (e) { log('Alpaca práctica:', e.message); }
}, 10e3).unref();

process.on('uncaughtException', e => log('Error no capturado:', e));
process.on('unhandledRejection', e => log('Promesa rechazada:', e));
main().catch(e => { log('Fallo al arrancar', e); process.exit(1); });
