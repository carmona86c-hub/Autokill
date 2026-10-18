'use strict';
/* ---------- bucle ---------- */
let timer=null,busy=false,nextScan=0;
const alive=()=>S.agents.filter(a=>a.status==='alive');
let errAt=0;
function reportErr(e){
  try{console.error(e);}catch(x){}
  if(Date.now()-errAt<600000)return;errAt=Date.now();
  L(null,'info',`Error interno: ${(e&&e.message)||e}. La app sigue funcionando; si se repite, copia el informe (Estadísticas) y mándamelo.`);
}
async function tick(manual){
  if(busy)return;busy=true;
  if(REM.on){try{await pullRemote();}catch(e){}finally{busy=false;render();schedule();}return;}
  try{
    const now=Date.now(),act=S.running&&alive().length>0;
    if(act&&now-S.lastSeen>120000)L(null,'pause',`Pausa de ${Math.round((now-S.lastSeen)/60000)} min (app cerrada o en segundo plano): no se operó. Todo lo aprendido y las posiciones siguen guardados; ahora se revisan con el precio actual.`);
    if(!market.universe.length||now-market.uniAt>30*60e3)await loadUniverse();else await pollPrices();
    if(!market.universe.length){market.err='sin mercados';throw new Error('sin mercados');}
    wsSync();
    /* los stops y objetivos se vigilan siempre, también con el agente en pausa */
    S.agents.forEach(a=>{if(a.status==='alive')fundTick(a);});S.agents.forEach(checkExits);labWatch();
    if(act){
      const due=!manual&&now>=nextScan;
      if(due||manual){
        const need=tf=>!market.k[tf]||!Object.keys(market.k[tf]).length||Math.floor(Date.now()/TF_MS[tf])!==(market.kAt||{})[tf];
        if(due||need(S.settings.tf))await Promise.all(tfs().filter(tf=>tf===S.settings.tf?true:need(tf)).map(tf=>fetchKlines(tf).catch(()=>{})));
        ui.krQ=[];
        if(due){alive().forEach(a=>agentScan(a,false));alive().forEach(a=>{maybeSpawn(a);maybeEvolve(a);});capStudy();const m=TF_MS[S.settings.tf];nextScan=Math.ceil(Date.now()/m)*m+4000;}
        else alive().forEach(a=>agentScan(a,true));
        if(krOn()&&!KR.busy){
          const q=new Map();(ui.krQ||[]).sort((x,y)=>y.s-x.s).forEach(x=>{const id=krKey(x.k,x.tf);if(!q.has(id)&&!krEntry(x.k,x.tf)&&KR.tried[id]!==lastT(x.k,x.tf))q.set(id,x);});
          if(kset().mode==='full')S.agents.forEach(a=>a.positions.forEach(p=>{const tf=p.tf||S.settings.tf,id=krKey(p.sym,tf);if(!q.has(id)&&!krEntry(p.sym,tf)&&isOpen(p.sym)&&KR.tried[id]!==lastT(p.sym,tf))q.set(id,{k:p.sym,tf});}));
          /* si el servidor falló, se reintenta como mucho cada 5 minutos */
          if(q.size&&(KR.ok||!KR.err||Date.now()-KR.at>300000))krFetch([...q.values()]);
        }
      }
    }
    S.agents.forEach(a=>{lifecycle(a);if(a.status==='alive'){sweep(a);updateTier(a);checkChild(a);}track(a);});
    pruneDead(false);
    if(act){daily();krPing();}
  }catch(e){if(!(e&&e.message==='sin mercados'))reportErr(e);}
  finally{
    /* un corte de red no es una pausa: el reloj de actividad avanza mientras la app esté abierta */
    if(S.running)S.lastSeen=Date.now();
    save();busy=false;render();schedule();
  }
}
function schedule(){
  clearTimeout(timer);
  const open=S.agents.some(a=>a.positions.length),act=S.running&&alive().length>0;
  timer=setTimeout(()=>tick(false),REM.on?(document.visibilityState==='hidden'?60000:15000):open?5000:market.err?10000:act?15000:30000);
}

/* ---------- pantalla encendida ---------- */
let wl=null;
async function keepAwake(){try{if('wakeLock' in navigator&&document.visibilityState==='visible'&&!wl){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null;});}}catch(e){wl=null;}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){keepAwake();tick(false);}else save(true);});
window.addEventListener('pagehide',()=>save(true));
try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}
/* instalable como app cuando se sirve desde una web (https) */
try{if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});}catch(e){}

/* ---------- interfaz ---------- */
let tab='panel';
function updateHero(){
  const ags=S.agents,vault=ags.reduce((t,a)=>t+(a.vault||0),0),tot=ags.reduce((t,a)=>t+eq(a),0)+vault,op=ags.reduce((t,a)=>t+a.cash,0);
  const npos=ags.reduce((t,a)=>t+a.positions.length,0),pl=tot-S.initial;
  $('hTotal').textContent=money(tot);
  const el=$('hPnl');el.className='pnl '+(pl>=0?'up':'down');
  el.textContent=`${pl>=0?'▲':'▼'} ${sgn(pl)} (${pct(pl/S.initial)}) sobre ${money(S.initial)}`;
  $('tVault').textContent=money(vault);
  $('tOp').textContent=money(op);$('tRes').textContent=String(npos);
  $('tLossL').textContent=pl>=0?'Ganado':'Perdido';
  const le=$('tLoss');le.textContent=money(Math.abs(pl));le.className=pl>=0?'up':'down';
  const root=S.agents[0],t=$('cTier');t.textContent=root.status==='dead'?'apagado':root.tier.replace('_',' ');t.className='chip '+root.tier;
  const c=$('cConn'),on=S.running&&alive().length>0,fresh=Object.values(market.src).some(x=>x.ok&&Date.now()-x.at<90000);
  c.className='chip '+(on&&fresh?'live':'off');c.textContent=(REM.on?(remErr?'servidor sin respuesta':'servidor 24/7 · '):'')+(REM.on&&remErr?'':!alive().length?'todos apagados':!S.running?'en pausa':fresh?'mercado real':market.err?'sin conexión':'conectando');
  $('runBtn').textContent=S.running?'Pausar agente':'Reanudar agente';$('runBtn').disabled=!alive().length;
  $('scanBtn').disabled=!on;
  renderDrop();renderMode();
}
/* desplegable de «Posiciones»: qué tiene, cuánto ha metido, dónde y a qué precio entró y cómo va ese mercado ahora */
let dropOpen=false;
function renderDrop(){
  const box=$('posDrop');box.hidden=!dropOpen;$('tPos').setAttribute('aria-expanded',String(dropOpen));if(!dropOpen)return;
  const items=[];S.agents.forEach(a=>a.positions.forEach(p=>items.push([a,p])));
  if(!items.length){box.innerHTML='<div class="empty">No hay posiciones abiertas ahora mismo.</div>';return;}
  const vNow=p=>Math.max(0,posVal(p,market.price[p.sym]||p.entry)),inv=items.reduce((t,[,p])=>t+p.basis,0),val=items.reduce((t,[,p])=>t+vNow(p),0);
  const dt=t=>new Date(t).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),qn=q=>q>=100?q.toFixed(0):q>=1?q.toFixed(3):q.toPrecision(3);
  box.innerHTML=`<div class="dsum"><span>${items.length} abierta${items.length>1?'s':''} · invertido ${money(inv)}</span><span class="${val-inv>=0?'up':'down'}">vale ${money(val)} (${sgn(val-inv)})</span></div>`+
    items.sort((x,y)=>y[1].basis-x[1].basis).map(([a,p])=>{
      const price=market.price[p.sym]||p.entry,v=vNow(p),pnl=v-p.basis,m=metaOf(p.sym)||{},d24=m.o24>0?price/m.o24-1:null;
      const cls=sessOf(p.sym),open=sessOpen(cls,Date.now()),mc=open?minsToClose(cls):0;
      const ses=open?(isFinite(mc)?'abierto · cierra en '+(mc>=60?Math.floor(mc/60)+' h '+(mc%60)+' min':mc+' min'):'abierto 24 h'):'cerrado';
      return `<div class="dp"><div class="h"><span>${esc(base(p.sym))} <span class="side ${isShort(p)?'s':'l'}">${isShort(p)?'corto':'largo'}</span> <span class="note">${catOf(p.sym)}${S.agents.length>1?' · '+esc(a.name):''}</span></span><span class="mono ${pnl>=0?'up':'down'}">${sgn(pnl)} · ${pct(pnl/p.basis)}</span></div>
      <div class="dkv"><span>Invertido</span><b>${money(p.basis)}</b><span>Vale ahora</span><b class="${pnl>=0?'up':'down'}">${money(v)}</b>
      <span>${isShort(p)?'Vendido en corto':'Comprado'}</span><b>${qn(p.qty)} a ${px(p.entry)}</b><span>Cuándo</span><b>${dt(p.openedAt)}</b>
      <span>Dónde</span><b>${SRCNAME[srcOf(p.sym)]||'—'}</b><span>Precio ahora</span><b>${px(price)}</b>
      <span>Últimas 24 h</span><b class="${d24==null?'':d24>=0?'up':'down'}">${d24==null?'—':pct(d24)}</b><span>Mercado</span><b class="${open?'up':'down'}">${ses}</b>
      <span>Stop</span><b>${px(p.stop)}</b><span>Objetivo</span><b>${px(p.tp)}</b>
      <span>Neto si vende ya</span><b class="${netIfClose(p,price)>=0?'up':'down'}">${sgn(netIfClose(p,price))}</b></div></div>`;}).join('');
}
$('tPos').addEventListener('click',()=>{dropOpen=!dropOpen;renderDrop();});
/* recuadro de modo: Automático (como siempre) o límite de ganancia por operación, ajustable al céntimo */
let modeOpen=false,modeLim=false;
const capV=()=>S.settings.capNet>0?S.settings.capNet:null,c2=v=>(Math.round(v*100)/100).toFixed(2).replace('.',',');
function renderMode(){
  const cap=capV(),t=$('tMode');t.classList.toggle('on',!!cap);t.setAttribute('aria-expanded',String(modeOpen));
  $('tModeL').textContent=(cap?'Límite':'Modo')+' '+(modeOpen?'▴':'▾');$('tModeV').textContent=cap?'+'+money(cap):'Automático';
  const box=$('modeDrop');box.hidden=!modeOpen;if(!modeOpen)return;
  const ae=document.activeElement;if(ae&&ae.id==='capIn2')return; /* no se redibuja mientras escribes */
  const lim=modeLim||!!cap,s=labSum('limit'),m=labSum('manual');
  const line=(t,x)=>x.n?`<div><b>${t}:</b> ${x.n} venta${x.n>1?'s':''}, <span class="${x.pnl>=0?'up':'down'}">${sgn(x.pnl)}</span>${x.done?` · en las ${x.done} ya comparadas: tú <span class="${x.you>=0?'up':'down'}">${sgn(x.you)}</span>, el plan del agente <span class="${x.plan>=0?'up':'down'}">${sgn(x.plan)}</span> → <b class="${x.diff>=0?'up':'down'}">${x.diff>=0?'ganas':'pierdes'} ${money(Math.abs(x.diff))}</b>`:''}${x.pend?` · ${x.pend} en seguimiento`:''}</div>`:'';
  box.innerHTML=`<div class="seg"><button class="btn" type="button" data-m="auto" aria-pressed="${!lim}">Automático</button><button class="btn" type="button" data-m="lim" aria-pressed="${lim}">Límite de ganancia</button></div>
    ${lim?`<div class="step"><button class="btn" type="button" data-d="-1" aria-label="Bajar un céntimo">−</button><input id="capIn2" type="number" inputmode="decimal" step="0.01" min="0.01" value="${cap?cap.toFixed(2):''}" placeholder="0.10" aria-label="Ganancia limpia por operación, en dólares"><button class="btn" type="button" data-d="1" aria-label="Subir un céntimo">+</button></div>
    <div class="pre">${[.05,.1,.15,.2,.5,1].map(v=>`<button class="btn" type="button" data-v="${v}">${c2(v)}</button>`).join('')}</div>
    <p class="note" style="margin:8px 0 4px">${cap?`Cada operación se vende en cuanto deja <b>${money(cap)}</b> limpios (ya restadas las comisiones). El stop y el resto del agente siguen igual. Lo que gane por encima de su capital (${money(S.agents[0].initial)}) pasa a la cartera reservada, congelada.`:'Elige cuánto quieres ganar limpio por operación (puedes ajustarlo al céntimo con − y +).'}</p>`:
    '<p class="note" style="margin:0 0 4px">El agente compra y vende solo, con su plan, como hasta ahora.</p>'}
    ${(S.agents[0].vault||0)>=.005?`<div class="note" style="margin:6px 0 2px">🔒 <b style="color:var(--money)">Cartera reservada: ${money(S.agents[0].vault)}</b> · congelada, no se usa para operar. Cuenta en tu patrimonio total. <button class="btn" type="button" data-unv="1" style="padding:4px 10px;margin-left:4px">Liberar</button></div>`:''}
    ${(()=>{const cs=S.capStudy;if(!cs)return '<div class="lab"><div class="lbl">Estudio de variantes</div><div class="note">En cuanto haya velas suficientes, la app probará varios límites sobre el mercado real reciente y te dirá cuál habría funcionado mejor.</div></div>';
      const real=v=>{const x=labSum('limit',v);return x.n?`${x.n} · ${sgn(x.pnl)}`:'—';};
      return `<div class="lab"><div class="lbl">Estudio de variantes · velas reales recientes</div>
      <div class="tw"><table class="cs"><tr><th>Límite</th><th>Ops</th><th>Resultado</th><th>Aciertos</th><th>Tú en real</th></tr>
      <tr><td>Plan</td><td>${cs.plan.n}</td><td class="${cs.plan.usd>=0?'up':'down'}">${sgn(cs.plan.usd)}</td><td>${Math.round(cs.plan.hit*100)}%</td><td>—</td></tr>
      ${cs.rows.map(r=>`<tr class="${cs.best===r.lim?'best':''}"><td>${c2(r.lim)}</td><td>${r.n}</td><td class="${r.usd>=0?'up':'down'}">${sgn(r.usd)}</td><td>${Math.round(r.hit*100)}%</td><td>${real(r.lim)}</td></tr>`).join('')}</table></div>
      <div class="note" style="margin-top:6px">${cs.best?`Con las mismas señales, el límite que mejor habría ido es <b style="color:var(--money)">${money(cs.best)}</b>.`:'Ningún límite habría superado al plan del agente en este periodo.'} Simulado con posiciones de ${money(cs.notional)}, actualizado ${clock(cs.at)}. Es una referencia del pasado reciente, no una garantía.</div>
      <div class="row" style="margin-top:6px">${cs.best&&cs.best!==cap?`<button class="btn" type="button" data-v="${cs.best}" style="padding:6px 10px">Usar ${money(cs.best)}</button>`:''}<button class="btn" type="button" data-study="1" style="padding:6px 10px">Recalcular</button></div></div>`;})()}
    <div class="lab"><div class="lbl" style="margin-bottom:4px">Tu registro · no cambia el aprendizaje del agente</div>${line('Con límite',s)+line('Ventas manuales',m)||'<div class="note">Aquí se irán guardando las ventas hechas con tu límite o a mano, y lo que habría pasado con el plan del agente, para ver si te compensa.</div>'}</div>`;
}
$('tMode').addEventListener('click',()=>{modeOpen=!modeOpen;if(!modeOpen)modeLim=false;renderMode();});
async function setCap(v){const r=await act('mode',{cap:v});if(!r.ok)alert(r.msg);modeLim=v!=null;renderMode();}
$('modeDrop').addEventListener('click',async e=>{
  const b=e.target.closest&&e.target.closest('button');if(!b)return;
  if(b.dataset.unv){const v=S.agents[0].vault||0;if(!confirm(`¿Devolver los ${money(v)} reservados al capital del agente? Podrá operar con ellos (y también perderlos). Tu patrimonio total no cambia.`))return;const r=await act('unvault',{});if(!r.ok)alert(r.msg);renderMode();updateHero();return;}
  if(b.dataset.m==='auto'){modeLim=false;setCap(null);return;}
  if(b.dataset.m==='lim'){modeLim=true;renderMode();const i=$('capIn2');if(i&&!capV())i.focus();return;}
  if(b.dataset.study){const r=await act('study');if(r&&!r.ok)alert(r.msg);renderMode();return;}
  if(b.dataset.v)return setCap(+b.dataset.v);
  if(b.dataset.d){const i=$('capIn2'),cur=parseFloat(String(i&&i.value||'').replace(',','.'))||capV()||.1;setCap(Math.max(.01,Math.round((cur+(+b.dataset.d)*.01)*100)/100));}
});
$('modeDrop').addEventListener('change',e=>{if(e.target.id!=='capIn2')return;const v=parseFloat(String(e.target.value).replace(',','.'));e.target.blur();if(v>0)setCap(v);else renderMode();});
$('modeDrop').addEventListener('keydown',e=>{if(e.target.id==='capIn2'&&e.key==='Enter')e.target.blur();});
function renderPanel(){
  const items=[];S.agents.forEach(a=>a.positions.forEach(p=>items.push([a,p])));
  const ae=document.activeElement,typing=ae&&ae.tagName==='INPUT'&&ae.closest&&ae.closest('#posList'); /* no se redibuja mientras escribes el límite */
  if(!typing){$('posList').innerHTML=items.length?items.map(([a,p])=>{
    const price=market.price[p.sym]||p.entry,net=netIfClose(p,price),dir=isShort(p)?-1:1,pnl=dir*(price-p.entry)*p.qty,pp=dir*(price-p.entry)/p.entry;
    const key=esc(p.sym)+'|'+p.openedAt,open=posOpen.has(p.sym+'|'+p.openedAt),pos=Math.max(0,Math.min(1,(price-p.stop)/(p.tp-p.stop)))*100;
    return `<div class="pos"><button class="prow" type="button" data-tog="${key}" aria-expanded="${open}">
        <span class="pn">${esc(base(p.sym))} <span class="side ${isShort(p)?'s':'l'}">${isShort(p)?'corto':'largo'}</span><small>${catOf(p.sym)}${S.agents.length>1?' · '+esc(a.name):''} · ${Math.round((Date.now()-p.openedAt)/60000)} min</small></span>
        <canvas class="spark" data-k="${key}" aria-hidden="true"></canvas>
        <span class="pv"><b class="${pnl>=0?'up':'down'}">${sgn(pnl)}</b>${pct(pp)} · neto <span class="${net>=0?'up':'down'}">${sgn(net)}</span></span>
        <span class="chev">${open?'▴':'▾'}</span></button>
      ${open?`<div class="pd">
      ${posCandles(p).length>=5?`<canvas class="pchart" data-k="${key}" style="width:100%;height:150px;display:block;margin:2px 0" aria-label="Gráfico de ${esc(base(p.sym))}"></canvas>`:`<div class="bar"><i style="left:${pos}%"></i></div>`}
      <div class="sub"><span>stop ${px(p.stop)}</span><span>${px(price)}</span><span>objetivo ${px(p.tp)}</span></div>
      <div class="sub"><span>${money(p.basis)} invertidos</span><span>entrada ${px(p.entry)}</span><span>velas ${p.tf||S.settings.tf}</span></div>
      <div class="sub" style="color:var(--fg)"><span>Si se vende ahora, te queda limpio${capV()?' · vende a +'+money(capV()):''}</span><b class="${net>=0?'up':'down'}">${sgn(net)}</b></div></div>`:''}</div>`;}).join(''):
    '<div class="empty">Sin posiciones. El agente espera una señal que supere sus filtros.</div>';
  const find=k=>{const i=k.lastIndexOf('|'),sym=k.slice(0,i).replace(/&amp;/g,'&'),t=k.slice(i+1);const it=items.find(([,p])=>p.sym===sym&&String(p.openedAt)===t);return it&&it[1];};
  document.querySelectorAll('#posList canvas.spark').forEach(cv=>{const p=find(cv.dataset.k);if(p)drawSpark(cv,p);});
  document.querySelectorAll('#posList canvas.pchart').forEach(cv=>{const p=find(cv.dataset.k);if(p)drawPos(cv,p);});}
  renderMarkets();renderQuotes();
  const mp=S.agents[0].params.minScore;
  $('radar').innerHTML=ui.radar.length?ui.radar.map(r=>`<div class="radar"><span title="${catOf(r.sym)}">${esc(base(r.sym))}<small>${catOf(r.sym)} · ${r.tf} · ${r.side==='short'?'baja':'alza'}${(()=>{const f=krOn()&&krOf(r.sym,r.tf);return f?' · IA '+pct(f.ret,2):'';})()}</small></span><span class="meter ${r.score>=mp?'hot':''}"><i style="width:${r.score}%"></i></span><span>${r.score}</span></div>`).join(''):'<div class="empty">Esperando la primera vela…</div>';
  $('scanInfo').textContent=ui.scanAt?`${ui.summary}.${ui.reasons?' Por qué no compra el resto: '+ui.reasons+'.':''} Última evaluación ${clock(ui.scanAt)}.`:(market.err?`Sin conexión con el mercado (${market.err}). Reintentando.`:'Conectando con el mercado real…');
}
/* gráfico real de cada posición: velas del activo en su escala, con la entrada, el stop y el objetivo */
function posCandles(p){
  const tf=p.tf||S.settings.tf,k=kOf(tf,p.sym)||((market.kpos||{})[p.sym+'|'+tf])||[];
  const c=k.slice(-60).map(x=>({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c}));if(!c.length)return c;
  const price=market.price[p.sym],ms=TF_MS[tf]||9e5,last=c[c.length-1];
  if(price>0){if(Date.now()>=last.t+ms)c.push({t:last.t+ms*Math.floor((Date.now()-last.t)/ms),o:last.c,h:Math.max(last.c,price),l:Math.min(last.c,price),c:price});
    else{last.c=price;last.h=Math.max(last.h,price);last.l=Math.min(last.l,price);}}
  return c.slice(-60);
}
function drawPos(cv,p){
  const c=posCandles(p),dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;if(!w||c.length<5)return;
  cv.width=w*dpr;cv.height=h*dpr;const g=cv.getContext('2d');g.scale(dpr,dpr);
  const cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim(),up=col('--up'),dn=col('--down'),mu=col('--mute'),ln=col('--line');
  let lo=Math.min(...c.map(x=>x.l),p.stop,p.tp,p.entry),hi=Math.max(...c.map(x=>x.h),p.stop,p.tp,p.entry);const pad=(hi-lo)*.06||hi*.001;lo-=pad;hi+=pad;
  const R=74,W=w-R,n=c.length,step=W/n,bw=Math.max(1,Math.min(8,step*.65)),Y=v=>4+(hi-v)/(hi-lo)*(h-18),X=i=>i*step+step/2;
  g.font='10px '+col('--mono');g.textBaseline='middle';
  /* velas */
  c.forEach((x,i)=>{const cl=x.c>=x.o?up:dn;g.strokeStyle=cl;g.fillStyle=cl;g.lineWidth=1;
    g.beginPath();g.moveTo(Math.round(X(i))+.5,Y(x.h));g.lineTo(Math.round(X(i))+.5,Y(x.l));g.stroke();
    const y1=Y(Math.max(x.o,x.c)),y2=Y(Math.min(x.o,x.c));g.fillRect(X(i)-bw/2,y1,bw,Math.max(1,y2-y1));});
  /* momento de la entrada */
  const t0=c[0].t,t1=c[n-1].t,ei=t1>t0?(p.openedAt-t0)/(t1-t0)*(n-1):-1;
  if(ei>=0&&ei<=n-1){g.strokeStyle=mu;g.setLineDash([2,3]);g.beginPath();g.moveTo(X(ei),4);g.lineTo(X(ei),h-14);g.stroke();g.setLineDash([]);}
  /* niveles: objetivo, entrada, stop y precio actual, con su etiqueta a la derecha */
  const lab=[],lvl=(v,cl,txt,dash)=>{g.strokeStyle=cl;g.setLineDash(dash);g.beginPath();g.moveTo(0,Y(v));g.lineTo(W,Y(v));g.stroke();g.setLineDash([]);lab.push({y:Y(v),cl,txt});};
  lvl(p.tp,up,'obj '+px(p.tp),[5,4]);lvl(p.entry,mu,'ent '+px(p.entry),[2,3]);lvl(p.stop,dn,'stop '+px(p.stop),[5,4]);
  const price=c[n-1].c;lab.push({y:Y(price),cl:col('--fg'),txt:px(price),now:1});
  lab.sort((a,b)=>a.y-b.y);for(let i=1;i<lab.length;i++)if(lab[i].y-lab[i-1].y<12)lab[i].y=lab[i-1].y+12;
  lab.forEach(l=>{g.fillStyle=l.cl;if(l.now){g.fillRect(W+1,l.y-6,R-2,12);g.fillStyle=col('--panel');}g.textAlign='left';g.fillText(l.txt,W+3,l.y);});
  g.strokeStyle=ln;g.beginPath();g.moveTo(0,h-13.5);g.lineTo(W,h-13.5);g.stroke();
  const tfm=t=>new Date(t).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  g.fillStyle=mu;g.textAlign='left';g.fillText(tfm(t0),0,h-6);g.textAlign='right';g.fillText(tfm(t1)+' · velas '+(p.tf||S.settings.tf),W,h-6);
}
/* cada posición abierta es un desplegable: resumen con mini gráfica; al tocarla, el detalle */
const posOpen=new Set();
$('posList').addEventListener('click',e=>{
  const tg=e.target.closest&&e.target.closest('button[data-tog]');if(!tg)return;
  const k=tg.dataset.tog.replace(/&amp;/g,'&');posOpen.has(k)?posOpen.delete(k):posOpen.add(k);render();
});
function drawSpark(cv,p){
  const c=posCandles(p).slice(-30).map(x=>x.c),dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;if(!w||c.length<2)return;
  cv.width=w*dpr;cv.height=h*dpr;const g=cv.getContext('2d');g.scale(dpr,dpr);
  const cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim();
  let lo=Math.min(...c,p.entry),hi=Math.max(...c,p.entry);if(hi-lo<hi*1e-6){hi+=hi*1e-4;lo-=hi*1e-4;}
  const X=i=>1+i*(w-2)/(c.length-1),Y=v=>2+(hi-v)/(hi-lo)*(h-4),good=isShort(p)?c[c.length-1]<=p.entry:c[c.length-1]>=p.entry;
  g.strokeStyle=col('--mute');g.setLineDash([2,2]);g.lineWidth=1;g.beginPath();g.moveTo(0,Y(p.entry));g.lineTo(w,Y(p.entry));g.stroke();g.setLineDash([]);
  g.strokeStyle=col(good?'--up':'--down');g.lineWidth=1.5;g.beginPath();c.forEach((v,i)=>i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v)));g.stroke();
}
/* ---------- estudio de variantes del límite de ganancia ----------
   Con las velas reales ya descargadas, simula las reglas del agente con distintos límites de ganancia limpia por operación
   (y sin límite, que es su plan) y compara. Es conocimiento para ti: no cambia cómo opera el agente en automático. */
const CAP_LIMS=[.03,.05,.1,.15,.2,.3,.5,1];
/* mismas salidas que en real (ver simCore), con el límite de ganancia como variante */
const simCapR=(s,P,i0,i1,cost,shorts,rL)=>simCore(s,P,i0,i1,cost,shorts,rL);
function capStudy(force){
  const now=Date.now(),cs=S.capStudy;if(!force&&cs&&now-cs.at<3600e3)return cs&&'reciente';
  const a=S.agents[0];if(!a||a.status!=='alive')return null;
  const P=a.params,ser=[];for(const tf of tfs())for(const k of uni()){const c=kOf(tf,k);if(c&&c.length>=150)ser.push({s:serie(c),cost:costOf(k),ms:TF_MS[tf],sh:canShort(k)});}
  if(ser.length<8)return 'aún no hay velas suficientes';
  const cl=S.agents.flatMap(x=>x.closed).slice(0,40),notional=cl.length?cl.reduce((t,x)=>t+x.qty*x.entry,0)/cl.length:Math.max(MIN_NOTIONAL,eq(a)*P.maxPosPct);
  const run=rL=>{let n=0,w=0,sum=0,min=0;for(const x of ser)simCapR(x.s,P,60,x.s.k.length,x.cost,x.sh,rL).forEach(o=>{n++;sum+=o.r;if(o.r>0)w++;min+=o.bars*x.ms/60000;});
    return {n,usd:sum*notional,hit:n?w/n:0,min:n?min/n:0};};
  const plan=run(Infinity),rows=CAP_LIMS.map(l=>Object.assign({lim:l},run(l/notional)));
  const best=rows.filter(r=>r.n>=10).sort((x,y)=>y.usd-x.usd)[0]||null;
  S.capStudy={at:now,notional,series:ser.length,plan,rows,best:best&&best.usd>plan.usd?best.lim:null};
  return 'hecho';
}
function capReport(){
  const cs=S.capStudy;if(!cs)return '\nVARIANTES DEL LÍMITE: aún sin estudio (necesita velas suficientes)';
  const f=r=>`${r.n} ops · ${sgn(r.usd)} · ${Math.round(r.hit*100)}% aciertos · ${Math.round(r.min)} min de media`;
  return '\nVARIANTES DEL LÍMITE (simuladas con velas reales, posición media '+money(cs.notional)+', '+cs.series+' series, '+new Date(cs.at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+')\n'+
    '  plan del agente (sin límite): '+f(cs.plan)+'\n'+cs.rows.map(r=>`  límite ${money(r.lim)}: ${f(r)}${cs.best===r.lim?'  ← mejor':''}`).join('\n')+
    '\n  En real con tu límite: '+([...new Set(((S.lab||{}).list||[]).filter(e=>e.kind==='limit').map(e=>e.limit))].sort((a,b)=>a-b).map(v=>{const x=labSum('limit',v);return `${money(v)} → ${x.n} ventas ${sgn(x.pnl)}${x.done?' (plan '+sgn(x.plan)+' en '+x.done+')':''}`;}).join(' · ')||'aún nada');
}
function renderQuotes(){
  if(!$('quotesBox').open)return;
  const order=['Acciones','Índices','Materias primas','Divisas','TradFi','Cripto','Otros'];
  const ks=market.universe.slice().sort((a,b)=>order.indexOf(catOf(a))-order.indexOf(catOf(b))||base(a).localeCompare(base(b)));
  $('quotes').innerHTML=ks.length?`<table><tr><th>Activo</th><th>Tipo</th><th>Fuente</th><th>Precio</th><th>Mercado</th><th>Velas</th></tr>${ks.map(k=>{const o=isOpen(k),kk=kOf(S.settings.tf,k);
    return `<tr><td>${esc(base(k))}</td><td>${catOf(k)}</td><td>${SRCNAME[srcOf(k)]}</td><td>${market.price[k]?px(market.price[k]):'—'}</td><td class="${o?'up':''}">${o?'abierto':'cerrado'}</td><td>${kk?kk.length:'—'}</td></tr>`;}).join('')}</table>`:'<div class="empty">Aún no ha llegado ninguna cotización.</div>';
}
/* prueba cada fuente y cada tipo de dato, y muestra lo que llega de verdad */
async function diagnose(){
  const out=[],show=()=>{$('diag').innerHTML=out.map(r=>`<div class="dg"><i class="${r.ok===true?'up':r.ok===false?'down':''}">${r.ok===true?'✓':r.ok===false?'✗':'…'}</i><span>${esc(r.t)}</span><span class="note">${esc(r.d||'')}</span></div>`).join('');};
  const step=async(t,fn)=>{const r={t,ok:null};out.push(r);show();const t0=performance.now();
    try{r.d=await fn();r.ok=true;}catch(e){r.ok=false;r.d=why(e)+(e&&e.message&&!/^HTTP|abort/i.test(e.message)?' · '+e.message:'');}
    r.d=(r.d||'')+` · ${Math.round(performance.now()-t0)} ms`;show();};
  $('diagBtn').disabled=true;$('diagBtn').textContent='Comprobando…';
  await step('Binance · precio de BTC',async()=>{const j=await jget('/api/v3/ticker/price?symbol=BTCUSDT');return 'BTC = '+px(+j.price)+' $ (servidor '+market.host.replace('https://','')+')';});
  await step('Binance · velas de BTC',async()=>{const j=await jget('/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=5');return j.length+' velas, última cierra en '+px(+j[j.length-1][4]);});
  await step('Binance Futuros · lista de contratos',async()=>{const j=await fget(FAPI+'/fapi/v1/exchangeInfo');const tf=j.symbols.filter(x=>String(x.contractType).includes('TRADIFI')&&x.status==='TRADING');
    const by={};tf.forEach(x=>{by[x.underlyingType]=(by[x.underlyingType]||0)+1;});return tf.length+' contratos TradFi: '+Object.entries(by).map(([k,v])=>v+' '+k).join(', ')+(tf.length?' · ej.: '+tf.slice(0,6).map(x=>x.symbol).join(', '):'');});
  await step('Binance Futuros · precio del oro',async()=>{const j=await fget(FAPI+'/fapi/v1/ticker/price?symbol=XAUUSDT');return 'XAU = '+px(+j.price)+' $';});
  await step('Hyperliquid · mercados de bolsa',async()=>{const d=(await hl({type:'perpDexs'})||[]).filter(Boolean).map(x=>x.name);if(!d.length)throw new Error('lista vacía');return d.length+' mercados: '+d.join(', ');});
  await step('Hyperliquid · precios de acciones',async()=>{const [meta,ctxs]=await hl({type:'metaAndAssetCtxs',dex:'xyz'});const n=meta.universe.length;
    const ex=meta.universe.map((u,i)=>[u.name,+(ctxs[i]||{}).markPx]).filter(x=>x[1]).slice(0,5).map(([a,b])=>a.split(':').pop()+' '+px(b)).join(', ');return n+' activos en xyz · '+ex;});
  await step('Hyperliquid · precio en vivo',async()=>{const m=await hl({type:'allMids',dex:'xyz'});const ks=Object.keys(m).filter(k=>k.startsWith('xyz:'));
    if(!ks.length)throw new Error('no devuelve acciones (se usa el método alternativo)');return ks.length+' precios · '+ks.slice(0,4).map(k=>k.split(':')[1]+' '+px(+m[k])).join(', ');});
  await step('Hyperliquid · velas de una acción',async()=>{const id=(market.lists.HL[0]||'HL:xyz:TSLA').slice(3);const r=await hl({type:'candleSnapshot',req:{coin:id,interval:'5m',startTime:Date.now()-864e5,endTime:Date.now()}});
    if(!r.length)throw new Error('sin velas');return id.split(':')[1]+': '+r.length+' velas en 24 h, última '+px(+r[r.length-1].c);});
  if(kset().url)await step('Cerebro Kronos',async()=>{const j=await fget(krUrl('/'));if(!j.ready)throw new Error(j.error?'error al cargar el modelo: '+j.error:'el modelo aún se está cargando, espera unos minutos');return (j.model||'')+(j.fake?' (SIMULADO)':'')+' · listo · '+(j.calls||0)+' consultas';});
  await step('Horario de la bolsa de EE. UU.',async()=>{const o=sessOpen('us',Date.now());const no=o?null:nextOpen('us');return o?'abierta ahora':'cerrada · abre '+new Date(no).toLocaleString('es-ES',{weekday:'long',hour:'2-digit',minute:'2-digit'})+' (tu hora)';});
  $('diagBtn').disabled=false;$('diagBtn').textContent='Comprobar conexión';
}
function renderMarkets(){
  const cats={};market.universe.forEach(k=>{const c=catOf(k);cats[c]=(cats[c]||0)+1;});
  const order=['Cripto','Acciones','Índices','Materias primas','Divisas','TradFi','Otros'];
  const chips=order.filter(c=>cats[c]).map(c=>`<span class="mk"><b>${cats[c]}</b> ${c}</span>`).join('');
  const src=['BN','BF','HL'].filter(x=>S.settings.markets[x]).map(x=>{const st=market.src[x]||{};const live=st.ok&&Date.now()-st.at<90000;
    return `<div class="srcl"><span class="dot ${live?'on':''}"></span><span>${SRCNAME[x]}</span><span class="note">${live?market.lists[x].length+' activos'+((REM.on?(market.wsv||{})[x]:wsLive(x))?' · en directo':''):st.err?'sin respuesta ('+esc(st.err)+')':'conectando…'}</span></div>`;}).join('');
  const by={};market.universe.forEach(k=>{const c=sessOf(k);(by[c]=by[c]||[]).push(k);});
  const now=Date.now(),hm=t=>new Date(t).toLocaleString('es-ES',{weekday:'short',hour:'2-digit',minute:'2-digit'});
  const ses=Object.keys(SESS).filter(c=>by[c]).map(c=>{const o=sessOpen(c,now),mc=o?minsToClose(c):0,no=o?null:nextOpen(c);
    return `<div class="srcl"><span class="dot ${o?'on':''}"></span><span>${SESS[c].name} <span class="note">· ${by[c].length}</span></span><span class="note">${o?(isFinite(mc)?'abierta · cierra en '+(mc>=60?Math.floor(mc/60)+' h '+(mc%60)+' min':mc+' min'):'abierta'):(no?'cerrada · abre '+hm(no):'cerrada')}</span></div>`;}).join('');
  $('mkts').innerHTML=(chips?`<div class="mks">${chips}</div>`:'<div class="empty">Cargando mercados…</div>')+(ses?`<div class="lbl" style="margin:4px 0 2px">Horario</div>${ses}`:'')+`<div class="lbl" style="margin:10px 0 2px">Fuentes de precios</div>`+src+(krOn()?`<div class="lbl" style="margin:10px 0 2px">Cerebro IA</div><div class="srcl"><span class="dot ${KR.ok&&Date.now()-KR.at<20*60e3?'on':''}"></span><span>Kronos</span><span class="note">${KR.busy?'pensando…':KR.ok?esc((KR.model||'').split('/').pop())+' · '+(KR.ms/1000).toFixed(1).replace('.',',')+' s'+(KR.fake?' · simulado':''):KR.err?'sin respuesta ('+esc(KR.err)+'): opera solo con reglas':'esperando la primera consulta'}</span></div>`:'');
}
const TAGS={open:'compra',close:'venta',reject:'rechazo',reserve:'reserva',spawn:'nace',evolve:'evolución',tier:'nivel',dead:'apagado',pause:'pausa',info:'info',life:'ciclo',msg:'mensaje',fund:'financia'};
function renderLog(){
  $('logList').innerHTML=S.log.length?S.log.slice(0,150).map(e=>`<div class="log"><time>${clock(e.t)} · ${esc(e.a)}</time><span class="tag ${e.type}">${TAGS[e.type]||e.type}</span><span>${esc(e.msg)}</span></div>`).join(''):'<div class="empty">Aún no hay decisiones.</div>';
}
function stats(a){
  if(a._st)return Object.assign({},a._st,{ret:ret(a),pnl:total(a)-a.initial}); /* en modo servidor llegan ya calculadas con todo el historial */
  const c=a.closed,w=c.filter(x=>x.pnl>0),l=c.filter(x=>x.pnl<=0);
  const gw=w.reduce((t,x)=>t+x.pnl,0),gl=-l.reduce((t,x)=>t+x.pnl,0),aw=w.length?gw/w.length:0,al=l.length?gl/l.length:0;
  /* salud: lo que deja de media cada operación, cuánto se gana por cada unidad perdida y el acierto mínimo para no perder */
  const mf=c.filter(x=>x.mfe!=null),lm=mf.filter(x=>x.pnl<=0);
  return {n:c.length,hit:c.length?w.length/c.length:0,aw,al,pf:gl>0?gw/gl:(gw>0?Infinity:0),
    best:c.length?Math.max(...c.map(x=>x.pnl)):0,worst:c.length?Math.min(...c.map(x=>x.pnl)):0,dd:a.maxDD,ret:ret(a),pnl:total(a)-a.initial,
    exp:c.length?(gw-gl)/c.length:0,payoff:al>0?aw/al:(aw>0?Infinity:0),need:aw+al>0?al/(aw+al):0,
    nm:mf.length,lostRun:lm.length?lm.filter(x=>x.mfe>=1).length/lm.length:null,mfeW:mf.filter(x=>x.pnl>0).length?mf.filter(x=>x.pnl>0).reduce((t,x)=>t+x.mfe,0)/mf.filter(x=>x.pnl>0).length:null};
}
function renderStats(){
  const sel=$('stAgent');
  if(sel.options.length!==S.agents.length){const cur=sel.value;sel.innerHTML=S.agents.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');if(cur)sel.value=cur;}
  const a=agentById(+sel.value)||S.agents[0],s=stats(a);
  const k=(l,v,c='')=>`<div class="card kpi"><span class="lbl">${l}</span><b class="${c}">${v}</b></div>`;
  $('kpis').innerHTML=k('Resultado',sgn(s.pnl)+' · '+pct(s.ret),s.pnl>=0?'up':'down')+k('Caída máxima','−'+(s.dd*100).toFixed(2)+'%',s.dd>.1?'down':'')+
    k('Aciertos',s.n?(s.hit*100).toFixed(0)+'% de '+s.n:'—')+k('Factor de beneficio',s.n?(isFinite(s.pf)?s.pf.toFixed(2):'∞'):'—')+
    k('Ganancia media',s.n?money(s.aw):'—','up')+k('Pérdida media',s.n?money(s.al):'—','down')+k('Mejor operación',s.n?sgn(s.best):'—')+k('Peor operación',s.n?sgn(s.worst):'—')+
    k('Deja por operación',s.n?sgn(s.exp||0):'—',(s.exp||0)>=0?'up':'down')+k('Gana por cada $1 perdido',s.n&&s.payoff!=null?(isFinite(s.payoff)?'$'+s.payoff.toFixed(2).replace('.',','):'∞'):'—',(s.payoff||0)>=1?'up':'down')+
    k('Acierto necesario',s.n&&s.need!=null?Math.round(s.need*100)+'% (tienes '+Math.round(s.hit*100)+'%)':'—',s.n&&s.hit>=s.need?'up':'down')+
    k('Muestra',s.n?(s.n<100?s.n+' ops · aún poca':s.n+' ops · fiable'):'—',s.n>=100?'up':'')+
    (s.nm?k('Pérdidas que fueron +1R a favor',s.lostRun==null?'—':Math.round(s.lostRun*100)+'%',s.lostRun>.25?'down':'up')+k('Recorrido medio de las ganadoras',s.mfeW==null?'—':s.mfeW.toFixed(1)+'R'):'');
  $('trades').innerHTML=a.closed.length?`<table><tr><th>Activo</th><th>Entrada</th><th>Salida</th><th>Resultado</th><th>Motivo</th></tr>${a.closed.slice(0,40).map(t=>`<tr><td>${esc(base(t.sym))}${t.side==='short'?' <span class="side s">corto</span>':''}</td><td>${px(t.entry)}</td><td>${px(t.exit)}</td><td class="${t.pnl>=0?'up':'down'}">${sgn(t.pnl)} ${pct(t.pct,1)}</td><td>${esc(t.reason)}</td></tr>`).join('')}</table>`:'<div class="empty">Sin operaciones cerradas.</div>';
  const ex=Object.entries(S.exp).sort((x,y)=>y[1].n-x[1].n);
  $('expT').innerHTML=ex.length?`<table><tr><th>Activo</th><th>Operaciones</th><th>Aciertos</th><th>Resultado</th><th>Ajuste</th></tr>${ex.map(([sym,e])=>{const x=xp(sym);return `<tr><td>${esc(base(sym))} <span class="note">${catOf(sym)}</span></td><td>${e.n}</td><td>${Math.round(e.w/e.n*100)}%</td><td class="${e.pnl>=0?'up':'down'}">${sgn(e.pnl)}</td><td>${x.veto?'vetado':x.adj?(x.adj>0?'+':'')+x.adj:'—'}</td></tr>`;}).join('')}</table>`:'<div class="empty">Aún sin experiencia: se forma con cada operación cerrada.</div>';
  renderOrders();
  drawChart(a);
}
function renderOrders(){
  const o=(S.orders||[]).slice(0,25),c=S.agents.flatMap(a=>a.closed),fu=c.reduce((t,x)=>t+(x.fund||0),0)+S.agents.reduce((t,a)=>t+a.positions.reduce((u,p)=>u+(p.fund||0),0),0);
  const nr=Object.keys(market.rules||{}).length,nf=Object.keys(market.fund||{}).length;
  $('ordInfo').innerHTML=`Modo: <b>simulación</b> · real: <b>desactivado</b> · reglas del exchange cargadas para ${nr} activos · financiación en directo de ${nf} perpetuos · financiación acumulada <span class="${fu>=0?'up':'down'}">${sgn(fu)}</span>`;
  const kn={abrir:'abrir',parcial:'vender mitad',cerrar:'cerrar'};
  $('ordT').innerHTML=o.length?`<table><tr><th>Hora</th><th>Activo</th><th>Orden</th><th>Cantidad</th><th>Precio</th><th>Comisión</th></tr>${o.map(x=>`<tr><td>${new Date(x.t).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td><td>${esc(base(x.sym))}<br><small class="note">${esc(x.venue||'')}</small></td><td>${x.side==='BUY'?'compra':'venta'}<br><small class="note">${kn[x.kind]||x.kind}</small></td><td class="mono">${esc(x.req&&x.req.p?(x.req.p.quantity||x.req.p.sz||x.qty):x.qty)}</td><td>${px(x.price)}</td><td>${money(x.fee||0)}</td></tr>`).join('')}</table>`:'<div class="empty">Aún no hay órdenes desde esta versión.</div>';
}
function drawChart(a){
  const cv=$('chart'),dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;if(!w)return;
  cv.width=w*dpr;cv.height=h*dpr;const g=cv.getContext('2d');g.scale(dpr,dpr);
  const cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim();
  const d=(a.hist.length>1?a.hist:[[a.born,a.initial]]).concat([[Date.now(),total(a)]]); /* el último punto es siempre el valor actual */
  const ys=d.map(x=>x[1]).concat(a.initial);let lo=Math.min(...ys),hi=Math.max(...ys);if(hi-lo<a.initial*.002){lo-=a.initial*.001;hi+=a.initial*.001;}
  const pad=(hi-lo)*.12;lo-=pad;hi+=pad;
  const t0=d[0][0],t1=d[d.length-1][0],X=t=>40+(t-t0)/((t1-t0)||1)*(w-52),Y=v=>h-18-(v-lo)/(hi-lo)*(h-30);
  g.font='10px '+col('--mono');g.lineWidth=1;
  for(let i=0;i<=3;i++){const v=lo+(hi-lo)*i/3,y=Y(v);g.strokeStyle=col('--line');g.beginPath();g.moveTo(40,y);g.lineTo(w-10,y);g.stroke();g.fillStyle=col('--mute');g.textAlign='right';g.fillText(v.toFixed(v>=100?0:2),36,y+3);}
  g.setLineDash([4,4]);g.strokeStyle=col('--mute');g.beginPath();g.moveTo(40,Y(a.initial));g.lineTo(w-10,Y(a.initial));g.stroke();g.setLineDash([]);
  const c=col(d[d.length-1][1]>=a.initial?'--up':'--down');
  g.beginPath();d.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1])));
  g.strokeStyle=c;g.lineWidth=2;g.stroke();
  g.lineTo(X(t1),h-18);g.lineTo(X(t0),h-18);g.closePath();g.globalAlpha=.12;g.fillStyle=c;g.fill();g.globalAlpha=1;
  const last=d[d.length-1];g.beginPath();g.arc(X(last[0]),Y(last[1]),3.5,0,7);g.fillStyle=c;g.fill();
  const tf=t=>new Date(t).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  g.fillStyle=col('--mute');g.textAlign='left';g.fillText(tf(t0),40,h-4);g.textAlign='right';g.fillText(tf(t1),w-10,h-4);
}
function syncSel(el,opts){const sig=opts.map(o=>o[0]+'|'+o[1]).join(';');if(el.dataset.sig===sig)return;const cur=el.value;el.dataset.sig=sig;el.innerHTML=opts.map(([v,l])=>`<option value="${esc(String(v))}">${esc(l)}</option>`).join('');if(opts.some(o=>String(o[0])===cur))el.value=cur;}
function renderLin(){
  $('cHash').textContent=CONST_HASH;if(!$('cText').textContent)$('cText').textContent=CONSTITUTION;
  if($('gSpec').options.length<2)$('gSpec').insertAdjacentHTML('beforeend',SPECS.map(x=>`<option>${x}</option>`).join(''));
  syncSel($('gPar'),S.agents.filter(a=>a.status==='alive').map(a=>[a.id,`${a.name} · efectivo ${money(a.cash)}`]));
  syncSel($('hKid'),S.agents.filter(a=>a.parentId!=null).map(a=>[a.id,`${a.name} (${LIFE_LAB[a.life]||a.life})`]));
  {const par=agentById(+$('gPar').value);$('gInfo').textContent=par?(canSpawn(par)?'No puede replicarse: '+canSpawn(par)+'.':`Efectivo libre de ${par.name}: ${money(par.cash)} · financiación por defecto ${money(childFund(par))} · especialidad sugerida: ${pickSpec(par)}${S.settings.repl?' · replicación automática activada (cuando lo que gana por encima de su capital dobla la financiación, cada 6 h como mucho)':''}`):'';}
  $('linList').innerHTML=S.agents.map(a=>{const s=stats(a),par=a.parentId!=null?agentById(a.parentId):null,kids=kidsOf(a);
    const life=a.status==='dead'?'dead':a.life||'alive',lc=life==='alive'?a.tier:life==='dead'?'dead':['unhealthy'].includes(life)?'critical':'low_compute';
    const ok=verifyConst(a);
    const ev=(a.events||[]).slice(0,5).map(e=>`<div>${clock(e.t)} · ${e.from!==e.to?(LIFE_LAB[e.from]||'—')+' → '+LIFE_LAB[e.to]:LIFE_LAB[e.to]||e.to}${e.why?' · '+esc(e.why):''}</div>`).join('');
    const ib=(a.inbox||[]).slice(0,3).map(m=>`<div>${clock(m.t)} · <b>${esc(m.from)}</b>: ${esc(m.text)}</div>`).join('');
    return `<div class="card agent"><div class="row" style="justify-content:space-between"><h3>${esc(a.name)}</h3><span class="row" style="gap:6px"><span class="chip ${lc}">${LIFE_LAB[life]}</span>${a.status==='alive'?`<span class="chip ${a.tier}">${a.tier.replace('_',' ')}</span>`:''}</span></div>
    <div class="note">Generación ${a.gen}${par?' · hijo de '+esc(par.name):' · agente original'} · nació ${clock(a.born)}${kids.length?` · ${kids.filter(k=>k.status!=='dead').length} hijo(s) vivo(s) de ${kids.length}`:''}</div>
    <div class="meta"><span>Especialidad: ${esc(a.spec||'Todo')}</span><span>Capital: ${money(a.initial)}</span><span>Operativo: ${money(eq(a))}</span>${a.vault>=.005?`<span>Reservado: ${money(a.vault)}</span>`:''}${par&&a.swept>0?`<span>Enviado al padre: ${money(a.swept)}</span>`:''}<span class="${s.ret>=0?'up':'down'}">Resultado: ${pct(s.ret)}</span><span>Operaciones: ${s.n}</span><span>Aciertos: ${s.n?(s.hit*100).toFixed(0)+'%':'—'}</span></div>
    <div class="note" style="margin-top:6px">Constitución: <span class="${ok?'up':'down'}">${ok?'verificada':'sin verificar'}</span>${a.health?` · Salud: ${esc(a.health.why)} (${clock(a.health.at)})`:''}${a.recTries?` · reinicios: ${a.recTries}`:''}</div>
    ${a.genesis&&a.genesis.msg?`<div class="note" style="margin-top:6px">Génesis: «${esc(a.genesis.msg)}»</div>`:''}
    <div class="note" style="margin-top:8px;font-family:var(--mono)">EMA ${a.params.emaF}/${a.params.emaS} · riesgo ${(a.params.riskPct*100).toFixed(2)}% · stop ${(+a.params.stopATR).toFixed(2)}×ATR · objetivo ${(+a.params.tpATR).toFixed(2)}×ATR · RSI ${Math.round(a.params.rsiMin)}–${Math.round(a.params.rsiMax)}</div>
    ${ev&&a.parentId!=null?`<details style="margin-top:8px"><summary class="note" style="cursor:pointer">Ciclo de vida</summary><div class="note" style="font-size:12px;margin-top:4px">${ev}</div></details>`:''}
    ${ib?`<details style="margin-top:6px"><summary class="note" style="cursor:pointer">Buzón (${(a.inbox||[]).length})</summary><div class="note" style="font-size:12px;margin-top:4px">${ib}</div></details>`:''}</div>`;}).join('');
  const g=S.graveyard||[];$('cemCard').hidden=!g.length;
  if(g.length)$('cemList').innerHTML=`<table><thead><tr><th>Hijo</th><th>Gen.</th><th>Especialidad</th><th>Vivió</th><th>Ops</th><th>Resultado</th><th>Devuelto</th></tr></thead><tbody>${g.map(d=>`<tr><td>${esc(d.name)}</td><td>${d.gen}</td><td>${esc(d.spec||'Todo')}</td><td>${clock(d.born)} – ${d.died?clock(d.died):'—'}</td><td>${d.trades}</td><td class="${d.pnl>=0?'up':'down'}">${money(d.pnl)}</td><td>${money(d.returned)}</td></tr>`).join('')}</tbody></table>`;
}
