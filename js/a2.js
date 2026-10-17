'use strict';
/* datos guardados con la versión anterior (solo Binance, sin prefijo de fuente) */
function migrate(s){
  if(!s.settings.markets)s.settings.markets={BN:true,BF:true,HL:true};
  if(s.settings.shorts===undefined)s.settings.shorts=true;
  if(!s.settings.kronos)s.settings.kronos={url:'',mode:'off'};
  if(!s.exp)s.exp={};
  /* versión «máximas operaciones simultáneas»: hasta 12 posiciones de ~8 % cada una y 40 criptos vigiladas (una sola vez) */
  if(!s.settings.maxOpenV){s.settings.maxOpenV=1;s.settings.universe=Math.max(s.settings.universe||20,40);
    (s.agents||[]).forEach(a=>{if(a.params){a.params.maxPos=Math.max(a.params.maxPos||4,12);a.params.maxPosPct=Math.min(a.params.maxPosPct||.25,.08);}});}
  s.agents=s.agents.map(a=>{const n=newAgent(a);if(!a.life)n.life=a.status==='dead'?'dead':'alive';if(!a.constitution){n.constitution=CONSTITUTION;n.constHash=CONST_HASH;}if(!a.spec)n.spec='Todo';return n;});
  const fx=k=>k.includes(':')?k:'BN:'+k;
  s.agents.forEach(a=>{a.positions.forEach(p=>p.sym=fx(p.sym));a.closed.forEach(t=>t.sym=fx(t.sym));const cd={};for(const k in a.cooldown||{})cd[fx(k)]=a.cooldown[k];a.cooldown=cd;});
  const ex={};for(const k in s.exp)ex[fx(k)]=s.exp[k];s.exp=ex;
  return s;
}
const agentById=id=>S.agents.find(a=>a.id===id);
function L(a,type,msg){if(type==='reject'&&S.log.slice(0,40).some(e=>e.msg===msg&&Date.now()-e.t<30*60e3))return;S.log.unshift({t:Date.now(),a:a?a.name:'Sistema',type,msg});if(S.log.length>500)S.log.length=500;notifyEvt(type,(a&&S.agents.length>1?a.name+': ':'')+msg);}

/* ---------- avisos: Telegram y navegador ---------- */
const nset=()=>S.settings.notify||(S.settings.notify={token:'',chat:'',ops:true,daily:true,bk:false,sys:false});
const tgReady=()=>{const n=nset();return !!(n.token&&n.chat);};
const TG=(m)=>`https://api.telegram.org/bot${nset().token.trim()}/${m}`;
function tgPost(text){if(!tgReady())return;const body=new URLSearchParams({chat_id:nset().chat.trim(),text,disable_web_page_preview:'true'});
  /* sin leer respuesta: Telegram recibe el mensaje aunque el navegador no deje ver la contestación */
  fetch(TG('sendMessage'),{method:'POST',body,mode:'no-cors'}).catch(()=>{});}
function sysPost(text){
  const n=nset();if(!n.sys||!('Notification' in window)||Notification.permission!=='granted')return;
  try{if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration)navigator.serviceWorker.getRegistration().then(r=>{if(r)r.showNotification('Automaton',{body:text,tag:'automaton-'+Date.now()});else new Notification('Automaton',{body:text});}).catch(()=>{});
  else new Notification('Automaton',{body:text});}catch(e){}
}
const nq={l:[],t:null};
function notifyEvt(type,msg){
  const n=nset(),imp=['dead','tier','spawn','evolve'].includes(type),ops=['open','close'].includes(type)&&n.ops;
  if(!imp&&!ops)return;if(!tgReady()&&!n.sys)return;
  nq.l.push((type==='open'?'🟢 ':type==='close'?'🔵 ':'⚠️ ')+msg);
  clearTimeout(nq.t);nq.t=setTimeout(()=>{const txt=nq.l.slice(0,12).join('\n');nq.l=[];tgPost(txt);sysPost(txt);},4000);
}
function totals(){const ags=S.agents,tot=ags.reduce((t,a)=>t+eq(a)+a.reserve,0);return {tot,res:ags.reduce((t,a)=>t+a.reserve,0),pl:tot-S.initial,open:ags.reduce((t,a)=>t+a.positions.length,0),alive:alive().length};}
function dailyText(){
  const t=totals(),d0=new Date();d0.setHours(0,0,0,0);
  const today=S.agents.flatMap(a=>a.closed).filter(x=>x.t1>=d0.getTime()),pt=today.reduce((s,x)=>s+x.pnl,0),w=today.filter(x=>x.pnl>0).length;
  return `📊 Resumen Automaton ${new Date().toLocaleDateString('es-ES')}${S.settings.device?' · '+S.settings.device:''}\nPatrimonio: ${money(t.tot)} (${sgn(t.pl)}, ${pct(t.pl/S.initial)})\nHoy: ${today.length} operaciones, ${w} ganadoras, ${sgn(pt)}\nReserva: ${money(t.res)} · Posiciones abiertas: ${t.open} · Agentes vivos: ${t.alive}`;
}
function tgBackup(){
  if(!tgReady())return false;const fd=new FormData(),day=new Date().toISOString().slice(0,10);
  fd.append('chat_id',nset().chat.trim());fd.append('caption','Copia de seguridad de Automaton '+day+(S.settings.device?' · '+S.settings.device:'')+'. Para restaurarla: Ajustes → Restaurar desde archivo.');
  fd.append('document',new Blob([JSON.stringify(S)],{type:'application/json'}),'automaton-'+day+'.json');
  fetch(TG('sendDocument'),{method:'POST',body:fd,mode:'no-cors'}).catch(()=>{});return true;
}
function daily(){
  const n=nset(),now=new Date(),day=now.toISOString().slice(0,10);
  if(now.getHours()<22||S.lastDaily===day)return;S.lastDaily=day;
  if(n.daily){tgPost(dailyText());sysPost(dailyText());}
  if(n.bk)tgBackup();
}

/* ---------- cerebro Kronos: IA que prevé las próximas velas, en tu propio servidor ----------
   Las reglas filtran primero; solo los candidatos que las superan se consultan a Kronos.
   La consulta no bloquea el bucle: al llegar la respuesta se reevalúa. Si el servidor falla, se opera solo con reglas. */
const kset=()=>S.settings.kronos||(S.settings.kronos={url:'',mode:'off'});
const krOn=()=>{const k=kset();return k.mode!=='off'&&/^https?:\/\/\S+$/.test(cleanUrl(k.url));};
/* limpia la dirección pegada: espacios, punto o barra final, y añade https:// si falta */
const cleanUrl=u=>{u=String(u||'').trim().replace(/[\s.\/]+$/,'');if(u&&!/^https?:\/\//i.test(u))u='https://'+u;return u;};
const krUrl=p=>cleanUrl(kset().url)+p;
const KR={cache:{},tried:{},ping:0,busy:false,ok:false,at:0,ms:0,err:null,model:'',fake:false,asked:0};
const krKey=(k,tf)=>k+'|'+tf;
const lastT=(k,tf)=>{const c=kOf(tf,k);return c&&c.length?c[c.length-1].t:0;};
function krEntry(k,tf){const c=KR.cache[krKey(k,tf)];return c&&c.t===lastT(k,tf)?c:null;}
const krOf=(k,tf)=>{const c=krEntry(k,tf);return c?c.r:null;};
const costOf=k=>2*feeOf(k)+2*S.settings.slip;
async function krFetch(list){
  if(KR.busy||!list.length)return;
  if(KR.loading&&Date.now()-KR.at<30000)return; /* el modelo se está cargando tras un reinicio: se reintenta cada 30 s */
  KR.busy=true;
  list.forEach(({k,tf})=>KR.tried[krKey(k,tf)]=lastT(k,tf)); /* una consulta por activo y vela, aunque falle */
  try{
    const series=list.filter(({k,tf})=>(kOf(tf,k)||[]).length>=60).slice(0,8)
      .map(({k,tf})=>({id:krKey(k,tf),tf_ms:TF_MS[tf],candles:kOf(tf,k).slice(-100).map(c=>[c.t,c.o,c.h,c.l,c.c,c.v])}));
    if(!series.length)return;
    const t0=performance.now(),c=new AbortController(),to=setTimeout(()=>c.abort(),90000);let j;
    try{const r=await fetch(krUrl('/forecast'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pred_len:6,samples:4,series}),signal:c.signal});
      j=await r.json();if(!r.ok)throw new Error(j.error||('HTTP '+r.status));}
    finally{clearTimeout(to);}
    for(const id in j.results){const i=id.lastIndexOf('|'),k=id.slice(0,i),tf=id.slice(i+1);KR.cache[id]={t:lastT(k,tf),r:j.results[id],at:Date.now()};}
    const ks=Object.keys(KR.cache);if(ks.length>400)ks.forEach(x=>{if(Date.now()-KR.cache[x].at>2*3600e3)delete KR.cache[x];});
    Object.assign(KR,{ok:true,loading:false,at:Date.now(),ms:Math.round(performance.now()-t0),err:null,model:j.model||'',fake:!!j.fake});KR.asked+=series.length;
  }catch(e){
    /* 503 = Kronos está arrancando: no es un fallo, se espera a que esté listo en vez de operar sin su confirmación */
    if(/HTTP 503|modelo cargando/.test((e&&e.message)||'')){KR.loading=true;KR.ok=false;KR.err=null;KR.at=Date.now();list.forEach(({k,tf})=>{delete KR.tried[krKey(k,tf)];});return;}
    KR.loading=false;KR.ok=false;KR.at=Date.now();KR.err=e&&e.name==='AbortError'?'no responde a tiempo':(e&&e.name==='TypeError')?'no se puede conectar':(e&&e.message)||'sin conexión';}
  finally{KR.busy=false;}
  /* reevaluar con las previsiones recibidas */
  const again=()=>{if(busy)setTimeout(again,1000);else tick(true);};again();
}
/* el servidor gratuito se duerme tras 15 min sin consultas: un toque ligero cada 10 min lo mantiene despierto */
function krPing(){
  if(!krOn()||Date.now()-KR.ping<10*60e3)return;KR.ping=Date.now();
  fget(krUrl('/')).then(j=>{if(j&&j.ready){KR.ok=true;KR.err=null;KR.at=Date.now();KR.model=j.model||KR.model;KR.fake=!!j.fake;}}).catch(()=>{});
}
/* salidas anticipadas: Kronos ve un giro claro en contra de una posición abierta */
function krExit(a){
  if(!krOn()||kset().mode!=='full')return;
  for(const p of a.positions.slice()){
    const e=krEntry(p.sym,p.tf||S.settings.tf);if(!e||e.at<p.openedAt)continue;
    const sh=isShort(p),dir=sh?-e.r.ret:e.r.ret,agree=sh?1-e.r.up:e.r.up;
    if(agree<=.25&&dir<-costOf(p.sym))closePos(a,p,`Kronos prevé giro en contra (${pct(dir)})`);
  }
}

/* ---------- informe para revisar con Claude ---------- */
function report(){
  const t=totals(),all=S.agents.flatMap(a=>a.closed.map(x=>Object.assign({ag:a.name},x)));
  const grp=f=>{const g={};all.forEach(x=>{const k=f(x);const o=g[k]||(g[k]={n:0,w:0,p:0});o.n++;if(x.pnl>0)o.w++;o.p+=x.pnl;});return Object.entries(g).sort((a,b)=>b[1].n-a[1].n).map(([k,o])=>`  ${k}: ${o.n} ops, ${Math.round(o.w/o.n*100)}% aciertos, ${sgn(o.p)}`).join('\n')||'  —';};
  const ex=Object.entries(S.exp).filter(([,e])=>e.n>=2).sort((a,b)=>b[1].pnl-a[1].pnl),fmtE=([k,e])=>`${base(k)} ${e.n} ops ${Math.round(e.w/e.n*100)}% ${sgn(e.pnl)}`;
  const st=S.settings;
  return [`INFORME AUTOMATON · ${new Date().toLocaleString('es-ES')}${st.device?' · '+st.device:''}`,
  `Funcionando desde ${new Date(S.startedAt).toLocaleString('es-ES')} · capital ${money(S.initial)} · patrimonio ${money(t.tot)} · resultado ${sgn(t.pl)} (${pct(t.pl/S.initial)}) · reserva ${money(t.res)}`,
  `Ajustes: velas ${tfs().join('+')} · comisión ${(st.fee*100).toFixed(3)}% · deslizamiento ${(st.slip*100).toFixed(3)}% · cortos ${st.shorts?'sí':'no'} · mercados ${['BN','BF','HL'].filter(x=>st.markets[x]).map(x=>SRCNAME[x]).join(', ')}`,
  `AGENTES`,...S.agents.map(a=>{const s=stats(a),P=a.params;return `  ${a.name} gen${a.gen} ${a.status}/${a.tier} · ${pct(s.ret)} · ${s.n} ops ${s.n?Math.round(s.hit*100)+'%':''} · PF ${s.n?(isFinite(s.pf)?s.pf.toFixed(2):'∞'):'—'} · caída máx ${(s.dd*100).toFixed(1)}% · EMA ${P.emaF}/${P.emaS} riesgo ${(P.riskPct*100).toFixed(2)}% stop ${(+P.stopATR).toFixed(2)} obj ${(+P.tpATR).toFixed(2)} trail ${(+P.trailATR).toFixed(2)} RSI ${Math.round(P.rsiMin)}-${Math.round(P.rsiMax)} min ${P.minScore}`;}),
  `POR TIPO DE MERCADO`,grp(x=>catOf(x.sym)),`AL ALZA / A LA BAJA`,grp(x=>x.side==='short'?'corto':'largo'),`POR VELAS`,grp(x=>x.tf||'?'),`CON / SIN KRONOS`,grp(x=>x.kr?'con Kronos':'sin Kronos'),`POR MOTIVO DE SALIDA`,grp(x=>x.reason),
  `KRONOS: ${krOn()?(KR.ok?'conectado ('+(KR.model||'')+', '+KR.ms+' ms, '+KR.asked+' previsiones)':'sin respuesta: '+(KR.err||'—')):'desactivado'}`,
  `ÚLTIMA EVALUACIÓN: ${ui.summary||'—'}${ui.reasons?' · descartes: '+ui.reasons:''}`,
  `MEJORES ACTIVOS: ${ex.slice(0,5).map(fmtE).join(' · ')||'—'}`,`PEORES ACTIVOS: ${ex.slice(-5).reverse().filter(([,e])=>e.pnl<0).map(fmtE).join(' · ')||'—'}`,
  `ÚLTIMAS OPERACIONES`,...all.sort((a,b)=>b.t1-a.t1).slice(0,30).map(x=>`  ${new Date(x.t1).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} ${base(x.sym)} ${x.side==='short'?'corto':'largo'} ${x.tf||''} ${px(x.entry)}→${px(x.exit)} ${pct(x.pct,2)} ${sgn(x.pnl)} ${x.reason} ${Math.round((x.t1-x.t0)/60000)}min`)
  ].join('\n');
}

/* ---------- indicadores ---------- */
function ema(a,n){const k=2/(n+1);let e=a[0];const o=[e];for(let i=1;i<a.length;i++){e=a[i]*k+e*(1-k);o.push(e);}return o;}
function rsi(c,n=14){let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];d>=0?g+=d:l-=d;}g/=n;l/=n;
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;}
  return l===0?100:100-100/(1+g/l);}
function atr(k,n=14){const tr=i=>Math.max(k[i].h-k[i].l,Math.abs(k[i].h-k[i-1].c),Math.abs(k[i].l-k[i-1].c));
  let a=0;for(let i=1;i<=n;i++)a+=tr(i);a/=n;for(let i=n+1;i<k.length;i++)a=(a*(n-1)+tr(i))/n;return a;}
function analyze(sym,P,tf){
  tf=tf||S.settings.tf;const k=kOf(tf,sym);if(!k||k.length<60)return null;
  const c=k.map(x=>x.c),n=c.length-1,ef=ema(c,P.emaF),es=ema(c,P.emaS);
  if(!pxFresh(sym,120000))return null; /* sin precio reciente no se analiza */
  const price=market.price[sym],r=rsi(c),a=atr(k);
  const win=k.slice(n-20,n),hi=Math.max(...win.map(x=>x.h)),vavg=win.reduce((t,x)=>t+x.v,0)/20;
  const lo=Math.min(...win.map(x=>x.l));
  const trend=ef[n]>es[n]&&c[n]>es[n],slope=es[n]>es[n-3],brk=c[n]>hi,vol=k[n].v>1.3*vavg;
  const dtrend=ef[n]<es[n]&&c[n]<es[n],dslope=es[n]<es[n-3],dbrk=c[n]<lo;
  let score=0;if(trend)score+=30;if(slope)score+=10;if(r>=P.rsiMin&&r<=P.rsiMax)score+=20;if(r>=50&&r<=65)score+=5;if(brk)score+=25;if(vol)score+=10;
  let sScore=0;if(dtrend)sScore+=30;if(dslope)sScore+=10;if(r<=100-P.rsiMin&&r>=100-P.rsiMax)sScore+=20;if(r<=50&&r>=35)sScore+=5;if(dbrk)sScore+=25;if(vol)sScore+=10;
  const b={sym,tf,price,last:c[n],rsi:r,atr:a,atrPct:a/price,bearCross:ef[n]<es[n],bullCross:ef[n]>es[n]};
  return Object.assign(b,{side:'long',score,trend,short:Object.assign({},b,{side:'short',score:sScore,trend:dtrend})});
}

/* ---------- agente ---------- */
/* un corto está cubierto al 100 % con capital propio: vale lo aportado más lo que gana si el precio baja */
const isShort=p=>p.side==='short';
/* comisión real de cada mercado: Binance contado (ajustable), Binance Futuros la mitad, Hyperliquid HIP-3 ~90 % */
const feeOf=k=>S.settings.fee*({BN:1,BF:.5,HL:.9}[srcOf(k)]||1);
const posVal=(p,price)=>isShort(p)?p.qty*(2*p.entry-price):p.qty*price;
const eq=a=>a.cash+a.positions.reduce((t,p)=>t+Math.max(0,posVal(p,market.price[p.sym]||p.entry)),0);
const total=a=>eq(a)+a.swept;
const ret=a=>(total(a)-a.initial)/a.initial;
const TIER={normal:{risk:1,pos:99,syms:999},low_compute:{risk:.5,pos:2,syms:15},critical:{risk:.25,pos:1,syms:5},dead:{risk:0,pos:0,syms:0}};
function updateTier(a){
  if(a.status==='dead')return;
  const e=eq(a),r=e/a.initial;
  if(e<Math.max(MIN_NOTIONAL,.01*a.initial)){kill(a);return;}
  const t=r>=.5?'normal':r>=.2?'low_compute':'critical';
  if(t!==a.tier){L(a,'tier',`Nivel de supervivencia: ${a.tier} → ${t} (operativo ${money(e)} de ${money(a.initial)})`);a.tier=t;}
}
function kill(a,why){
  a.positions.slice().forEach(p=>closePos(a,p,'apagado'));
  a.status='dead';a.tier='dead';a.diedAt=Date.now();
  if(a.life!=='dead')lifeEvt(a,'dead',why||'sin fondos operativos');
  L(a,'dead',why?`${a.name} se apaga: ${why}.`:`Sin fondos operativos. ${a.name} se apaga con ${money(a.cash)} sin usar.`);
}
/* solo se aparta beneficio ya realizado (ventas cerradas), no ganancias latentes */
function sweep(a){
  const e=a.cash+a.positions.reduce((t,p)=>t+p.basis,0);if(e<=a.initial+.005)return;
  const x=Math.min(a.cash,e-a.initial);if(x<=.01)return;
  a.cash-=x;a.swept+=x;const dest=a.parentId!=null?agentById(a.parentId):a;dest.reserve+=x;
  L(a,'reserve',`Beneficio apartado: ${money(x)} a la reserva${dest!==a?' de '+dest.name:''}. Sigue operando con ${money(a.initial)}.`);
}
function openPos(a,an,P){
  const T=TIER[a.tier],e=eq(a),fee=feeOf(an.sym),slip=S.settings.slip;
  const sh=an.side==='short',entry=an.price*(sh?1-slip:1+slip),stopDist=P.stopATR*an.atr;
  let qty=(e*P.riskPct*T.risk)/stopDist;
  /* con poco capital, cada posición puede llegar al mínimo de $5 aunque supere el % máximo */
  qty=Math.min(Math.max(qty,MIN_NOTIONAL*1.01/entry),Math.max(e*P.maxPosPct,MIN_NOTIONAL*1.01)/entry,a.cash/(entry*(1+fee)));
  if(qty*entry<MIN_NOTIONAL)return 'capital insuficiente para el tamaño mínimo ($5)';
  const cost=qty*entry,f=cost*fee;a.cash-=cost+f;
  const p={sym:an.sym,side:an.side||'long',tf:an.tf,until:Date.now()+P.maxHold*TF_MS[an.tf],qty,entry,stop:sh?entry+stopDist:entry-stopDist,tp:sh?entry-P.tpATR*an.atr:entry+P.tpATR*an.atr,risk:stopDist,high:entry,low:entry,atr:an.atr,openedAt:Date.now(),bars:0,basis:cost+f,kr:an.kr||null};
  a.positions.push(p);S.meta=S.meta||{};if(market.meta[an.sym])S.meta[an.sym]=Object.assign({},market.meta[an.sym]);
  L(a,'open',`${sh?'Abre corto en':'Compra'} ${base(an.sym)} (${catOf(an.sym)}) ${money(cost)} @ ${px(entry)} · stop ${px(p.stop)} · objetivo ${px(p.tp)} · puntuación ${an.score} en velas de ${an.tf}${an.kr?` · Kronos prevé ${pct(an.kr.ret)} (${Math.round(an.kr.up*100)}% de escenarios)`:''}`);
  return null;
}
function closePos(a,p,reason,at){
  const sh=isShort(p),price=(at||market.price[p.sym]||p.entry)*(sh?1+S.settings.slip:1-S.settings.slip),f=p.qty*price*feeOf(p.sym),net=Math.max(0,posVal(p,price))-f,pnl=net-p.basis;
  a.cash+=net;a.positions=a.positions.filter(x=>x!==p);
  const ex=S.exp[p.sym]||(S.exp[p.sym]={n:0,w:0,pnl:0,sumPct:0});ex.n++;if(pnl>0)ex.w++;ex.pnl+=pnl;ex.sumPct+=pnl/p.basis;
  a.closed.unshift({sym:p.sym,side:p.side||'long',tf:p.tf,entry:p.entry,exit:price,qty:p.qty,pnl,pct:pnl/p.basis,reason,t0:p.openedAt,t1:Date.now(),kr:p.kr?1:0});
  if(a.closed.length>500)a.closed.length=500;
  if(pnl<0)a.cooldown[p.sym]=Date.now()+30*60e3;
  L(a,'close',`${sh?'Cierra corto en':'Venta'} ${base(p.sym)} @ ${px(price)} · ${sgn(pnl)} (${pct(pnl/p.basis)}) · motivo: ${reason}`);
}
function checkExits(a){
  if(a.status!=='alive')return;
  for(const p of a.positions.slice()){
    const cls=sessOf(p.sym);
    if(!sessOpen(cls,Date.now())){
      /* el mercado cerró mientras la app estaba en pausa: se liquida al último precio de la sesión real */
      const k=kOf(p.tf||S.settings.tf,p.sym),last=k&&k.length&&k[k.length-1].ct>p.openedAt?k[k.length-1].c:null;
      if(last||Date.now()-(p.closedSeen||(p.closedSeen=Date.now()))>10*60e3)closePos(a,p,'mercado cerrado',last||undefined);
      continue;
    }
    if(minsToClose(cls)<=5){closePos(a,p,'cierre de la sesión');continue;}
    if(!pxFresh(p.sym,90000))continue; /* precio viejo: se espera al siguiente */
    const price=market.price[p.sym];
    if(isShort(p)){
      if(price<(p.low||p.entry)){p.low=price;if(p.low<=p.entry-p.risk)p.stop=Math.min(p.stop,p.low+a.params.trailATR*p.atr);}
      if(price>=p.stop)closePos(a,p,p.stop<p.entry?'trailing':'stop');
      else if(price<=p.tp)closePos(a,p,'objetivo');
    }else{
      if(price>p.high){p.high=price;if(p.high>=p.entry+p.risk)p.stop=Math.max(p.stop,p.high-a.params.trailATR*p.atr);}
      if(price<=p.stop)closePos(a,p,p.stop>p.entry?'trailing':'stop');
      else if(price>=p.tp)closePos(a,p,'objetivo');
    }
  }
}
/* experiencia: el historial propio con cada activo ajusta la puntuación y puede vetarlo */
function xp(sym){const e=S.exp[sym];if(!e||e.n<3)return {adj:0,veto:false,e};const wr=(e.w+1)/(e.n+2);return {adj:Math.round((wr-.5)*30),veto:e.n>=6&&e.pnl<0&&wr<.35,e};}
function decide(a,an,P,T,pre){
  const sh=an.side==='short';
  if(sh&&!S.settings.shorts)return 'cortos desactivados';
  if(!an.trend)return sh?'sin tendencia bajista':'sin tendencia alcista';
  if(!sh&&an.rsi>P.rsiMax)return `RSI ${an.rsi.toFixed(0)} sobrecomprado`;
  if(!sh&&an.rsi<P.rsiMin)return `RSI ${an.rsi.toFixed(0)} sin fuerza`;
  if(sh&&an.rsi<100-P.rsiMax)return `RSI ${an.rsi.toFixed(0)} sobrevendido`;
  if(sh&&an.rsi>100-P.rsiMin)return `RSI ${an.rsi.toFixed(0)} sin presión vendedora`;
  const x=xp(an.sym);if(x.veto)return `experiencia negativa con ${base(an.sym)} (${x.e.w} de ${x.e.n} aciertos, ${sgn(x.e.pnl)})`;
  if(an.score+x.adj<P.minScore)return `puntuación ${an.score}${x.adj?(x.adj>0?'+':'')+x.adj+' por experiencia':''} < ${P.minScore}`;
  if(an.atrPct<.002)return 'volatilidad demasiado baja para cubrir comisiones';
  if(an.atrPct>.06)return 'volatilidad excesiva';
  if(P.tpATR*an.atrPct<.006)return 'objetivo no cubre los costes';
  if(sh?an.price<an.last-an.atr:an.price>an.last+an.atr)return 'el precio ya se escapó de la señal';
  if((a.cooldown[an.sym]||0)>Date.now())return 'en espera tras una pérdida reciente';
  if(a.positions.length>=Math.min(P.maxPos,T.pos))return 'máximo de posiciones para su nivel';
  {const lim=Math.max(2,Math.ceil(Math.min(P.maxPos,T.pos)/2));if(catOf(an.sym)==='Cripto'&&a.positions.filter(p=>catOf(p.sym)==='Cripto'&&(p.side||'long')===(an.side||'long')).length>=lim)return `ya tiene ${lim} criptomonedas en la misma dirección`;}
  if(a.positions.some(p=>p.sym===an.sym))return 'ya en cartera';
  if(!pre&&krOn()){
    const f=krOf(an.sym,an.tf);
    if(!f){if(!KR.err||KR.ok){an.krPending=true;return 'esperando la previsión de Kronos';}}
    else{
      const sh=an.side==='short',dir=sh?-f.ret:f.ret,agree=sh?1-f.up:f.up;
      if(agree<.55)return `Kronos no confirma la dirección (${Math.round(agree*100)}% de escenarios a favor)`;
      if(dir<costOf(an.sym))return `Kronos prevé poco recorrido (${pct(dir)})`;
      an.kr={ret:dir,up:agree};
    }
  }
  return null;
}
