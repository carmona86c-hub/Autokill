/* Guarda la app para abrirla aunque falle la red un momento. Los precios nunca se guardan: siempre van en directo. */
const CACHE='automaton-v5';
const SHELL=['./','./index.html','./manifest.json','./js/a1.js','./js/a2.js','./js/a3.js','./js/a4.js','./js/a5.js','./js/a6.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin||e.request.method!=='GET')return; /* mercados: directo a la red */
  /* no-cache: siempre pregunta a la web si hay versión nueva, así cada cambio se ve al abrir la app */
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});

/* avisos push del servidor 24/7: llegan aunque la app esté cerrada */
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{};}catch(x){d={body:e.data?e.data.text():''};}
  e.waitUntil(self.registration.showNotification(d.title||'Automaton',{body:d.body||'',tag:'automaton-'+(d.t||Date.now()),data:{url:'./'}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus();}return self.clients.openWindow('./');}));});
