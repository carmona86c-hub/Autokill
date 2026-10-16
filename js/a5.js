'use strict';
function buildSettings(){
  {const n=nset();$('tgToken').value=n.token||'';$('tgChat').value=n.chat||'';$('nOps').value=n.ops?'1':'0';$('nDaily').value=n.daily?'1':'0';$('nBk').value=n.bk?'1':'0';$('devName').value=S.settings.device||'';
   $('sysBtn').textContent=n.sys&&('Notification' in window)&&Notification.permission==='granted'?'Activados':'Activar';}
  const s=S.settings;$('sFee').value=(s.fee*100).toFixed(3);$('sDay').value=((s.maxDay||.03)*100).toFixed(1);$('sSlip').value=(s.slip*100).toFixed(3);$('sUni').value=s.universe;$('sTf').value=s.tf;['BN','BF','HL'].forEach(x=>$('m'+x).value=s.markets[x]?'1':'0');$('mSh').value=s.shorts?'1':'0';$('kUrl').value=kset().url||'';$('kMode').value=kset().mode||'off';$('sRep').value=s.repl?'1':'0';$('sKids').value=s.maxKids;
  const P=S.agents[0].params;
  $('pForm').innerHTML=Object.keys(DEF_PARAMS).map(k=>`<div class="field"><label class="lbl" for="p_${k}">${PLABEL[k]}</label><input id="p_${k}" type="number" step="any" inputmode="decimal" value="${P[k]}"></div>`).join('');
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
  if(tab==='panel')renderPanel();else if(tab==='log')renderLog();else if(tab==='stats')renderStats();else if(tab==='lin')renderLin();
}
function show(t){
  tab=t;document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id==='s-'+t));
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.t===t)));
  if(t==='set')buildSettings();render();document.querySelector('main').scrollTop=0;
}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>show(b.dataset.t)));
$('stAgent').addEventListener('change',renderStats);

let armT=null;
$('capBtn').addEventListener('click',()=>{
  const v=parseFloat($('capIn').value),b=$('capBtn');
  if(!(v>=20)){b.textContent='Mínimo $20';setTimeout(()=>{b.textContent='Fijar y reiniciar';},1800);return;}
  if(!armT){b.textContent='Toca otra vez para confirmar';b.classList.add('warn');armT=setTimeout(()=>{armT=null;b.textContent='Fijar y reiniciar';b.classList.remove('warn');},4000);return;}
  clearTimeout(armT);armT=null;b.classList.remove('warn');b.textContent='Fijar y reiniciar';
  S=fresh(v,S.settings,S.exp);ui.radar=[];ui.summary='';ui.scanAt=0;nextScan=0;
  L(null,'info',`Capital fijado en ${money(v)}. Todo reiniciado.`);save(true);$('stAgent').innerHTML='';tick(true);
});
$('runBtn').addEventListener('click',()=>{S.running=!S.running;S.lastSeen=Date.now();L(null,'info',S.running?'Agente reanudado.':'Agente en pausa: no abre operaciones nuevas, pero sigue vigilando los stops de las abiertas.');save(true);render();if(S.running){nextScan=0;tick(false);}});
$('scanBtn').addEventListener('click',()=>tick(true));
$('repBtn').addEventListener('click',()=>{
  const txt=report(),ta=$('repTxt');ta.value=txt;
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
$('bkCopy').addEventListener('click',()=>{save(true);const j=JSON.stringify(S);try{navigator.clipboard.writeText(j).then(()=>{$('bkMsg').textContent='Copia copiada ('+Math.round(j.length/1024)+' KB). Guárdala en tus notas o pégala en el otro dispositivo con "Pegar copia".';},()=>$('expBtn').click());}catch(e){$('expBtn').click();}});
$('bkTg').addEventListener('click',()=>{save(true);$('bkMsg').textContent=tgBackup()?'Copia enviada a tu Telegram como archivo.':'Primero configura Telegram en "Avisos".';});
$('bkFile').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{try{const o=JSON.parse(rd.result);if(!valid(o))throw 0;S=migrate(o);save(true);$('capIn').value=S.initial;$('stAgent').innerHTML='';nextScan=0;market.uniAt=0;ui.radar=[];ui.summary='';ui.scanAt=0;$('bkMsg').textContent='Copia restaurada desde el archivo.';buildSettings();tick(true);}catch(err){$('bkMsg').textContent='Ese archivo no es una copia válida de Automaton.';}e.target.value='';};
  rd.readAsText(f);
});
$('kTest').addEventListener('click',async()=>{
  const u=$('kUrl').value.trim().replace(/\/+$/,''),m=$('kMsg');
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
$('gBtn').addEventListener('click',()=>{const par=agentById(+$('gPar').value);if(!par){$('gInfo').textContent='Elige un padre vivo.';return;}
  const g={};if($('gName').value.trim())g.name=$('gName').value.trim();if($('gSpec').value)g.spec=$('gSpec').value;if($('gMsg').value.trim())g.msg=$('gMsg').value.trim();
  const err=spawnChild(par,g,$('gFund').value?+$('gFund').value:null,true);
  if(err){$('gInfo').textContent='No se pudo replicar: '+err+'.';return;}
  $('gName').value='';$('gMsg').value='';$('gFund').value='';save(true);render();$('gInfo').textContent='Hijo creado: arrancará en los próximos latidos.';});
const kidSel=()=>agentById(+$('hKid').value);
const hOut=(t)=>{$('hInfo').textContent=t;save(true);render();};
$('hFund').addEventListener('click',()=>{const c=kidSel();if(!c)return hOut('No hay hijos.');const par=agentById(c.parentId);const e=par?fundChild(par,c,$('hAmt').value):'sin padre';hOut(e?'No se pudo financiar: '+e+'.':`${c.name} financiado.`);if(!e)$('hAmt').value='';});
$('hSend').addEventListener('click',()=>{const c=kidSel();if(!c)return hOut('No hay hijos.');const par=agentById(c.parentId);const e=par?sendMsg(par,c,$('hMsg').value):'sin padre';if(!e){$('hMsg').value='';readInbox(c);}hOut(e?'No enviado: '+e+'.':`Mensaje entregado a ${c.name}.`);});
$('hRep').addEventListener('click',()=>{const c=kidSel();if(!c)return hOut('No hay hijos.');hOut(childReport(c));});
$('hVer').addEventListener('click',()=>{const c=kidSel();if(!c)return hOut('No hay hijos.');const ok=verifyConst(c);if(!ok&&c.status==='alive')kill(c,'constitución alterada: el hijo se apaga por seguridad');hOut(ok?`Constitución de ${c.name} verificada: huella ${c.constHash} idéntica a la del original.`:`La constitución de ${c.name} no coincide${c.status!=='dead'?'; se ha apagado por seguridad':''}.`);});
$('hPrune').addEventListener('click',()=>{const n=pruneDead(true);hOut(n?`${n} hijo(s) retirado(s); su dinero volvió a la reserva del padre.`:'No hay hijos muertos sin posiciones que retirar.');});
$('saveSet').addEventListener('click',()=>{
  const s=S.settings,n=id=>parseFloat($(id).value);
  const fee=n('sFee')/100,slip=n('sSlip')/100,uni=Math.round(n('sUni')),kids=Math.round(n('sKids'));
  if(isFinite(fee)&&fee>=0)s.fee=fee;{const d=n('sDay')/100;if(isFinite(d)&&d>=.005&&d<=.2)s.maxDay=d;}if(isFinite(slip)&&slip>=0)s.slip=slip;
  if(uni>=5&&uni<=60&&uni!==s.universe){s.universe=uni;market.uniAt=0;}
  ['BN','BF','HL'].forEach(x=>{const v=$('m'+x).value==='1';if(v!==s.markets[x]){s.markets[x]=v;market.uniAt=0;}});
  if(!s.markets.BN&&!s.markets.BF&&!s.markets.HL){s.markets.BN=true;}
  if(isFinite(kids)&&kids>=0&&kids<=5)s.maxKids=kids;
  s.repl=$('sRep').value==='1';s.shorts=$('mSh').value==='1';
  {const k=kset(),u=$('kUrl').value.trim(),m=$('kMode').value;if(u!==k.url||m!==k.mode){k.url=u;k.mode=m;KR.cache={};KR.err=null;KR.ok=false;}}
  {const nn=nset();nn.token=$('tgToken').value.trim();nn.chat=$('tgChat').value.trim();nn.ops=$('nOps').value==='1';nn.daily=$('nDaily').value==='1';nn.bk=$('nBk').value==='1';s.device=$('devName').value.trim();}
  if($('sTf').value!==s.tf){s.tf=$('sTf').value;market.k={};market.kAt={};nextScan=0;market.uniAt=0;}
  const P=S.agents[0].params;
  for(const k in DEF_PARAMS){const v=parseFloat($('p_'+k).value);if(isFinite(v)){const [lo,hi]=BOUNDS[k];P[k]=Math.min(hi,Math.max(lo,INTS.has(k)?Math.round(v):v));}}
  if(P.emaF>=P.emaS)P.emaS=P.emaF+4;
  L(null,'info','Ajustes guardados.');save(true);buildSettings();tick(true);
  const b=$('saveSet');b.textContent='Guardado';setTimeout(()=>{b.textContent='Guardar ajustes';},1500);
});
window.addEventListener('resize',()=>{if(tab==='stats')renderStats();});

/* copia de seguridad */
$('expBtn').addEventListener('click',()=>{save(true);const t=$('bk');t.style.display='block';t.value=JSON.stringify(S);t.focus();t.select();$('bkMsg').textContent='Copia lista: cópiala y guárdala en un sitio seguro (notas, correo).';});
$('impBtn').addEventListener('click',()=>{
  const t=$('bk');if(t.style.display==='none'){t.style.display='block';t.value='';t.focus();$('bkMsg').textContent='Pega aquí la copia y vuelve a pulsar "Pegar copia".';return;}
  try{const o=JSON.parse(t.value);if(!valid(o))throw 0;S=migrate(o);save(true);t.value='';t.style.display='none';$('capIn').value=S.initial;$('stAgent').innerHTML='';nextScan=0;market.uniAt=0;ui.radar=[];ui.summary='';ui.scanAt=0;$('bkMsg').textContent='Copia restaurada.';tick(true);}
  catch(e){$('bkMsg').textContent='La copia no es válida.';}
});
/* arranque */
(async()=>{
  S=await loadState();$('capIn').value=S.initial;
  keepAwake();render();tick(true);
  window.__automaton={get S(){return S;},market,KR,tick,eq,total,stats,alive,sessOpen,nextOpen,minsToClose,sessOf,spawnChild,fundChild,sendMsg,pruneDead,verifyConst,checkChild,lifecycle,kill,CONST_HASH};
})();
