'use strict';
const LS='automaton.app.real.v1';
const DEF_PARAMS={riskPct:.01,maxPosPct:.08,maxPos:12,emaF:9,emaS:21,rsiMin:45,rsiMax:70,stopATR:1.5,tpATR:3,trailATR:1.2,minScore:60,maxHold:48};
const BOUNDS={riskPct:[.002,.03],maxPosPct:[.04,.4],maxPos:[1,20],emaF:[5,15],emaS:[16,40],rsiMin:[35,55],rsiMax:[62,80],stopATR:[.8,3],tpATR:[1.5,6],trailATR:[.6,3],minScore:[50,80],maxHold:[12,120]};
const PLABEL={riskPct:'Riesgo por operación',maxPosPct:'Máx. por posición',maxPos:'Posiciones máximas',emaF:'EMA rápida',emaS:'EMA lenta',rsiMin:'RSI mínimo',rsiMax:'RSI máximo',stopATR:'Stop (× ATR)',tpATR:'Objetivo (× ATR)',trailATR:'Trailing (× ATR)',minScore:'Puntuación mínima',maxHold:'Velas máx. en posición'};
const INTS=new Set(['maxPos','emaF','emaS','minScore','maxHold']);
const MIN_NOTIONAL=5;

const $=id=>document.getElementById(id);
const money=n=>(n<0?'−':'')+'$'+Math.abs(n).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const sgn=n=>(n>=0?'+':'−')+'$'+Math.abs(n).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=(n,d=2)=>(n>=0?'+':'−')+Math.abs(n*100).toFixed(d)+'%';
const clock=t=>new Date(t).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const px=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(3):p.toPrecision(3);

/* ---------- mercados reales: datos públicos de solo lectura, sin clave ----------
   BN = Binance contado (cripto) · BF = Binance Futuros TradFi (oro, plata…) · HL = Hyperliquid HIP-3 (acciones, índices, materias primas, divisas)
   Cada activo se identifica como "FUENTE:símbolo" (BN:BTCUSDT, BF:XAUUSDT, HL:xyz:TSLA). */
const HOSTS=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api.binance.us'];
const FAPI='https://fapi.binance.com',HLAPI='https://api.hyperliquid.xyz/info';
const STABLE=new Set(['USDC','FDUSD','TUSD','USDP','DAI','USDE','EUR','EURI','AEUR','BUSD','USD1','XUSD','PAXG','XAUT','RLUSD','BFUSD','UST','USDS','PYUSD']);
const SRCNAME={BN:'Binance',BF:'Binance Futuros',HL:'Hyperliquid'};
const CAT_IDX=new Set(['XYZ100','US500','SPX','SP500','USA500','NDX','NAS100','NASDAQ','US100','USTECH','DJI','US30','DOW','RUSSELL','RUT','US2000','JP225','NIKKEI','DAX','GER40','DE40','UK100','FTSE','HK50','HSI','KOSPI','EU50','STOXX','CAC40','VIX','SMALL2000','MAG7','SEMIS']);
const CAT_COM=new Set(['GOLD','SILVER','XAU','XAG','CL','OIL','WTI','BRENT','USOIL','UKOIL','NATGAS','NG','GAS','COPPER','HG','PLATINUM','PLAT','XPT','PALLADIUM','XPD','URANIUM','URNM','CORN','WHEAT','SOY','SOYBEAN','COFFEE','COCOA','SUGAR','COTTON','LUMBER','ALUMINIUM','ALUMINUM','NICKEL','ZINC']);
const CAT_FX=new Set(['EUR','JPY','GBP','CHF','AUD','CAD','NZD','MXN','CNH','CNY','TRY','BRL','INR','KRW','SEK','NOK','ZAR','EURUSD','USDJPY','GBPUSD','USDCHF','AUDUSD','USDCAD','DXY','USDX']);
let S=null;
const market={price:{},pt:{},k:{},meta:{},lists:{BN:[],BF:[],HL:[]},universe:[],src:{BN:{},BF:{},HL:{}},host:null,err:null,uniAt:0,hlAt:{}};
const ui={radar:[],summary:'',reasons:'',scanAt:0};
const srcOf=k=>k.slice(0,2),idOf=k=>k.slice(3);
/* datos de cada activo: los del mercado y, para posiciones abiertas, una copia guardada (sobrevive a recargas) */
const metaOf=k=>market.meta[k]||(S&&S.meta&&S.meta[k])||null;
const base=k=>(metaOf(k)&&metaOf(k).name)||k.split(':').pop().replace(/USDT$/,'');
const catOf=k=>(metaOf(k)&&metaOf(k).cat)||(srcOf(k)==='BN'?'Cripto':'Otros');
/* cada precio guarda cuándo llegó: nunca se decide ni se ejecuta con precios viejos */
function setPx(k,v){if(v>0&&isFinite(v)){market.price[k]=v;market.pt[k]=Date.now();}}
const pxFresh=(k,ms)=>market.price[k]>0&&Date.now()-(market.pt[k]||0)<ms;
let instantFails=0,okFetches=0;
async function fget(url,opt){
  const c=new AbortController(),to=setTimeout(()=>c.abort(),9000),t0=performance.now();
  try{const r=await fetch(url,Object.assign({signal:c.signal},opt||{}));if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();okFetches++;return j;}
  catch(e){if(e&&e.name==='TypeError'&&performance.now()-t0<60)instantFails++;throw e;}
  finally{clearTimeout(to);}
}
async function jget(path){
  const order=market.host?[market.host,...HOSTS.filter(h=>h!==market.host)]:HOSTS;let err;
  for(const h of order){try{const j=await fget(h+path);market.host=h;return j;}catch(e){err=e;}}
  throw err||new Error('sin conexión');
}
const hl=body=>fget(HLAPI,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function ok(src){market.src[src]={ok:true,at:Date.now(),err:null,n:market.lists[src].length};}
function why(e){
  const m=(e&&(e.name==='AbortError'?'timeout':e.message))||'';
  if(m==='timeout')return 'no responde a tiempo';
  if(/HTTP 451|HTTP 403/.test(m))return 'bloqueado en tu país o red';
  if(/HTTP 429|HTTP 418/.test(m))return 'demasiadas peticiones, espera un minuto';
  if(/HTTP/.test(m))return 'error del servidor ('+m.replace('HTTP ','')+')';
  return 'conexión bloqueada';
}
/* si una fuente dice "demasiadas peticiones" (429) o bloquea la IP (418), se la deja descansar antes de volver a pedir */
function fail(src,e){const m=(e&&e.message)||'',cd=/HTTP 418/.test(m)?15*60e3:/HTTP 429/.test(m)?90e3:0,prev=market.src[src]||{};
  market.src[src]=Object.assign({},prev,{ok:false,err:why(e),cool:cd?Date.now()+cd:prev.cool});}
const cooling=s=>((market.src[s]||{}).cool||0)>Date.now();
const BF_CAP=40; /* Binance Futuros ya tiene cientos de contratos TradFi: se vigilan los de más volumen para no pasar el límite de peticiones */
async function pool(items,n,fn){const q=items.slice();await Promise.all(Array.from({length:Math.min(n,q.length)},async()=>{while(q.length){const it=q.shift();try{await fn(it);}catch(e){}}}));}

async function uniBN(){
  const t=await jget('/api/v3/ticker/24hr');
  const list=t.filter(x=>x.symbol.endsWith('USDT')&&!STABLE.has(x.symbol.slice(0,-4))&&+x.lastPrice>0&&+x.quoteVolume>0)
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,S.settings.universe);
  market.lists.BN=list.map(x=>{const k='BN:'+x.symbol;market.meta[k]={name:x.symbol.slice(0,-4),cat:'Cripto',vol:+x.quoteVolume,o24:+x.openPrice||0};setPx(k,+x.lastPrice);return k;});
  ok('BN');
}
async function uniBF(){
  const [info,t24]=await Promise.all([fget(FAPI+'/fapi/v1/exchangeInfo'),fget(FAPI+'/fapi/v1/ticker/24hr')]);
  const vol={};t24.forEach(x=>vol[x.symbol]=[+x.quoteVolume,+x.lastPrice,+x.openPrice||0]);
  const out=[];
  info.symbols.forEach(x=>{
    const ut=String(x.underlyingType||'').toUpperCase(),ct=String(x.contractType||'').toUpperCase(),sub=(x.underlyingSubType||[]).join(' ').toUpperCase();
    const tradfi=ct.includes('TRADIFI')||ct.includes('TRADFI')||sub.includes('TRADFI')||['COMMODITY','EQUITY','HK_EQUITY','KR_EQUITY','CN_EQUITY','STOCK','FOREX','FX','METAL'].includes(ut);
    if(x.status!=='TRADING'||x.quoteAsset!=='USDT'||!tradfi||!vol[x.symbol]||!(vol[x.symbol][0]>0))return;
    const name=x.baseAsset||x.symbol.replace(/USDT$/,'');
    let cat=ut==='COMMODITY'||ut==='METAL'||CAT_COM.has(name)?'Materias primas':/EQUITY|STOCK/.test(ut)?'Acciones':(ut==='FOREX'||ut==='FX'||CAT_FX.has(name))?'Divisas':CAT_IDX.has(name)?'Índices':'TradFi';
    const sess={HK_EQUITY:'hk',KR_EQUITY:'krx',CN_EQUITY:'shanghai'}[ut];
    const k='BF:'+x.symbol;market.meta[k]={name,cat,vol:vol[x.symbol][0],sess,o24:vol[x.symbol][2]};setPx(k,vol[x.symbol][1]);out.push(k);
  });
  market.lists.BF=out.sort((a,b)=>market.meta[b].vol-market.meta[a].vol).slice(0,BF_CAP);ok('BF');
}
async function uniHL(){
  const dexes=(await hl({type:'perpDexs'})||[]).filter(Boolean).map(d=>d.name).filter(Boolean);
  const cryptoNames=new Set(market.lists.BN.map(base));
  const best={};
  await pool(dexes,3,async dex=>{
    const [meta,ctxs]=await hl({type:'metaAndAssetCtxs',dex});
    meta.universe.forEach((u,i)=>{
      const c=ctxs[i]||{};if(u.isDelisted)return;
      const id=u.name.includes(':')?u.name:dex+':'+u.name,name=id.split(':')[1],v=+c.dayNtlVlm||0,p=+(c.midPx||c.markPx)||0;
      if(!p||v<20000)return;
      const cat=CAT_IDX.has(name)?'Índices':CAT_COM.has(name)?'Materias primas':CAT_FX.has(name)?'Divisas':cryptoNames.has(name)?'Cripto':'Acciones';
      if(cat==='Cripto'&&S.settings.markets.BN)return; /* ya la cubre Binance */
      if(!best[name]||best[name].v<v)best[name]={id,name,cat,v,p,o24:+c.prevDayPx||0};
    });
    market.hlAt[dex]=Date.now();
  });
  const cap=S.settings.tf==='1m'?10:30;
  market.lists.HL=Object.values(best).sort((a,b)=>b.v-a.v).slice(0,cap).map(x=>{const k='HL:'+x.id;market.meta[k]={name:x.name,cat:x.cat,vol:x.v,o24:x.o24};setPx(k,x.p);return k;});
  ok('HL');
}
async function loadUniverse(){
  const m=S.settings.markets,jobs=[];
  if(m.BN){if(!cooling('BN'))jobs.push(uniBN().catch(e=>fail('BN',e)));}else market.lists.BN=[];
  await Promise.all(jobs);  /* HL usa la lista de cripto para no duplicarla */
  const j2=[];
  if(m.BF){if(!cooling('BF'))j2.push(uniBF().catch(e=>fail('BF',e)));}else market.lists.BF=[];
  if(m.HL){if(!cooling('HL'))j2.push(uniHL().catch(e=>fail('HL',e)));}else market.lists.HL=[];
  await Promise.all(j2);
  market.universe=[...market.lists.BN,...market.lists.BF,...market.lists.HL].sort((a,b)=>(market.meta[b].vol||0)-(market.meta[a].vol||0));
  market.uniAt=Date.now();
  market.err=Object.values(market.src).some(x=>x.ok)?null:'ninguna fuente responde';
}
/* ---------- horarios reales de cada mercado ----------
   Solo se opera un activo mientras su mercado de origen está abierto. Fuera de horario los contratos
   siguen cotizando, pero ese movimiento no es el del activo real: no se usa ni para decidir ni para salir. */
const US_HOL=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
 '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
 '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25']);
const US_EARLY=new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
const CME_HOL=new Set(['2026-01-01','2026-04-03','2026-12-25','2027-01-01','2027-03-26','2027-12-24','2028-04-14','2028-12-25']);
const SESS={
  '24x7':{name:'Cripto (24 h)'},
  us:{name:'Bolsa EE. UU.',tz:'America/New_York',f:(d,m,y)=>d>=1&&d<=5&&!US_HOL.has(y)&&m>=570&&m<(US_EARLY.has(y)?780:960)},
  tokyo:{name:'Bolsa de Tokio',tz:'Asia/Tokyo',f:(d,m)=>d>=1&&d<=5&&((m>=540&&m<690)||(m>=750&&m<930))},
  xetra:{name:'Bolsa de Fráncfort / Europa',tz:'Europe/Berlin',f:(d,m)=>d>=1&&d<=5&&m>=540&&m<1050},
  lse:{name:'Bolsa de Londres',tz:'Europe/London',f:(d,m)=>d>=1&&d<=5&&m>=480&&m<990},
  hk:{name:'Bolsa de Hong Kong',tz:'Asia/Hong_Kong',f:(d,m)=>d>=1&&d<=5&&((m>=570&&m<720)||(m>=780&&m<960))},
  krx:{name:'Bolsa de Corea',tz:'Asia/Seoul',f:(d,m)=>d>=1&&d<=5&&m>=540&&m<930},
  shanghai:{name:'Bolsa de Shanghái',tz:'Asia/Shanghai',f:(d,m)=>d>=1&&d<=5&&((m>=570&&m<690)||(m>=780&&m<900))},
  globex:{name:'Materias primas (CME)',tz:'America/New_York',f:(d,m,y)=>!CME_HOL.has(y)&&((d===0&&m>=1080)||(d>=1&&d<=4&&(m<1020||m>=1080))||(d===5&&m<1020))},
  grains:{name:'Agrícolas (CBOT)',tz:'America/Chicago',f:(d,m,y)=>d>=1&&d<=5&&!US_HOL.has(y)&&m>=510&&m<800},
  fx:{name:'Divisas',tz:'America/New_York',f:(d,m,y)=>!CME_HOL.has(y)&&((d===0&&m>=1020)||(d>=1&&d<=4)||(d===5&&m<1020))}
};
const IDX_SESS={JP225:'tokyo',NIKKEI:'tokyo',DAX:'xetra',GER40:'xetra',DE40:'xetra',EU50:'xetra',STOXX:'xetra',CAC40:'xetra',UK100:'lse',FTSE:'lse',HK50:'hk',HSI:'hk',KOSPI:'krx',VIX:'globex'};
const GRAINS=new Set(['CORN','WHEAT','SOY','SOYBEAN']);
function sessOf(k){
  if(srcOf(k)==='BN')return '24x7';
  {const m=metaOf(k);if(m&&m.sess)return m.sess;}
  const c=catOf(k),n=base(k);
  if(c==='Cripto')return '24x7';
  if(c==='Índices')return IDX_SESS[n]||'us';
  if(c==='Materias primas')return GRAINS.has(n)?'grains':'globex';
  if(c==='Divisas')return 'fx';
  return 'us'; /* acciones y TradFi sin clasificar: horario de la bolsa de EE. UU. */
}
const fmts={};
function parts(t,tz){
  const f=fmts[tz]||(fmts[tz]=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}));
  const o={};f.formatToParts(new Date(t)).forEach(p=>o[p.type]=p.value);
  return {d:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(o.weekday),m:(+o.hour%24)*60+ +o.minute,y:`${o.year}-${o.month}-${o.day}`};
}
const openMemo={};
function sessOpen(cls,t){
  const S2=SESS[cls];if(!S2||!S2.f)return true;
  const key=cls+Math.floor(t/60000);if(key in openMemo)return openMemo[key];
  const p=parts(t,S2.tz),v=S2.f(p.d,p.m,p.y);
  if(Object.keys(openMemo).length>20000)for(const x in openMemo)delete openMemo[x];
  return openMemo[key]=v;
}
const isOpen=(k,t=Date.now())=>sessOpen(sessOf(k),t);
/* minutos hasta el cierre (máx. 240) y momento de la próxima apertura (máx. 5 días) */
function minsToClose(cls,t=Date.now()){if(!SESS[cls].f)return Infinity;for(let i=0;i<=240;i+=5)if(!sessOpen(cls,t+i*60000))return i;return Infinity;}
const noCache={};
function nextOpen(cls,t=Date.now()){const c=noCache[cls];if(c&&c>t)return c;for(let i=5;i<=7200;i+=5)if(sessOpen(cls,t+i*60000))return noCache[cls]=t+i*60000;return null;}
const uni=()=>market.universe;
async function pollPrices(){
  const need=new Set();S.agents.forEach(a=>a.positions.forEach(p=>need.add(p.sym)));
  const all=new Set([...market.universe,...need]),by={BN:[],BF:[],HL:[]};
  /* con su mercado cerrado no hace falta precio continuo, pero cada fuente se consulta al menos una vez por minuto para saber que sigue conectada */
  const stale=s=>!(market.src[s]&&market.src[s].ok&&Date.now()-market.src[s].at<60000);
  all.forEach(k=>{const s=srcOf(k);if(by[s]&&!cooling(s)&&(need.has(k)||isOpen(k)||Date.now()-market.uniAt<20000||stale(s)))by[s].push(k);});
  const jobs=[];
  if(by.BN.length)jobs.push(jget('/api/v3/ticker/price?symbols='+encodeURIComponent(JSON.stringify(by.BN.map(idOf))))
    .catch(()=>jget('/api/v3/ticker/price'))
    .then(j=>{j.forEach(x=>setPx('BN:'+x.symbol,+x.price));market.src.BN.at=Date.now();market.src.BN.ok=true;market.src.BN.err=null;}).catch(e=>fail('BN',e)));
  if(by.BF.length)jobs.push(fget(FAPI+'/fapi/v1/ticker/price')
    .then(j=>{const w=new Set(by.BF);j.forEach(x=>{const k='BF:'+x.symbol;if(w.has(k))setPx(k,+x.price);});market.src.BF.at=Date.now();market.src.BF.ok=true;market.src.BF.err=null;}).catch(e=>fail('BF',e)));
  if(by.HL.length){
    const dexes=new Set(by.HL.map(k=>idOf(k).split(':')[0])),hot=new Set([...need].filter(k=>srcOf(k)==='HL').map(k=>idOf(k).split(':')[0]));
    dexes.forEach(dex=>{
      if(!hot.has(dex)&&Date.now()-(market.hlAt[dex]||0)<60000)return; /* sin posiciones: basta un precio por minuto */
      jobs.push(hl({type:'allMids',dex}).then(async m=>{
        let hit=0;for(const c in m){if(!c.startsWith(dex+':'))continue;const k='HL:'+c;if(all.has(k)){setPx(k,+m[c]);hit++;}}
        if(!hit){const [meta,ctxs]=await hl({type:'metaAndAssetCtxs',dex});meta.universe.forEach((u,i)=>{const id=u.name.includes(':')?u.name:dex+':'+u.name,k='HL:'+id,c=ctxs[i]||{};if(all.has(k))setPx(k,+(c.midPx||c.markPx));});}
        market.hlAt[dex]=Date.now();market.src.HL.at=Date.now();market.src.HL.ok=true;market.src.HL.err=null;}).catch(e=>fail('HL',e)));
    });
  }
  await Promise.all(jobs);
  market.err=Object.values(market.src).some(x=>x.ok&&Date.now()-x.at<90000)?null:'ninguna fuente responde';
  /* una fuente que se quedó fuera (por ejemplo, tras un "demasiadas peticiones") se vuelve a cargar en cuanto termina su descanso, sin esperar 30 min */
  if(['BN','BF','HL'].some(x=>S.settings.markets[x]&&!market.lists[x].length&&!cooling(x))&&Date.now()-market.uniAt>120000)market.uniAt=0;
}
async function fetchKlines(tf){
  const now=Date.now(),ms=TF_MS[tf];market.k[tf]=market.k[tf]||{};market.kAt=market.kAt||{};market.kAt[tf]=Math.floor(now/ms);
  const held=new Set();S.agents.forEach(a=>a.positions.forEach(p=>held.add(p.sym)));
  const keys=[...new Set([...uni(),...held])].filter(k=>(isOpen(k)||held.has(k))&&!cooling(srcOf(k)));
  if(!market.raw)market.raw={};
  const toK=k=>k.map(r=>({t:r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],ct:r[6]}));
  const store=(k,arr)=>{
    if(srcOf(k)==='BN'){market.k[tf][k]=arr.filter(c=>c.ct<now).slice(-300);return;}
    const rk=tf+'|'+k,old=market.raw[rk]?market.raw[rk].c:[],m=new Map(old.map(c=>[c.t,c]));arr.forEach(c=>m.set(c.t,c));
    const all=[...m.values()].sort((x,y)=>x.t-y.t).slice(-3000);market.raw[rk]={tf,c:all};
    const cls=sessOf(k);market.k[tf][k]=all.filter(c=>c.ct<now&&sessOpen(cls,c.t)).slice(-150);
  };
  /* sin historial previo: se piden varios días para reunir velas de sesión real; después, solo las nuevas */
  const since=k=>{const r=market.raw[tf+'|'+k];return r&&r.c.length&&now-r.c[r.c.length-1].t<(tf==='1h'?10:tf==='15m'?6:3)*864e5?r.c[r.c.length-1].t:null;};
  const bin=keys.filter(k=>srcOf(k)!=='HL'),hls=keys.filter(k=>srcOf(k)==='HL');
  await Promise.all([
    pool(bin,6,async k=>{if(cooling(srcOf(k)))return;const id=idOf(k);let r;try{
      if(srcOf(k)==='BN')r=await jget(`/api/v3/klines?symbol=${id}&interval=${tf}&limit=300`);
      /* peso bajo: 499 velas la primera vez, y luego solo las nuevas (hasta 99) */
      else{const st=since(k),gap=st?Math.ceil((now-st)/ms):1e9;r=await fget(`${FAPI}/fapi/v1/klines?symbol=${id}&interval=${tf}&`+(gap<=98?`startTime=${st}&limit=99`:'limit=499'));}
      }catch(e){if(/HTTP 4(18|29)/.test((e&&e.message)||''))fail(srcOf(k),e);throw e;}
      store(k,toK(r));}),
    pool(hls,2,async k=>{if(cooling('HL'))return;const st=since(k)||now-({'1m':2,'5m':4,'15m':8,'1h':20}[tf]||4)*864e5;
      let r;try{r=await hl({type:'candleSnapshot',req:{coin:idOf(k),interval:tf,startTime:st,endTime:now}});}catch(e){if(/HTTP 4(18|29)/.test((e&&e.message)||''))fail('HL',e);throw e;}
      store(k,r.map(c=>({t:c.t,o:+c.o,h:+c.h,l:+c.l,c:+c.c,v:+c.v,ct:c.T}))); })
  ]);
}
const TF_MS={'1m':6e4,'5m':3e5,'15m':9e5,'1h':36e5};
/* el agente decide en las velas elegidas y, si están demasiado tranquilas, en las de la escala superior */
const HIGHER={'1m':'5m','5m':'15m','15m':'1h'};
/* también 1 hora: con el mercado tranquilo, las velas cortas no cubren comisiones y las largas sí */
const tfs=()=>[...new Set([S.settings.tf,HIGHER[S.settings.tf],'1h'])];
const kOf=(tf,k)=>(market.k[tf]||{})[k];

/* ---------- estado ---------- */
function newAgent(o){return Object.assign({id:0,name:'Automaton',gen:0,parentId:null,born:Date.now(),params:{...DEF_PARAMS},initial:1000,cash:1000,reserve:0,swept:0,positions:[],closed:[],status:'alive',tier:'normal',cooldown:{},hist:[],peak:1000,maxDD:0,lastHist:0,lastSpawn:0,lastAdopt:0,life:'alive',events:[],inbox:[],spec:'Todo',genesis:null,constitution:null,constHash:null},o);}
function fresh(capital,settings,exp){
  return {v:1,initial:capital,startedAt:Date.now(),lastSeen:Date.now(),running:true,nextId:1,
    agents:[newAgent({initial:capital,cash:capital,peak:capital,constitution:CONSTITUTION,constHash:CONST_HASH})],log:[],exp:exp||{},
    settings:settings||{fee:.001,slip:.0005,universe:40,maxOpenV:1,tf:'5m',repl:true,maxKids:3,shorts:true,markets:{BN:true,BF:true,HL:true},kronos:{url:'',mode:'off'}}};
}
function valid(s){return s&&s.v===1&&Array.isArray(s.agents)&&s.agents.length&&s.settings;}
function readLS(){try{const r=localStorage.getItem(LS);if(r){const s=JSON.parse(r);if(valid(s))return s;}}catch(e){}return null;}
/* copia en IndexedDB además de localStorage: si el navegador limpia una, queda la otra */
function idb(){return new Promise((res,rej)=>{try{const q=indexedDB.open('automaton',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}catch(e){rej(e);}});}
async function idbPut(v){try{const d=await idb();d.transaction('kv','readwrite').objectStore('kv').put(v,LS);}catch(e){}}
async function idbGet(){try{const d=await idb();return await new Promise(r=>{const q=d.transaction('kv').objectStore('kv').get(LS);q.onsuccess=()=>r(q.result||null);q.onerror=()=>r(null);});}catch(e){return null;}}
/* modo servidor: este dispositivo solo muestra y controla el agente que funciona 24/7 en el servidor */
const IS_SERVER=!!globalThis.__SERVER__;
const REMK='automaton.remote';
const REM=(()=>{try{return Object.assign({url:'',key:'',on:false},JSON.parse(localStorage.getItem(REMK)||'{}'));}catch(e){return {url:'',key:'',on:false};}})();
const remSave=()=>{try{localStorage.setItem(REMK,JSON.stringify(REM));}catch(e){}};
let saveT=0;
function save(force){
  if(REM.on)return; /* lo que se ve es del servidor: no se guarda encima del agente de este dispositivo */
  const n=Date.now();if(!force&&n-saveT<4000)return;saveT=n;
  let j;try{j=JSON.stringify(S);}catch(e){return;}
  try{localStorage.setItem(LS,j);}catch(e){}
  idbPut(j);
}
async function loadState(){
  const a=readLS();let b=null;
  try{const r=await idbGet();if(r){const s=JSON.parse(r);if(valid(s))b=s;}}catch(e){}
  const pick=a&&b?(b.lastSeen>a.lastSeen?b:a):(a||b);
  return migrate(pick||fresh(1000));
}
