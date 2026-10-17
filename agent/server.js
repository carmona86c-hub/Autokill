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
    o = Object.assign({}, o || {}); delete o.mode; return fetch(u, o);  /* "no-cors" es cosa de navegadores */
  },
  AbortController, URLSearchParams, FormData, Blob, TextEncoder, TextDecoder, performance,
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
  const txt = JSON.stringify(s);
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
  const prev = await loadRemote();
  if (prev) { storage.set(LS_KEY, prev); log('Estado recuperado de GitHub (' + prev.length + ' bytes).'); }
  else log(TOKEN ? 'Sin estado previo en GitHub: arranca un agente nuevo.' : 'Sin GITHUB_TOKEN: el estado vive solo en memoria.');
  for (const f of ['a1.js', 'a2.js', 'a3.js', 'a4.js', 'a5.js']) run(fs.readFileSync(path.join(WEB, f), 'utf8'));
  /* el token de Telegram puede venir de Render, así sobrevive a reinicios sin estar en el repositorio */
  setTimeout(() => {
    try {
      if (process.env.TELEGRAM_TOKEN) run(`(()=>{const n=nset();n.token=${JSON.stringify(process.env.TELEGRAM_TOKEN)};if(${JSON.stringify(process.env.TELEGRAM_CHAT || '')})n.chat=${JSON.stringify(process.env.TELEGRAM_CHAT || '')};})()`);
      run(`if(!S.settings.device)S.settings.device='Servidor 24/7';`);
    } catch (e) { log(e); }
  }, 3000);
  setInterval(() => { run('save(true)'); saveRemote(false); }, SAVE_MS);
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
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/agent/health') return send(res, 200, { ok: true, ready: ready(), saved: saveInfo, github: !!TOKEN, keyRequired: !!KEY });
    if (!ready()) return send(res, 503, { error: 'el agente está arrancando' });
    if (req.method === 'GET' && u.pathname === '/agent/state') {
      if (KEY && u.searchParams.get('key') !== KEY) return send(res, 401, { error: 'clave incorrecta' });
      const v = run('exportView()'); v.server = { saved: saveInfo, github: !!TOKEN };
      return send(res, 200, v);
    }
    if (req.method === 'POST' && u.pathname === '/agent/cmd') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (KEY && b.key !== KEY) return send(res, 401, { ok: false, msg: 'clave incorrecta' });
      ctx.__cmd = { c: String(b.cmd || ''), a: b.args || {} };
      const r = run('(()=>{const c=__cmd.c,a=__cmd.a,r=applyCmd(c,a);if(r.ok){save(true);if(["scan","capital","settings","import","run"].includes(c)&&S.running)setTimeout(()=>tick(c!=="run"),50);}return r;})()');
      if (r.ok && ['import', 'capital', 'settings', 'spawn', 'fund', 'prune'].includes(b.cmd)) saveRemote(false);
      return send(res, 200, r);
    }
    send(res, 404, { error: 'no existe' });
  } catch (e) { log('Error en', u.pathname, e); send(res, 500, { ok: false, msg: 'error del servidor: ' + e.message }); }
}

process.on('uncaughtException', e => log('Error no capturado:', e));
process.on('unhandledRejection', e => log('Promesa rechazada:', e));
main().catch(e => { log('Fallo al arrancar', e); process.exit(1); });
