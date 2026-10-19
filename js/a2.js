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
  s.agents=s.agents.map(a=>{const n=newAgent(a);n.params=Object.assign({},DEF_PARAMS,a.params||{});if(!a.life)n.life=a.status==='dead'?'dead':'alive';if(!a.constitution){n.constitution=CONSTITUTION;n.constHash=CONST_HASH;}if(!a.spec)n.spec='Todo';return n;});
  /* sin reserva: lo apartado vuelve al capital con el que opera cada agente (una sola vez) */
  if(!s.settings.noResV){s.settings.noResV=1;s.agents.forEach(a=>{const r=a.reserve||0,d=r-(a.parentId==null?(a.swept||0):0);a.cash+=r;a.reserve=0;if(a.parentId==null)a.swept=0;
    if(d){a.initial=Math.max(1,a.initial+d);a.peak+=d;if(a.dayStart)a.dayStart+=d;a.hist=(a.hist||[]).map(([t,v])=>[t,v+d]);}if(!a.seed)a.seed=a.initial;});}
  const fx=k=>k.includes(':')?k:'BN:'+k;
  /* el límite de ganancia se quitó: las posiciones que lo tenían vuelven al objetivo del agente */
  s.agents.forEach(a=>(a.positions||[]).forEach(p=>{if(p.tp0!=null)p.tp=p.tp0;delete p.tp0;delete p.capNet;}));
  s.agents.forEach(a=>{a.positions.forEach(p=>p.sym=fx(p.sym));a.closed.forEach(t=>t.sym=fx(t.sym));const cd={};for(const k in a.cooldown||{})cd[fx(k)]=a.cooldown[k];a.cooldown=cd;});
  const ex={};for(const k in s.exp)ex[fx(k)]=s.exp[k];s.exp=ex;
  /* salidas v2 (una sola vez): trailing más amplio para dejar correr las ganancias */
  if(!s.settings.exitV2){s.settings.exitV2=1;s.agents.forEach(a=>{if(a.params)a.params.trailATR=Math.max(2,+a.params.trailATR||0);});}
  /* criptomonedas en Binance Futuros (una sola vez): la experiencia de cada cripto pasa a su contrato */
  /* broker IBKR (una sola vez): la simulación sigue sus comisiones, mercados y reglas */
  if(s.settings.broker===undefined){s.settings.broker='ibkr';s.settings.ibPlan='tiered';}
  /* experiencia por activo: la de la etapa anterior se hizo con otro broker, otras comisiones y las salidas viejas (cortaba las ganancias);
     con IBKR empieza de cero para no vetar con esos datos los pocos activos disponibles. La anterior queda archivada en expOld (una sola vez) */
  if(!s.settings.expIB){s.settings.expIB=1;if(Object.keys(s.exp).length){s.expOld=Object.assign({},s.expOld||{},s.exp);s.exp={};}}
  if(s.settings.cryptoFut===undefined){s.settings.cryptoFut=true;for(const k in s.exp)if(k.startsWith('BN:')){const nk='BF:'+k.slice(3),a=s.exp[k],b=s.exp[nk]||{n:0,w:0,pnl:0,sumPct:0};s.exp[nk]={n:a.n+b.n,w:a.w+b.w,pnl:a.pnl+b.pnl,sumPct:(a.sumPct||0)+(b.sumPct||0)};}}
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
function totals(){const ags=S.agents,tot=ags.reduce((t,a)=>t+eq(a)+(a.vault||0),0);return {tot,pl:tot-S.initial,open:ags.reduce((t,a)=>t+a.positions.length,0),alive:alive().length};}
function dailyText(){
  const t=totals(),d0=new Date();d0.setHours(0,0,0,0);
  const today=S.agents.flatMap(a=>a.closed).filter(x=>x.t1>=d0.getTime()),pt=today.reduce((s,x)=>s+x.pnl,0),w=today.filter(x=>x.pnl>0).length;
  return `📊 Resumen Automaton ${new Date().toLocaleDateString('es-ES')}${S.settings.device?' · '+S.settings.device:''}\nPatrimonio: ${money(t.tot)} (${sgn(t.pl)}, ${pct(t.pl/S.initial)})\nHoy: ${today.length} operaciones, ${w} ganadoras, ${sgn(pt)}\nPosiciones abiertas: ${t.open} · Agentes vivos: ${t.alive}`;
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
    const sh=isShort(p),dir=sh?-e.r.ret:e.r.ret,agree=sh?1-e.r.up:e.r.up,px0=market.price[p.sym]||p.entry,fav=p.risk>0?(sh?p.entry-px0:px0-p.entry)/p.risk:0;
    if(agree<=.25&&dir<-costOf(p.sym)){
      /* en pérdida corta antes de llegar al stop; en ganancia no vende: asegura el stop en la entrada y deja correr */
      if(fav<0)closePos(a,p,`Kronos prevé giro en contra (${pct(dir)})`);
      else if(fav>=.3&&!p.krProt){p.krProt=1;protect(p);L(a,'info',`${base(p.sym)}: Kronos prevé giro en contra; el stop pasa a la entrada para no devolver lo ganado.`);}
    }
  }
}

/* ---------- informe para revisar con Claude ---------- */
function report(){
  const t=totals(),all=S.agents.flatMap(a=>a.closed.map(x=>Object.assign({ag:a.name},x)));
  const grp=f=>{const g={};all.forEach(x=>{const k=f(x);const o=g[k]||(g[k]={n:0,w:0,p:0});o.n++;if(x.pnl>0)o.w++;o.p+=x.pnl;});return Object.entries(g).sort((a,b)=>b[1].n-a[1].n).map(([k,o])=>`  ${k}: ${o.n} ops, ${Math.round(o.w/o.n*100)}% aciertos, ${sgn(o.p)}`).join('\n')||'  —';};
  const ex=Object.entries(S.exp).filter(([,e])=>e.n>=2).sort((a,b)=>b[1].pnl-a[1].pnl),fmtE=([k,e])=>`${base(k)} ${e.n} ops ${Math.round(e.w/e.n*100)}% ${sgn(e.pnl)}`;
  const st=S.settings;
  return [`INFORME AUTOMATON · ${new Date().toLocaleString('es-ES')}${st.device?' · '+st.device:''}`,
  `Funcionando desde ${new Date(S.startedAt).toLocaleString('es-ES')} · capital ${money(S.initial)} · patrimonio ${money(t.tot)} · resultado ${sgn(t.pl)} (${pct(t.pl/S.initial)})`,
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
  let score=0;if(trend)score+=30;if(slope)score+=10;if(r>=P.rsiMin&&r<=P.rsiMax)score+=20;if(r>=50&&r<=65)score+=5;if(brk)score+=P.wBrk??25;if(vol)score+=P.wVol??10;
  let sScore=0;if(dtrend)sScore+=30;if(dslope)sScore+=10;if(r<=100-P.rsiMin&&r>=100-P.rsiMax)sScore+=20;if(r<=50&&r>=35)sScore+=5;if(dbrk)sScore+=P.wBrk??25;if(vol)sScore+=P.wVol??10;
  const b={sym,tf,price,last:c[n],rsi:r,atr:a,atrPct:a/price,tick:tickOf(k),bearCross:ef[n]<es[n],bullCross:ef[n]>es[n]};
  return Object.assign(b,{side:'long',score,trend,short:Object.assign({},b,{side:'short',score:sScore,trend:dtrend})});
}

/* paso mínimo de precio estimado con las velas: si es grande respecto al precio, el stop salta con cualquier movimiento */
function tickOf(k){const v=[];for(const x of k.slice(-60))v.push(x.o,x.h,x.l,x.c);v.sort((a,b)=>a-b);let t=Infinity;for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];if(d>v[i]*1e-9&&d<t)t=d;}return isFinite(t)?t:0;}
/* tendencia del bitcoin en velas de 1 h: las demás criptos suelen seguirle */
let btcC={at:0,v:null};
function btcTrend(P){
  if(Date.now()-btcC.at<60000)return btcC.v;
  const k=uni().find(x=>catOf(x)==='Cripto'&&base(x)==='BTC'),an=k&&analyze(k,P,'1h');
  btcC={at:Date.now(),v:an?(an.trend?'up':an.short.trend?'down':null):null};return btcC.v;
}
/* ---------- agente ---------- */
/* un corto está cubierto al 100 % con capital propio: vale lo aportado más lo que gana si el precio baja */
const isShort=p=>p.side==='short';
/* ---------- broker ----------
   IBKR (Interactive Brokers, entidad de Irlanda para clientes de España): la simulación usa sus comisiones, sus mercados y sus reglas.
   · Acciones y ETF de EE. UU. (también los índices y materias primas, que en IBKR se operan con su ETF): por acción, con mínimo por orden;
     fraccionadas al comprar; en corto solo acciones enteras y con cuenta de margen (desde $2.000); los cortos pagan préstamo.
   · Cripto (Zero Hash): solo BTC, ETH, SOL, XRP, ADA y DOGE; solo compra (no hay cortos); 0,18 % con mínimo de $1,75 (como mucho el 1 %).
   · Divisas: 0,2 pb del importe, mínimo $2.
   · Cuenta de efectivo (por debajo de $2.000): sin cortos y el dinero de una venta de acciones se liquida al día hábil siguiente.
   «exchanges»: el modo anterior (Binance y Hyperliquid directamente). */
const isIB=()=>!!(S&&S.settings.broker==='ibkr');
const IB_CRYPTO=new Set(['BTC','ETH','SOL','XRP','ADA','DOGE']);
const ibClass=k=>{const c=catOf(k);return c==='Cripto'?'crypto':c==='Divisas'?'fx':'stk';};
function ibOK(k){const m=metaOf(k)||{};if(catOf(k)==='Cripto')return IB_CRYPTO.has(base(k));return !['hk','krx','shanghai'].includes(m.sess);}
const IB_MARGIN=2000;
const marginOK=()=>S.agents.reduce((t,a)=>t+eq(a)+(a.vault||0),0)>=IB_MARGIN;
const feeRate0=k=>S.settings.fee*({BN:1,BF:.5,HL:.9}[srcOf(k)]||1);
/* comisión real en dólares de una orden: q unidades a price; sell=true si la orden vende */
function feeAmt(k,q,price,sell){
  const V=q*price;if(!(V>0))return 0;
  if(!isIB())return V*feeRate0(k);
  const cl=ibClass(k);
  if(cl==='crypto')return Math.max(.0018*V,Math.min(1.75,.01*V));
  if(cl==='fx')return Math.max(2,.00002*V);
  const reg=sell?.0000206*V+.000003*q:0; /* tasa de la SEC y CAT en las ventas */
  if(S.settings.ibPlan==='fixed')return Math.min(Math.max(.005*q,1),.01*V)+reg;
  return Math.min(Math.max(.0035*q,.35),.01*V)+.003*q+Math.min(.0002*q,.005*V)+reg; /* escalonada: comisión + bolsa + compensación */
}
/* tamaño máximo de una posición. Con IBKR, si el % habitual deja la orden tan pequeña que la comisión mínima se come la ganancia,
   la posición sube hasta un tamaño eficiente (cripto ~$700, acciones ~$350, divisas ~$10.000), como mucho la mitad del capital.
   El riesgo no cambia: lo sigue marcando el stop (riesgo por operación), solo hay menos posiciones y más grandes. */
const IB_EFF={crypto:700,stk:350,fx:10000};
function posCap(k,e,P){const b=e*P.maxPosPct;return isIB()?Math.max(b,Math.min(e*.5,IB_EFF[ibClass(k)]||0)):b;}
/* coste por unidad con el tamaño que tendría la posición: con mínimos por orden, las posiciones pequeñas pagan mucho más en proporción */
function feeOf(k){
  if(!isIB())return feeRate0(k);
  const a=S.agents[0],P=(a&&a.params)||DEF_PARAMS,n=Math.max(minNot(k),posCap(k,a?eq(a):1000,P)),p0=market.price[k]||100;
  return feeAmt(k,n/p0,p0,true)/n;
}
/* ---------- como en el exchange real ----------
   ruleOf: paso de cantidad, mínimos y paso de precio del exchange de ese activo (si aún no han llegado, se usan los de Binance: $5).
   Las cantidades se redondean hacia abajo al paso permitido, como haría el exchange; una orden que el exchange rechazaría, aquí también se rechaza. */
function ruleOf(k){
  if(isIB()){const cl=ibClass(k),p=market.price[k]||0;
    return cl==='crypto'?{step:1e-8,minNot:1,venue:'IBKR · cripto'}:cl==='fx'?{step:1,minNot:1,venue:'IBKR · divisas'}:{step:1e-4,minNot:1,tick:p>=1?.01:.0001,venue:'IBKR · '+(catOf(k)==='Acciones'?'acciones EE. UU.':'ETF EE. UU.')};}
  return (market.rules&&market.rules[k])||(S.meta&&S.meta[k]&&S.meta[k].rule)||null;
}
/* en IBKR los cortos de acciones van por acciones enteras */
const wholeOnly=(k,sh)=>isIB()&&sh&&ibClass(k)==='stk';
/* dinero disponible: en cuenta de efectivo, lo que viene de vender acciones no se puede usar hasta que se liquida (día hábil siguiente) */
function freeCash(a){const n=Date.now();if(a.unset)a.unset=a.unset.filter(x=>x.at>n);return a.cash-(a.unset||[]).reduce((t,x)=>t+x.amt,0);}
function settle(a,p,amt){if(isIB()&&ibClass(p.sym)==='stk'&&!marginOK()&&amt>0){const at=nextOpen('us',Date.now()+3600e3);if(at)(a.unset=a.unset||[]).push({amt,at});}}
const minNot=k=>Math.max(MIN_NOTIONAL,(ruleOf(k)||{}).minNot||0);
const decOf=st=>st>0?Math.max(0,Math.min(12,Math.round(-Math.log10(st)))):8;
function rq(k,q,up){const r=ruleOf(k);if(!r||!(r.step>0))return q;const n=(up?Math.ceil:Math.floor)(q/r.step-(up?1e-9:-1e-9));return +(n*r.step).toFixed(decOf(r.step));}
function rp(k,v){const r=ruleOf(k);if(!r||!(v>0))return v;
  if(r.tick>0)return +(Math.round(v/r.tick)*r.tick).toFixed(decOf(r.tick));
  if(r.sig){const x=+v.toPrecision(r.sig);return +x.toFixed(r.maxDec);}return v;}
function vet(k,q,price){const r=ruleOf(k)||{};if(!(q>0))return 'cantidad cero tras redondear al paso del exchange';
  if(r.minQty&&q<r.minQty-1e-12)return `por debajo de la cantidad mínima del exchange (${r.minQty})`;
  if(r.maxQty&&q>r.maxQty)return `por encima de la cantidad máxima de una orden (${r.maxQty})`;
  if(q*price<minNot(k))return `por debajo del importe mínimo del exchange (${money(minNot(k))})`;return null;}
/* en contado no se puede vender lo que no se tiene: los cortos solo existen en perpetuos (Binance Futuros, Hyperliquid).
   Con IBKR: nunca en cripto, y en acciones y divisas solo con cuenta de margen */
const canShort=k=>!!S.settings.shorts&&(isIB()?ibClass(k)!=='crypto'&&marginOK():srcOf(k)!=='BN');
/* la orden tal y como se enviaría al exchange (en simulación se guarda, no se envía) */
function ticket(k,side,q,kind,price){
  const v=srcOf(k),id=idOf(k),r=ruleOf(k)||{},qs=q.toFixed(decOf(r.step)),red=kind!=='abrir';
  if(isIB()){const cl=ibClass(k),o={ticker:base(k),secType:cl==='crypto'?'CRYPTO':cl==='fx'?'CASH':'STK',orderType:'MKT',side,tif:cl==='crypto'?'IOC':'DAY'};
    if(cl==='crypto'&&side==='BUY')o.cashQty=+(q*price).toFixed(2);else o.quantity=+qs;
    return {api:'POST /iserver/account/{cuenta}/orders',p:{orders:[o]}};}
  if(v==='BN')return {api:'POST /api/v3/order',p:{symbol:id,side,type:'MARKET',quantity:qs}};
  if(v==='BF')return {api:'POST /fapi/v1/order',p:Object.assign({symbol:id,side,type:'MARKET',quantity:qs},red?{reduceOnly:'true'}:{})};
  return {api:'POST /exchange (order)',p:{coin:id,isBuy:side==='BUY',sz:qs,limitPx:String(rp(k,price*(side==='BUY'?1.05:.95))),reduceOnly:red,tif:'Ioc'}};
}
function stopTicket(p){
  const v=srcOf(p.sym),id=idOf(p.sym),r=ruleOf(p.sym)||{},side=isShort(p)?'BUY':'SELL',sp=String(rp(p.sym,p.stop)),qs=p.qty.toFixed(decOf(r.step));
  if(isIB()){const cl=ibClass(p.sym);if(cl==='crypto')return {api:'(la app vigila el stop y envía una orden de mercado al tocarlo)',p:{ticker:base(p.sym),stop:+sp}};
    return {api:'POST /iserver/account/{cuenta}/orders',p:{orders:[{ticker:base(p.sym),secType:cl==='fx'?'CASH':'STK',orderType:'STP',price:+sp,side,quantity:+qs,tif:'GTC'}]}};}
  if(v==='BN')return {api:'POST /api/v3/order',p:{symbol:id,side,type:'STOP_LOSS',quantity:qs,stopPrice:sp}};
  if(v==='BF')return {api:'POST /fapi/v1/order',p:{symbol:id,side,type:'STOP_MARKET',stopPrice:sp,closePosition:'true',workingType:'CONTRACT_PRICE'}};
  return {api:'POST /exchange (order)',p:{coin:id,isBuy:side==='BUY',sz:qs,reduceOnly:true,trigger:{isMarket:true,triggerPx:sp,tpsl:'sl'}}};
}
const ordersOf=()=>S.orders||(S.orders=[]);
function logOrder(a,p,kind,side,q,price,fee){
  const o={t:Date.now(),ag:a.name,sym:p.sym,venue:(ruleOf(p.sym)||{}).venue||SRCNAME[srcOf(p.sym)],kind,side,qty:q,price,fee,mode:'simulada',req:ticket(p.sym,side,q,kind,price)};
  ordersOf().unshift(o);if(S.orders.length>300)S.orders.length=300;
  /* puerta al dinero real: cerrada. Solo existiría en el servidor con LIVE_TRADING=si y el modo real activado expresamente por ti */
  if(S.settings.exec==='real'&&typeof __liveSend==='function'){o.mode='real';try{__liveSend(o);}catch(e){o.err=String(e&&e.message||e);}}
  return o;
}
/* el stop vive en el exchange como orden propia: se mueve (cancelar y volver a poner) cuando sube el trailing */
function syncStop(p){const sp=rp(p.sym,p.stop);if(sp!==p.stop)p.stop=sp;if(!p.sl||p.sl.px!==sp||p.sl.q!==p.qty){p.sl={px:sp,q:p.qty,moves:p.sl?p.sl.moves+1:0,req:stopTicket(p)};}}
/* financiación de los perpetuos: en cada cobro (cada 8 h en Binance, cada hora en Hyperliquid) el largo paga y el corto cobra si la tasa es positiva, y al revés */
function fundTick(a){
  const now=Date.now();
  /* IBKR: no hay perpetuos; los cortos de acciones pagan préstamo (≈0,5 % anual en las fáciles de prestar), cada hora */
  if(isIB()){for(const p of a.positions){if(!isShort(p)||ibClass(p.sym)!=='stk')continue;if(!p.fAt)p.fAt=p.openedAt;
      let n=0;while(p.fAt+36e5<=now&&n++<500){p.fAt+=36e5;const amt=-p.qty*(market.price[p.sym]||p.entry)*.005/8760;a.cash+=amt;p.fund=(p.fund||0)+amt;}}
    return;}
  for(const p of a.positions){const v=srcOf(p.sym);if(v==='BN')continue;
    const f=market.fund&&market.fund[p.sym],iv=(f&&f.iv)||(v==='HL'?36e5:288e5);
    if(!p.fAt)p.fAt=Math.floor(p.openedAt/iv)*iv;
    let n=0;while(p.fAt+iv<=now&&n++<200){p.fAt+=iv;if(!f||!isFinite(f.rate))continue;
      const pr=market.price[p.sym]||p.entry,amt=p.qty*pr*f.rate*(isShort(p)?1:-1);a.cash+=amt;p.fund=(p.fund||0)+amt;}
  }
}
const posVal=(p,price)=>isShort(p)?p.qty*(2*p.entry-price):p.qty*price;
const eq=a=>a.cash+a.positions.reduce((t,p)=>t+Math.max(0,posVal(p,market.price[p.sym]||p.entry)),0);
const total=a=>eq(a)+a.swept+(a.vault||0);
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
/* cartera reservada: solo con tu límite de ganancia puesto. Lo que el agente original tenga por encima de su capital
   pasa, en efectivo, a una cartera aparte y congelada; el agente sigue operando con su capital. En automático no se aparta nada. */
function sweep(a){
  if(a.parentId!=null||!(S.settings.capNet>0))return;
  const x=Math.min(freeCash(a),eq(a)-a.initial);
  if(x>=.005){a.cash-=x;a.vault=(a.vault||0)+x;a._vq=(a._vq||0)+x;}
  if(a._vq>=.005&&Date.now()-(a._vt||0)>600000){L(a,'reserve',`A la cartera reservada: +${money(a._vq)} de beneficio (reservado en total ${money(a.vault)}, congelado). El agente sigue operando con su capital de ${money(a.initial)}.`);a._vq=0;a._vt=Date.now();}
}
/* lo que quedaría limpio si se vendiera ahora: precio con deslizamiento, menos la comisión de venta y menos lo que costó entrar (con su comisión) */
function netIfClose(p,mkt){const sh=isShort(p),price=mkt*(sh?1+S.settings.slip:1-S.settings.slip),f=feeAmt(p.sym,p.qty,price,!sh);return Math.max(0,posVal(p,price))-f-p.basis+(p.taken||0)+(p.fund||0);}
/* toma parcial: vende una parte de la posición y guarda lo ganado; la operación sigue siendo una sola en el historial */
function partialClose(a,p,frac,why){
  const sh=isShort(p),price=(market.price[p.sym]||p.entry)*(sh?1+S.settings.slip:1-S.settings.slip),q=wholeOnly(p.sym,sh)?Math.floor(p.qty*frac):rq(p.sym,p.qty*frac);
  /* el exchange tiene que aceptar las dos partes: la que se vende y la que queda */
  if(vet(p.sym,q,price)||vet(p.sym,+(p.qty-q).toFixed(12),price))return false;
  const b=p.basis*q/p.qty,f=feeAmt(p.sym,q,price,!sh),net=Math.max(0,sh?q*(2*p.entry-price):q*price)-f,pnl=net-b;
  logOrder(a,p,'parcial',sh?'BUY':'SELL',q,price,f);
  if(!p.basis0)p.basis0=p.basis;if(!p.qty0)p.qty0=p.qty;
  a.cash+=net;settle(a,p,net);p.qty=+(p.qty-q).toFixed(12);p.basis-=b;p.taken=(p.taken||0)+pnl;
  L(a,'close',`${base(p.sym)}: ${why} · vende la mitad @ ${px(price)} · ${sgn(pnl)} asegurados; el resto sigue con el stop en la entrada`);
  return true;
}
function openPos(a,an,P){
  const T=TIER[a.tier],e=eq(a),fee=feeOf(an.sym),slip=S.settings.slip;
  const sh=an.side==='short',entry=an.price*(sh?1-slip:1+slip),stopDist=P.stopATR*an.atr;
  if(sh&&!canShort(an.sym))return isIB()?'cortos no permitidos en IBKR para este activo o esta cuenta':'en contado no se puede vender en corto';
  const mn=minNot(an.sym);let qty=(e*P.riskPct*T.risk)/stopDist;
  /* con poco capital, cada posición puede llegar al mínimo del exchange aunque supere el % máximo */
  const cash=freeCash(a);
  const cap=posCap(an.sym,e,P);
  qty=Math.min(Math.max(qty,mn*1.01/entry),Math.max(cap,mn*1.01)/entry,cash/(entry*(1+fee)));
  qty=wholeOnly(an.sym,sh)?Math.floor(qty):rq(an.sym,qty);
  if(qty*entry<mn&&!wholeOnly(an.sym,sh)){const up=rq(an.sym,mn*1.01/entry,true);if(up*entry*(1+fee)<=cash&&up*entry<=Math.max(cap,mn*1.2))qty=up;}
  if(wholeOnly(an.sym,sh)&&qty<1)return 'en corto IBKR solo admite acciones enteras y no cabe ni una';
  const bad=vet(an.sym,qty,entry);if(bad)return bad;
  /* la comisión real puede ser algo mayor que la estimada (mínimo por orden): si no cabe, se ajusta la cantidad al efectivo disponible */
  {const f0=feeAmt(an.sym,qty,entry,sh);if(qty*entry+f0>cash&&!wholeOnly(an.sym,sh)){qty=rq(an.sym,Math.max(0,cash-f0-1e-6)/entry);const b2=vet(an.sym,qty,entry);if(b2)return b2;}}
  const cost=qty*entry,f=feeAmt(an.sym,qty,entry,sh);
  if(cost+f>cash+1e-9)return `efectivo disponible insuficiente (${money(cash)}${cash<a.cash-.005?', el resto aún se está liquidando':''})`;
  a.cash-=cost+f;
  const p={sym:an.sym,side:an.side||'long',tf:an.tf,until:Date.now()+P.maxHold*TF_MS[an.tf],qty,entry,stop:sh?entry+stopDist:entry-stopDist,tp:rp(an.sym,sh?entry-P.tpATR*an.atr:entry+P.tpATR*an.atr),risk:stopDist,high:entry,low:entry,atr:an.atr,openedAt:Date.now(),bars:0,basis:cost+f,kr:an.kr||null};
  syncStop(p);logOrder(a,p,'abrir',sh?'SELL':'BUY',qty,entry,f);
  a.positions.push(p);S.meta=S.meta||{};if(market.meta[an.sym])S.meta[an.sym]=Object.assign({},market.meta[an.sym],ruleOf(an.sym)?{rule:ruleOf(an.sym)}:{});
  L(a,'open',`${sh?'Abre corto en':'Compra'} ${base(an.sym)} (${catOf(an.sym)}) ${money(cost)} @ ${px(entry)} · stop ${px(p.stop)} · objetivo ${px(p.tp)} · puntuación ${an.score} en velas de ${an.tf}${an.kr?` · Kronos prevé ${pct(an.kr.ret)} (${Math.round(an.kr.up*100)}% de escenarios)`:''}`);
  return null;
}
/* user: 'limit' (tu límite de ganancia) o 'manual' (vendida por ti). Esas ventas no cuentan en el aprendizaje del agente:
   van a tu registro aparte, donde se sigue el precio para saber qué habría hecho el plan del agente */
function closePos(a,p,reason,at,user){
  const sh=isShort(p),price=(at||market.price[p.sym]||p.entry)*(sh?1+S.settings.slip:1-S.settings.slip),f=feeAmt(p.sym,p.qty,price,!sh),net=Math.max(0,posVal(p,price))-f,b0=p.basis0||p.basis,pnl=net-p.basis+(p.taken||0)+(p.fund||0);
  a.cash+=net;settle(a,p,net);a.positions=a.positions.filter(x=>x!==p);logOrder(a,p,'cerrar',sh?'BUY':'SELL',p.qty,price,f);
  if(!user){const ex=S.exp[p.sym]||(S.exp[p.sym]={n:0,w:0,pnl:0,sumPct:0});ex.n++;if(pnl>0)ex.w++;ex.pnl+=pnl;ex.sumPct+=pnl/b0;}
  /* recorrido: cuánto llegó a ir a favor (mfe) y en contra (mae), en múltiplos del riesgo inicial (R) */
  const R=p.risk>0?(sh?p.entry-price:price-p.entry)/p.risk:null;
  a.closed.unshift(Object.assign({sym:p.sym,side:p.side||'long',tf:p.tf,entry:p.entry,exit:price,qty:p.qty0||p.qty,pnl,pct:pnl/b0,reason:reason+(p.taken?' · con mitad asegurada':''),t0:p.openedAt,t1:Date.now(),kr:p.kr?1:0,
    mfe:p.mfe!=null?+p.mfe.toFixed(2):null,mae:p.mae!=null?+p.mae.toFixed(2):null,R:R!=null?+R.toFixed(2):null,half:p.taken?1:0,fund:p.fund?+p.fund.toFixed(4):0,venue:(ruleOf(p.sym)||{}).venue||SRCNAME[srcOf(p.sym)],slMoves:p.sl?p.sl.moves:0},user?{user}:{}));
  if(a.closed.length>500)a.closed.length=500;
  if(pnl<0&&!user)a.cooldown[p.sym]=Date.now()+30*60e3;
  if(user)labAdd(a,p,user,price,pnl);
  L(a,'close',`${sh?'Cierra corto en':'Venta'} ${base(p.sym)} @ ${px(price)} · ${sgn(pnl)} (${pct(pnl/b0)}) · motivo: ${reason}${p.mfe!=null?` · llegó a ir ${p.mfe.toFixed(1)}R a favor`:''}`);
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
    const price=market.price[p.sym],cap=S.settings.capNet;
    /* tu límite de ganancia: en cuanto vender deja esa cantidad limpia, se vende (lo demás sigue igual) */
    if(cap>0&&netIfClose(p,price)>=cap){closePos(a,p,'límite de ganancia '+money(cap),undefined,'limit');continue;}
    manage(a,p,price);
  }
}
/* ---------- salidas: cortar las pérdidas pronto y dejar correr las ganancias ----------
   1) El stop inicial no se mueve en contra. 2) A +1R (lo arriesgado) vende la mitad y sube el stop a la entrada:
   desde ahí la operación ya no puede perder. 3) A partir de +1,5R el stop sigue al precio a distancia amplia (trailing).
   4) Al llegar al objetivo no vende: lo deja correr con el stop a 1 ATR del mejor precio. */
const beOf=p=>p.entry*(isShort(p)?1-costOf(p.sym):1+costOf(p.sym));
function manage(a,p,price){
  const sh=isShort(p),fav=p.risk>0?(sh?p.entry-price:price-p.entry)/p.risk:0;
  p.mfe=Math.max(p.mfe||0,fav);p.mae=Math.min(p.mae||0,fav);
  if(sh?price>=p.stop:price<=p.stop){
    const be=beOf(p),atBE=p.half&&Math.abs(p.stop-be)<=Math.max(p.entry*2e-4,(ruleOf(p.sym)||{}).tick||0),win=sh?p.stop<p.entry:p.stop>p.entry;
    closePos(a,p,atBE?'stop en la entrada':win?(p.runner?'objetivo superado y trailing':'trailing'):'stop');return;
  }
  if(!p.half&&fav>=1){
    if(!partialClose(a,p,.5,'+1R alcanzado'))L(a,'info',`${base(p.sym)}: +1R alcanzado; la mitad quedaría por debajo del mínimo del exchange, así que no vende parte, solo sube el stop a la entrada.`);
    p.half=true;const be=beOf(p);p.stop=sh?Math.min(p.stop,be):Math.max(p.stop,be);
  }
  if(sh){if(price<(p.low||p.entry))p.low=price;}else if(price>(p.high||p.entry))p.high=price;
  if(!p.runner&&(sh?price<=p.tp:price>=p.tp)){p.runner=true;L(a,'info',`${base(p.sym)} llega a su objetivo: no vende, lo deja correr con el stop ajustado.`);}
  if(fav>=1.5||p.runner){const d=(p.runner?1:a.params.trailATR)*p.atr;p.stop=sh?Math.min(p.stop,p.low+d):Math.max(p.stop,p.high-d);}
  syncStop(p);
}
/* protege una posición en ganancia: lleva el stop al menos a la entrada */
function protect(p){if(!p.risk)return;const be=beOf(p);p.stop=isShort(p)?Math.min(p.stop,be):Math.max(p.stop,be);syncStop(p);}
/* ---------- tu registro (ventas con límite y ventas manuales) ----------
   No cambia las reglas del agente. Guarda cada venta tuya con su contexto y sigue el precio después para saber qué habría
   hecho el plan del agente (su stop, su objetivo con trailing y su tiempo máximo). Así se puede revisar si te compensa. */
const labOf=()=>S.lab||(S.lab={list:[]});
function labAdd(a,p,kind,price,pnl){
  const now=Date.now(),mk=market.price[p.sym]||price,sh=isShort(p),span=sh?p.entry-p.tp:p.tp-p.entry;
  labOf().list.unshift({kind,limit:kind==='limit'?S.settings.capNet:null,ag:a.name,sym:p.sym,side:p.side||'long',tf:p.tf,entry:p.entry,qty:p.qty,basis:p.basis,taken:p.taken||0,
    t0:p.openedAt,t1:now,exit:price,pnl,prog:span>0?+(((sh?p.entry-mk:mk-p.entry)/span).toFixed(3)):null,
    w:{stop:p.stop,tp:p.tp,until:p.until||now+6*3600e3,high:Math.max(p.high||p.entry,mk),low:Math.min(p.low||p.entry,mk),risk:p.risk,atr:p.atr,trail:a.params.trailATR,last:mk,seen:now},cf:null});
  if(S.lab.list.length>300)S.lab.list.length=300;
}
function labWatch(){
  if(!S.lab)return;const now=Date.now();
  for(const e of S.lab.list){
    if(e.cf)continue;const w=e.w,fin=(x,why)=>{e.cf={pnl:netIfClose(e,x),exit:x,why,t:now};};
    if(!sessOpen(sessOf(e.sym),now)){fin(w.last||e.exit,'cierre del mercado');continue;}
    if(!pxFresh(e.sym,120000)){if(now-w.seen>3*3600e3)e.cf={pnl:null,why:'sin precio para seguirla',t:now};continue;}
    const pr=market.price[e.sym];w.seen=now;w.last=pr;
    if(isShort(e)){
      if(pr<w.low){w.low=pr;if(w.low<=e.entry-w.risk)w.stop=Math.min(w.stop,w.low+w.trail*w.atr);}
      if(pr>=w.stop)fin(w.stop,w.stop<e.entry?'trailing':'stop');else if(pr<=w.tp)fin(w.tp,'objetivo');
    }else{
      if(pr>w.high){w.high=pr;if(w.high>=e.entry+w.risk)w.stop=Math.max(w.stop,w.high-w.trail*w.atr);}
      if(pr<=w.stop)fin(w.stop,w.stop>e.entry?'trailing':'stop');else if(pr>=w.tp)fin(w.tp,'objetivo');
    }
    if(!e.cf&&now>=w.until)fin(pr,'tiempo máximo');
  }
}
/* resumen: lo que ganaste con tus decisiones frente a lo que habría dado el plan del agente en esas mismas operaciones */
function labSum(kind,limit){
  const l=(S.lab?S.lab.list:[]).filter(e=>e.kind===kind&&(limit==null||e.limit===limit)),d=l.filter(e=>e.cf&&e.cf.pnl!=null);
  const you=d.reduce((t,e)=>t+e.pnl,0),plan=d.reduce((t,e)=>t+e.cf.pnl,0);
  return {n:l.length,pnl:l.reduce((t,e)=>t+e.pnl,0),done:d.length,you,plan,diff:you-plan,better:d.filter(e=>e.pnl>e.cf.pnl).length,pend:l.filter(e=>!e.cf).length,
    held:l.length?l.reduce((t,e)=>t+(e.t1-e.t0),0)/l.length/60000:0};
}
/* experiencia: el historial propio con cada activo ajusta la puntuación y puede vetarlo */
function xp(sym){const e=S.exp[sym];if(!e||e.n<3)return {adj:0,veto:false,e};const wr=(e.w+1)/(e.n+2);return {adj:Math.round((wr-.5)*30),veto:e.n>=6&&e.pnl<0&&wr<.35,e};}
function decide(a,an,P,T,pre){
  const sh=an.side==='short';
  if(sh&&!S.settings.shorts)return 'cortos desactivados';
  if(sh&&!canShort(an.sym))return isIB()?(ibClass(an.sym)==='crypto'?'IBKR no permite cortos en cripto':'cortos solo con cuenta de margen (desde $2.000)'):'en contado no se puede vender en corto';
  if(isIB()&&!ibOK(an.sym))return 'no disponible en IBKR';
  if(!an.trend)return sh?'sin tendencia bajista':'sin tendencia alcista';
  if(!sh&&an.rsi>P.rsiMax)return `RSI ${an.rsi.toFixed(0)} sobrecomprado`;
  if(!sh&&an.rsi<P.rsiMin)return `RSI ${an.rsi.toFixed(0)} sin fuerza`;
  if(sh&&an.rsi<100-P.rsiMax)return `RSI ${an.rsi.toFixed(0)} sobrevendido`;
  if(sh&&an.rsi>100-P.rsiMin)return `RSI ${an.rsi.toFixed(0)} sin presión vendedora`;
  const x=xp(an.sym);if(x.veto)return `experiencia negativa con ${base(an.sym)} (${x.e.w} de ${x.e.n} aciertos, ${sgn(x.e.pnl)})`;
  /* dirección y mercado suelen ser las mismas operaciones (en fin de semana, todo cripto): no se resta dos veces */
  const ed=edgeAdj(an);if(ed.adj<-10)ed.adj=-10;
  if(an.score+x.adj+ed.adj<P.minScore)return `puntuación ${an.score}${x.adj?(x.adj>0?'+':'')+x.adj+' por experiencia':''}${ed.adj?(ed.adj>0?'+':'')+ed.adj+' por resultados recientes ('+ed.why+')':''} < ${P.minScore}`;
  if(an.atrPct<.002)return 'volatilidad demasiado baja para cubrir comisiones';
  if(an.atrPct>.06)return 'volatilidad excesiva';
  if(P.tpATR*an.atrPct<Math.max(.006,3*costOf(an.sym)))return 'objetivo no cubre los costes (pide 3 veces la comisión)';
  if(an.tick&&(an.tick/an.price>.0008||P.stopATR*an.atr<8*an.tick))return `precio a saltos demasiado grandes (paso ${px(an.tick)})`;
  if(catOf(an.sym)==='Cripto'&&base(an.sym)!=='BTC'){const bt=btcTrend(P);if(bt&&((sh&&bt==='up')||(!sh&&bt==='down')))return `contra la tendencia del bitcoin (${bt==='up'?'alcista':'bajista'})`;}
  if(sh?an.price<an.last-an.atr:an.price>an.last+an.atr)return 'el precio ya se escapó de la señal';
  if((a.cooldown[an.sym]||0)>Date.now())return 'en espera tras una pérdida reciente';
  if(a.positions.length>=Math.min(P.maxPos,T.pos))return 'máximo de posiciones para su nivel';
  {const lim=Math.min(4,Math.max(2,Math.ceil(Math.min(P.maxPos,T.pos)*.75)));if(catOf(an.sym)==='Cripto'&&a.positions.filter(p=>catOf(p.sym)==='Cripto'&&(p.side||'long')===(an.side||'long')).length>=lim)return `ya tiene ${lim} criptomonedas en la misma dirección`;}
  if(a.positions.some(p=>p.sym===an.sym||(catOf(p.sym)==='Cripto'&&catOf(an.sym)==='Cripto'&&base(p.sym)===base(an.sym))))return 'ya en cartera';
  if(!pre&&krOn()){
    const f=krOf(an.sym,an.tf);
    if(!f){if(!KR.err||KR.ok){an.krPending=true;return 'esperando la previsión de Kronos';}}
    else{
      const sh=an.side==='short',dir=sh?-f.ret:f.ret,agree=sh?1-f.up:f.up;
      if(agree<.5)return `Kronos no confirma la dirección (${Math.round(agree*100)}% de escenarios a favor)`;
      if(dir<costOf(an.sym))return `Kronos prevé poco recorrido (${pct(dir)})`;
      an.kr={ret:dir,up:agree};
    }
  }
  return null;
}
