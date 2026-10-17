'use strict';
function buildSettings(){
  {const n=nset();$('tgToken').value=n.token||'';$('tgChat').value=n.chat||'';$('nOps').value=n.ops?'1':'0';$('nDaily').value=n.daily?'1':'0';$('nBk').value=n.bk?'1':'0';$('devName').value=S.settings.device||'';
   $('sysBtn').textContent=n.sys&&('Notification' in window)&&Notification.permission==='granted'?'Activados':'Activar';}
  const s=S.settings;$('sFee').value=(s.fee*100).toFixed(3);$('sDay').value=((s.maxDay||.03)*100).toFixed(1);$('sSlip').value=(s.slip*100).toFixed(3);$('sUni').value=s.universe;$('sTf').value=s.tf;['BN','BF','HL'].forEach(x=>$('m'+x).value=s.markets[x]?'1':'0');$('mSh').value=s.shorts?'1':'0';$('kUrl').value=kset().url||'';$('kMode').value=kset().mode||'off';$('sRep').value=s.repl?'1':'0';$('sKids').value=s.maxKids;
  const P=S.agents[0].params;
  $('pForm').innerHTML=Object.keys(DEF_PARAMS).map(k=>`<div class="field"><label class="lbl" for="p_${k}">${PLABEL[k]}</label><input id="p_${k}" type="number" step="any" inputmode="decimal" value="${P[k]}"></div>`).join('');
}
/* ---------- órdenes: el mismo código las ejecuta aquí o en el servidor 24/7 ---------- */
function applySettings(o){
  const s=S.settings;
  if(isFinite(o.fee)&&o.fee>=0)s.fee=o.fee;if(isFinite(o.maxDay)&&o.maxDay>=.005&&o.maxDay<=.2)s.maxDay=o.maxDay;if(isFinite(o.slip)&&o.slip>=0)s.slip=o.slip;
  if(o.universe>=5&&o.universe<=60&&o.universe!==s.universe){s.universe=o.universe;market.uniAt=0;}
  if(o.markets)['BN','BF','HL'].forEach(x=>{const v=!!o.markets[x];if(v!==s.markets[x]){s.markets[x]=v;market.uniAt=0;}});
  if(!s.markets.BN&&!s.markets.BF&&!s.markets.HL){s.markets.BN=true;}
  if(isFinite(o.maxKids)&&o.maxKids>=0&&o.maxKids<=5)s.maxKids=o.maxKids;
  if('repl' in o)s.repl=!!o.repl;if('shorts' in o)s.shorts=!!o.shorts;
  if(o.kronos){const k=kset(),u=cleanUrl(o.kronos.url),m=o.kronos.mode||'off';if(u!==k.url||m!==k.mode){k.url=u;k.mode=m;KR.cache={};KR.err=null;KR.ok=false;}}
  if(o.notify){const nn=nset(),x=o.notify;if(x.token||!REM.on&&!IS_SERVER)nn.token=x.token||'';nn.chat=x.chat||'';nn.ops=!!x.ops;nn.daily=!!x.daily;nn.bk=!!x.bk;}
  if('device' in o)s.device=String(o.device||'').slice(0,60);
  if(o.tf&&TF_MS[o.tf]&&o.tf!==s.tf){s.tf=o.tf;market.k={};market.kAt={};nextScan=0;market.uniAt=0;}
  if(o.params){const P=S.agents[0].params;for(const k in DEF_PARAMS){const v=parseFloat(o.params[k]);if(isFinite(v)){const [lo,hi]=BOUNDS[k];P[k]=Math.min(hi,Math.max(lo,INTS.has(k)?Math.round(v):v));}}if(P.emaF>=P.emaS)P.emaS=P.emaF+4;}
}
function applyCmd(c,a){
  a=a||{};const kid=()=>agentById(+a.kid),ok=(msg,x)=>Object.assign({ok:true,msg},x||{}),no=msg=>({ok:false,msg});
  switch(c){
    case 'run':S.running=a.on===undefined?!S.running:!!a.on;S.lastSeen=Date.now();if(S.running)nextScan=0;
      L(null,'info',S.running?'Agente reanudado.':'Agente en pausa: no abre operaciones nuevas, pero sigue vigilando los stops de las abiertas.');return ok(S.running?'Reanudado.':'En pausa.');
    case 'scan':return ok('Reevaluando.');
    case 'capital':{const v=+a.v;if(!(v>=20))return no('Mínimo $20');
      S=fresh(v,S.settings,S.exp);ui.radar=[];ui.summary='';ui.scanAt=0;nextScan=0;L(null,'info',`Capital fijado en ${money(v)}. Todo reiniciado.`);
      const low=v<50?'Con menos de $50 casi no podrá operar: cada operación necesita al menos $5 y como mucho un 25 % del capital, así que solo cabe una posición a la vez y no podrá replicarse.':'';
      if(low)L(null,'info','Aviso: '+low);return ok('Capital fijado.'+(low?' '+low:''));}
    case 'settings':applySettings(a);L(null,'info','Ajustes guardados.');return ok('Ajustes guardados.');
    case 'spawn':{const par=agentById(+a.parentId);if(!par)return no('Elige un padre vivo.');const e=spawnChild(par,a.g||{},a.fund||null,true);return e?no('No se pudo replicar: '+e+'.'):ok('Hijo creado: arrancará en los próximos latidos.');}
    case 'fund':{const ch=kid();if(!ch)return no('No hay hijos.');const par=agentById(ch.parentId);const e=par?fundChild(par,ch,a.amt):'sin padre';return e?no('No se pudo financiar: '+e+'.'):ok(`${ch.name} financiado.`);}
    case 'msg':{const ch=kid();if(!ch)return no('No hay hijos.');const par=agentById(ch.parentId);const e=par?sendMsg(par,ch,a.text):'sin padre';if(!e)readInbox(ch);return e?no('No enviado: '+e+'.'):ok(`Mensaje entregado a ${ch.name}.`);}
    case 'verify':{const ch=kid();if(!ch)return no('No hay hijos.');const v=verifyConst(ch);if(!v&&ch.status==='alive')kill(ch,'constitución alterada: el hijo se apaga por seguridad');
      return ok(v?`Constitución de ${ch.name} verificada: huella ${ch.constHash} idéntica a la del original.`:`La constitución de ${ch.name} no coincide${ch.status!=='dead'?'; se ha apagado por seguridad':''}.`);}
    case 'prune':{const n=pruneDead(true);return ok(n?`${n} hijo(s) retirado(s); su dinero volvió a la reserva del padre.`:'No hay hijos muertos sin posiciones que retirar.');}
    case 'report':return ok('Informe listo.',{text:report()});
    case 'export':{const st=JSON.parse(JSON.stringify(S));if(st.settings.notify)st.settings.notify.token='';return ok('Copia lista.',{state:st});}
    case 'import':{const o=a.state;if(!valid(o))return no('La copia no es válida.');o.agents.forEach(x=>{delete x._st;});const tok=nset().token;S=migrate(o);if(IS_SERVER&&!nset().token&&tok)nset().token=tok;
      nextScan=0;market.uniAt=0;ui.radar=[];ui.summary='';ui.scanAt=0;S.lastSeen=Date.now();L(null,'info','Agente cargado desde una copia.');return ok('Copia restaurada.');}
  }
  return no('Orden desconocida.');
}
/* ejecuta una orden: aquí, o en el servidor si este dispositivo lo está mirando */
async function act(c,a){
  if(REM.on){
    try{const r=await fetch(cleanUrl(REM.url)+'/agent/cmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd:c,args:a||{},key:REM.key||''})});
      const j=await r.json();if(r.status===401)return {ok:false,msg:'El servidor pide una clave: escríbela en Ajustes → Servidor 24/7.'};
      await pullRemote().catch(()=>{});render();return j;}
    catch(e){return {ok:false,msg:'No se pudo hablar con el servidor ('+why(e)+').'};}
  }
  const r=applyCmd(c,a);
  if(r.ok){save(true);if(['scan','capital','settings','import','run'].includes(c)){if(c==='run'&&!S.running)render();else tick(c!=='run');}else render();}
  return r;
}
/* lo que el servidor manda a los dispositivos que lo miran: estado ligero, precios y estado de las fuentes */
function exportView(){
  const st=JSON.parse(JSON.stringify(S));if(st.settings.notify){st.settings.notify.hasToken=!!st.settings.notify.token;st.settings.notify.token='';}
  st.log=st.log.slice(0,150);
  st.agents.forEach((a,i)=>{const o=S.agents[i];a._st=stats(o);a.closed=a.closed.slice(0,40);if(a.hist.length>300){const k=Math.ceil(a.hist.length/300);a.hist=a.hist.filter((_,j)=>j%k===0||j===a.hist.length-1);}});
  const keys=new Set([...market.universe,...S.agents.flatMap(a=>a.positions.map(p=>p.sym))]),pick=o=>{const r={};keys.forEach(k=>{if(o[k]!==undefined)r[k]=o[k];});return r;};
  return {at:Date.now(),S:st,market:{price:pick(market.price),meta:pick(market.meta),universe:market.universe,lists:market.lists,src:market.src,err:market.err},
    ui:{radar:ui.radar,summary:ui.summary,reasons:ui.reasons,scanAt:ui.scanAt},KR:{ok:KR.ok,err:KR.err,model:KR.model,ms:KR.ms,at:KR.at,fake:KR.fake,busy:KR.busy,asked:KR.asked}};
}
let remErr=null,remAt=0;
async function pullRemote(){
  try{const j=await fget(cleanUrl(REM.url)+'/agent/state'+(REM.key?'?key='+encodeURIComponent(REM.key):''));
    if(!j||!j.S||!valid(j.S))throw new Error(j&&j.error||'el servidor aún no tiene agente');
    S=j.S;const now=Date.now();
    market.price=j.market.price||{};market.pt={};for(const k in market.price)market.pt[k]=now;
    Object.assign(market.meta,j.market.meta||{});market.universe=j.market.universe||[];market.lists=j.market.lists||{BN:[],BF:[],HL:[]};market.err=j.market.err;
    market.src={};for(const k in j.market.src||{})market.src[k]=Object.assign({},j.market.src[k],{at:j.market.src[k].at?now-(j.at-j.market.src[k].at):0});
    Object.assign(ui,j.ui||{});Object.assign(KR,j.KR||{});if(KR.at)KR.at=now-(j.at-KR.at);
    remErr=null;remAt=now;
  }catch(e){remErr=(e&&e.message&&!/^HTTP|fetch|abort/i.test(e.message))?e.message:why(e);throw e;}
}
const inFrame=(()=>{try{return window.self!==window.top;}catch(e){return true;}})();
function renderBan(){
  const st=Object.values(market.src),tried=st.some(x=>'ok' in x),live=st.some(x=>x.ok&&Date.now()-x.at<90000);
  const show=tried&&!live;$('netBan').hidden=!show;if(!show)return;
  const errs=['BN','BF','HL'].filter(x=>S.settings.markets[x]&&market.src[x]&&market.src[x].err).map(x=>SRCNAME[x]+': '+market.src[x].err).join(' · ');
  const blocked=st.every(x=>!x.err||x.err==='conexión bloqueada');
  if(blocked&&(inFrame||(instantFails>=3&&!okFetches&&navigator.onLine!==false)||location.protocol!=='https:'&&location.protocol!=='http:'&&location.protocol!=='file:')){
    $('netTitle').textContent='Este visor bloquea internet';
    $('netMsg').textContent='La app está abierta dentro de un visor (la app de Claude, WhatsApp o el gestor de archivos) que corta todas las conexiones. Ábrela en Chrome: toca ⋮ → Descargas (o Descargar / Compartir → Guardar); luego en Archivos → Descargas toca index.html y elige Chrome. Si no aparece Chrome, abre Chrome y escribe file:///sdcard/Download/index.html. Después, en Chrome: ⋮ → Añadir a pantalla de inicio.';
    $('netCopy').hidden=false;
  }else if(blocked&&navigator.onLine===false){
    $('netTitle').textContent='Sin internet';
    $('netMsg').textContent='El móvil no tiene conexión a internet. En cuanto vuelva, la app se reconecta sola.';
    $('netCopy').hidden=true;
  }else if(blocked){
    $('netTitle').textContent='No se pueden cargar los mercados';
    $('netMsg').textContent='El navegador no puede conectar con ninguna fuente de precios. Comprueba que tienes internet (prueba a abrir binance.com) y que no hay un bloqueador de anuncios, VPN o modo ahorro de datos cortando la conexión. '+(errs?'Detalle: '+errs+'.':'');
    $('netCopy').hidden=true;
  }else{
    $('netTitle').textContent='No se pueden cargar los mercados';
    $('netMsg').textContent='Las fuentes de precios responden con error. '+errs+'. La app reintenta sola cada 10 segundos.';
    $('netCopy').hidden=true;
  }
}
function render(){
  updateHero();renderBan();
  if(tab==='panel')renderPanel();else if(tab==='log')renderLog();else if(tab==='stats')renderStats();else if(tab==='lin')renderLin();else if(tab==='set'&&REM.on)renderRem();
}
function show(t){
  tab=t;document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id==='s-'+t));
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.t===t)));
  if(t==='set'){buildSettings();renderRem();}render();document.querySelector('main').scrollTop=0;
}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>show(b.dataset.t)));
$('stAgent').addEventListener('change',renderStats);

let armT=null;
$('capBtn').addEventListener('click',async()=>{
  const v=parseFloat($('capIn').value),b=$('capBtn');
  if(!(v>=20)){b.textContent='Mínimo $20';setTimeout(()=>{b.textContent='Fijar y reiniciar';},1800);return;}
  if(!armT){b.textContent='Toca otra vez para confirmar';b.classList.add('warn');armT=setTimeout(()=>{armT=null;b.textContent='Fijar y reiniciar';b.classList.remove('warn');},4000);return;}
  clearTimeout(armT);armT=null;b.classList.remove('warn');b.textContent='Fijar y reiniciar';
  const r=await act('capital',{v});if(!r.ok){b.textContent=r.msg;setTimeout(()=>{b.textContent='Fijar y reiniciar';},2500);}$('stAgent').innerHTML='';
});
$('runBtn').addEventListener('click',()=>act('run',{on:!S.running}));
$('scanBtn').addEventListener('click',()=>act('scan'));
$('repBtn').addEventListener('click',async()=>{
  let txt;if(REM.on){const r=await act('report');txt=r.text||r.msg;}else txt=report();const ta=$('repTxt');ta.value=txt;
  const manual=()=>{ta.hidden=false;ta.focus();ta.select();$('repMsg').textContent='Selecciona todo el texto del recuadro y cópialo.';};
  try{navigator.clipboard.writeText(txt).then(()=>{$('repMsg').textContent='Informe copiado. Pégalo en el chat con Claude.';$('repMsg').className='note up';},manual);}catch(e){manual();}
});
const tgMsg=(t,ok)=>{$('tgMsg').textContent=t;$('tgMsg').className='note '+(ok===true?'up':ok===false?'down':'');};
$('tgFind').addEventListener('click',async()=>{
  const n=nset();n.token=$('tgToken').value.trim();if(!n.token){tgMsg('Primero pega el token del bot.',false);return;}
  tgMsg('Buscando…');
  try{const r=await fetch(TG('getUpdates'));const j=await r.json();if(!j.ok)throw new Error(j.description||'token no válido');
    const m=[...(j.result||[])].reverse().map(u=>u.message||u.channel_post||u.my_chat_member).find(x=>x&&x.chat);
    if(!m){tgMsg('No hay mensajes. Escríbele "hola" a tu bot en Telegram y vuelve a pulsar.',false);return;}
    n.chat=String(m.chat.id);$('tgChat').value=n.chat;save(true);tgMsg('Chat encontrado'+(m.chat.first_name?' ('+m.chat.first_name+')':'')+'. Pulsa "Enviar prueba".',true);}
  catch(e){tgMsg(e&&e.name==='TypeError'?'El navegador no deja leer la respuesta. Escribe a @userinfobot en Telegram, copia tu número (Id) y pégalo en "Número de chat".':'Telegram dice: '+e.message,false);}
});
$('tgTest').addEventListener('click',async()=>{
  const n=nset();n.token=$('tgToken').value.trim();n.chat=$('tgChat').value.trim();save(true);
  if(!tgReady()){tgMsg('Falta el token o el número de chat.',false);return;}
  const body=new URLSearchParams({chat_id:n.chat,text:'✅ Automaton conectado'+(S.settings.device?' desde '+S.settings.device:'')+'. Aquí recibirás los avisos.\n\n'+dailyText()});
  try{const r=await fetch(TG('sendMessage'),{method:'POST',body});const j=await r.json();if(!j.ok)throw new Error(j.description);tgMsg('Mensaje enviado. Míralo en Telegram.',true);}
  catch(e){if(e&&e.name==='TypeError'){fetch(TG('sendMessage'),{method:'POST',body,mode:'no-cors'}).catch(()=>{});tgMsg('Enviado. Comprueba que te ha llegado a Telegram.',true);}else tgMsg('Telegram dice: '+e.message,false);}
});
$('sysBtn').addEventListener('click',async()=>{
  if(!('Notification' in window)){tgMsg('Este navegador no tiene avisos. Usa Telegram.',false);return;}
  try{const p=await Notification.requestPermission();const n=nset();n.sys=p==='granted';save(true);$('sysBtn').textContent=n.sys?'Activados':'Activar';
    if(n.sys){sysPost('Avisos activados.');tgMsg('Avisos del navegador activados.',true);}else tgMsg('Permiso denegado. Puedes activarlo en los ajustes del sitio en Chrome.',false);}
  catch(e){tgMsg('No se pudieron activar aquí. Usa Telegram.',false);}
});
/* copia completa: en modo servidor se pide al servidor (lo que se ve en pantalla es una versión resumida) */
async function fullState(){if(!REM.on)return S;const r=await act('export');if(!r.ok||!r.state)throw new Error(r.msg||'sin copia');return r.state;}
$('bkCopy').addEventListener('click',async()=>{save(true);let st;try{st=await fullState();}catch(e){$('bkMsg').textContent='No se pudo traer la copia del servidor: '+e.message+'.';return;}const j=JSON.stringify(st);try{navigator.clipboard.writeText(j).then(()=>{$('bkMsg').textContent='Copia copiada ('+Math.round(j.length/1024)+' KB). Guárdala en tus notas o pégala en el otro dispositivo con "Pegar copia".';},()=>$('expBtn').click());}catch(e){$('expBtn').click();}});
$('bkTg').addEventListener('click',async()=>{save(true);let st;try{st=await fullState();}catch(e){$('bkMsg').textContent='No se pudo traer la copia del servidor: '+e.message+'.';return;}const cur=S;S=st;const sent=tgBackup();S=cur;$('bkMsg').textContent=sent?'Copia enviada a tu Telegram como archivo.':'Primero configura Telegram en "Avisos".';});
$('bkFile').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=async()=>{let o=null;try{o=JSON.parse(rd.result);}catch(err){}e.target.value='';
    const r=await act('import',{state:o});$('bkMsg').textContent=r.ok?'Copia restaurada desde el archivo'+(REM.on?' en el servidor.':'.'):'Ese archivo no es una copia válida de Automaton.';
    if(r.ok){$('capIn').value=S.initial;$('stAgent').innerHTML='';buildSettings();}};
  rd.readAsText(f);
});
/* servidor 24/7 */
function renderRem(t){
  if(!$('rUrl').value)$('rUrl').value=REM.url||'https://autokill.onrender.com';if(!$('rKey').value&&REM.key)$('rKey').value=REM.key;
  $('rMsg').className='note'+(REM.on&&remErr?' down':REM.on?' up':'');
  $('rMsg').textContent=t||(REM.on?(remErr?'Mirando el servidor, pero no responde: '+remErr+'. Reintentando.':'Mirando el agente del servidor'+(remAt?' · actualizado '+clock(remAt):'')+'. Este dispositivo no opera por su cuenta.'):'Este dispositivo opera su propio agente (solo mientras la app está abierta).');
  $('rOff').disabled=!REM.on;$('rView').disabled=REM.on;
}
const remConf=()=>{REM.url=cleanUrl($('rUrl').value||'https://autokill.onrender.com');REM.key=$('rKey').value.trim();$('rUrl').value=REM.url;};
$('rPush').addEventListener('click',async()=>{
  remConf();const b=$('rPush');b.disabled=true;renderRem('Enviando tu agente al servidor…');
  try{
    if(!REM.on)save(true);
    const local=REM.on?await loadState():S;
    const r=await fetch(REM.url+'/agent/cmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cmd:'import',args:{state:local},key:REM.key})});
    const j=await r.json().catch(()=>({}));
    if(r.status===401)throw new Error('clave incorrecta');if(!r.ok||!j.ok)throw new Error(j.msg||j.error||('el servidor respondió '+r.status));
    REM.on=true;remSave();await pullRemote();render();renderRem('Hecho: tu agente ya funciona 24/7 en el servidor. Desde aquí lo ves y lo controlas.');
  }catch(e){renderRem('No se pudo: '+((e&&e.message&&!/fetch/i.test(e.message))?e.message:'el servidor no responde (si estaba dormido tarda un minuto: vuelve a probar)')+'.');}
  b.disabled=false;
});
$('rView').addEventListener('click',async()=>{
  remConf();const was=REM.on;REM.on=true;renderRem('Conectando con el servidor…');
  try{await pullRemote();remSave();render();renderRem();}
  catch(e){REM.on=was;remSave();renderRem('No se pudo ver el servidor: '+(remErr||'sin respuesta')+'.');}
});
$('rOff').addEventListener('click',async()=>{
  REM.on=false;remSave();remErr=null;S=await loadState();market.universe=[];market.uniAt=0;market.src={BN:{},BF:{},HL:{}};market.price={};ui.radar=[];ui.summary='';ui.scanAt=0;nextScan=0;
  $('capIn').value=S.initial;$('stAgent').innerHTML='';buildSettings();renderRem('Vuelves a usar el agente de este dispositivo. Ojo: si el del servidor sigue activo, ahora tienes dos agentes distintos.');tick(true);
});
$('kTest').addEventListener('click',async()=>{
  const u=cleanUrl($('kUrl').value),m=$('kMsg');$('kUrl').value=u;
  if(!/^https?:\/\//.test(u)){m.textContent='Pega la dirección completa, empezando por https://';m.className='note down';return;}
  m.textContent='Conectando…';m.className='note';
  try{const j=await fget(u+'/');
    if(j.ready){m.textContent='Conectado: '+(j.model||'Kronos')+(j.fake?' (modo simulado)':'')+'. Elige un uso y pulsa Guardar ajustes.';m.className='note up';}
    else{m.textContent=j.error?'El servidor responde pero el modelo falló al cargar: '+j.error:'El servidor responde; el modelo aún se está cargando. Prueba en unos minutos.';m.className='note '+(j.error?'down':'');}}
  catch(e){m.textContent='No se puede conectar ('+why(e)+'). Comprueba la dirección y que el servidor esté en marcha ("Live" en Render). Si estaba dormido, tarda un minuto en despertar: vuelve a probar.';m.className='note down';}
});
$('diagBtn').addEventListener('click',()=>{diagnose().catch(()=>{$('diagBtn').disabled=false;$('diagBtn').textContent='Comprobar conexión';});});
$('quotesBox').addEventListener('toggle',renderQuotes);
$('netRetry').addEventListener('click',()=>{market.uniAt=0;market.universe=[];market.err=null;$('netRetry').textContent='Conectando…';tick(true).finally(()=>{$('netRetry').textContent='Reintentar';});});
$('netCopy').addEventListener('click',()=>{const t=$('netMsg').textContent;try{navigator.clipboard.writeText(t).then(()=>{$('netCopy').textContent='Copiado';},()=>{});}catch(e){}});
$('gBtn').addEventListener('click',async()=>{
  const g={};if($('gName').value.trim())g.name=$('gName').value.trim();if($('gSpec').value)g.spec=$('gSpec').value;if($('gMsg').value.trim())g.msg=$('gMsg').value.trim();
  const r=await act('spawn',{parentId:+$('gPar').value,g,fund:$('gFund').value?+$('gFund').value:null});
  if(r.ok){$('gName').value='';$('gMsg').value='';$('gFund').value='';}$('gInfo').textContent=r.msg;});
const kidSel=()=>agentById(+$('hKid').value);
const hOut=(t)=>{$('hInfo').textContent=t;};
$('hFund').addEventListener('click',async()=>{const r=await act('fund',{kid:+$('hKid').value,amt:+$('hAmt').value});hOut(r.msg);if(r.ok)$('hAmt').value='';});
$('hSend').addEventListener('click',async()=>{const r=await act('msg',{kid:+$('hKid').value,text:$('hMsg').value});hOut(r.msg);if(r.ok)$('hMsg').value='';});
$('hRep').addEventListener('click',()=>{const c=kidSel();if(!c)return hOut('No hay hijos.');hOut(childReport(c));});
$('hVer').addEventListener('click',async()=>{hOut((await act('verify',{kid:+$('hKid').value})).msg);});
$('hPrune').addEventListener('click',async()=>{hOut((await act('prune')).msg);});
function collectSettings(){
  const n=id=>parseFloat($(id).value),params={};for(const k in DEF_PARAMS)params[k]=$('p_'+k).value;
  return {fee:n('sFee')/100,slip:n('sSlip')/100,maxDay:n('sDay')/100,universe:Math.round(n('sUni')),maxKids:Math.round(n('sKids')),
    markets:{BN:$('mBN').value==='1',BF:$('mBF').value==='1',HL:$('mHL').value==='1'},repl:$('sRep').value==='1',shorts:$('mSh').value==='1',
    kronos:{url:$('kUrl').value,mode:$('kMode').value},notify:{token:$('tgToken').value.trim(),chat:$('tgChat').value.trim(),ops:$('nOps').value==='1',daily:$('nDaily').value==='1',bk:$('nBk').value==='1'},
    device:$('devName').value.trim(),tf:$('sTf').value,params};
}
$('saveSet').addEventListener('click',async()=>{
  const r=await act('settings',collectSettings());buildSettings();
  const b=$('saveSet');b.textContent=r.ok?'Guardado':r.msg;setTimeout(()=>{b.textContent='Guardar ajustes';},r.ok?1500:3500);
});
window.addEventListener('resize',()=>{if(tab==='stats')renderStats();});

/* copia de seguridad */
$('expBtn').addEventListener('click',async()=>{save(true);let st;try{st=await fullState();}catch(e){$('bkMsg').textContent='No se pudo traer la copia del servidor: '+e.message+'.';return;}const t=$('bk');t.style.display='block';t.value=JSON.stringify(st);t.focus();t.select();$('bkMsg').textContent='Copia lista: cópiala y guárdala en un sitio seguro (notas, correo).';});
$('impBtn').addEventListener('click',async()=>{
  const t=$('bk');if(t.style.display==='none'){t.style.display='block';t.value='';t.focus();$('bkMsg').textContent='Pega aquí la copia y vuelve a pulsar "Pegar copia".';return;}
  let o=null;try{o=JSON.parse(t.value);}catch(e){}
  const r=await act('import',{state:o});
  if(r.ok){t.value='';t.style.display='none';$('capIn').value=S.initial;$('stAgent').innerHTML='';$('bkMsg').textContent='Copia restaurada'+(REM.on?' en el servidor.':'.');}else $('bkMsg').textContent='La copia no es válida.';
});
/* arranque */
(async()=>{
  S=await loadState();$('capIn').value=S.initial;
  keepAwake();render();tick(true);
  window.__automaton={get S(){return S;},market,KR,tick,eq,total,stats,alive,sessOpen,nextOpen,minsToClose,sessOf,spawnChild,fundChild,sendMsg,pruneDead,verifyConst,checkChild,lifecycle,kill,CONST_HASH};
})();
