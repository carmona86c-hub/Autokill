'use strict';
/* ---------- Mercados: todos los activos que vigila el bot, con su gráfico de velas y el análisis del agente ----------
   Ideas tomadas de NeuralTrade (watchlist global por regiones, horarios de sesión, mayores movimientos y panel de señal),
   pero con precios y velas reales de Binance / Hyperliquid y con las mismas reglas con las que decide el agente. */
const MKLS='automaton.mkt';
const MK=Object.assign({q:'',cat:'Todos',sort:'vol',tf:'15m',zoom:90},(()=>{try{return JSON.parse(localStorage.getItem(MKLS)||'{}');}catch(e){return {};}})(),{open:null,cache:{},busy:{},err:{},cross:null,live:0,html:''});
const mkSave=()=>{try{localStorage.setItem(MKLS,JSON.stringify({cat:MK.cat,sort:MK.sort,tf:MK.tf,zoom:MK.zoom}));}catch(e){}};
const MK_TF={'5m':3e5,'15m':9e5,'1h':36e5,'4h':144e5,'1d':864e5};
const MK_TFL={'5m':'5m','15m':'15m','1h':'1h','4h':'4h','1d':'1D'};
const MK_TFN={'5m':'5 min','15m':'15 min','1h':'1 hora','4h':'4 horas','1d':'1 día'};
const MK_CATS=['Todos','En cartera','Cripto','Acciones','Índices','Materias primas','Divisas','TradFi'];
/* nombres legibles de los más conocidos */
const MK_NAMES={BTC:'Bitcoin',ETH:'Ethereum',SOL:'Solana',XRP:'XRP',BNB:'BNB',DOGE:'Dogecoin',ADA:'Cardano',TRX:'Tron',AVAX:'Avalanche',LINK:'Chainlink',DOT:'Polkadot',LTC:'Litecoin',BCH:'Bitcoin Cash',SUI:'Sui',TON:'Toncoin',PEPE:'Pepe',SHIB:'Shiba Inu',HYPE:'Hyperliquid',NEAR:'Near',APT:'Aptos',
  TSLA:'Tesla',NVDA:'Nvidia',AAPL:'Apple',MSFT:'Microsoft',AMZN:'Amazon',GOOGL:'Alphabet (Google)',GOOG:'Alphabet (Google)',META:'Meta',NFLX:'Netflix',AMD:'AMD',INTC:'Intel',MU:'Micron',PLTR:'Palantir',COIN:'Coinbase',MSTR:'Strategy',HOOD:'Robinhood',AVGO:'Broadcom',TSM:'TSMC',ASML:'ASML',ORCL:'Oracle',IBM:'IBM',GME:'GameStop',CRCL:'Circle',BABA:'Alibaba',
  SPY:'ETF S&P 500',QQQ:'ETF Nasdaq 100',SPX:'S&P 500',US500:'S&P 500',SP500:'S&P 500',XYZ100:'Nasdaq 100',NDX:'Nasdaq 100',NAS100:'Nasdaq 100',US100:'Nasdaq 100',DJI:'Dow Jones',US30:'Dow Jones',JP225:'Nikkei 225',NIKKEI:'Nikkei 225',DAX:'DAX 40',GER40:'DAX 40',DE40:'DAX 40',UK100:'FTSE 100',FTSE:'FTSE 100',HK50:'Hang Seng',HSI:'Hang Seng',EU50:'Euro Stoxx 50',VIX:'VIX (volatilidad)',KOSPI:'KOSPI',
  XAU:'Oro',GOLD:'Oro',XAG:'Plata',SILVER:'Plata',CL:'Petróleo WTI',WTI:'Petróleo WTI',BRENTOIL:'Petróleo Brent',BRENT:'Petróleo Brent',NATGAS:'Gas natural',COPPER:'Cobre',PLATINUM:'Platino',XPT:'Platino',PALLADIUM:'Paladio',XPD:'Paladio',URANIUM:'Uranio',
  EUR:'Euro / dólar',EURUSD:'Euro / dólar',JPY:'Dólar / yen',USDJPY:'Dólar / yen',GBP:'Libra / dólar',GBPUSD:'Libra / dólar',DXY:'Índice dólar'};
const mkName=k=>{const n=ubase(k);return MK_NAMES[n]||MK_NAMES[String(base(k)).toUpperCase()]||null;};
const mkPx=k=>market.price[k]>0?market.price[k]:null;
function mkChg(k){const m=metaOf(k),p=mkPx(k);return m&&m.o24>0&&p?p/m.o24-1:null;}
const mkHeld=k=>{const out=[];if(S)S.agents.forEach(a=>a.positions.forEach(p=>{if(p.sym===k)out.push({a,p});}));return out;};
const mkSrc=k=>SRCNAME[srcOf(k)]||srcOf(k);
const mkHM=t=>new Date(t).toLocaleString('es-ES',{weekday:'short',hour:'2-digit',minute:'2-digit'});
const mkDur=m=>m>=60?Math.floor(m/60)+' h'+(m%60?' '+(m%60)+' min':''):m+' min';
function mkSessTxt(cls){
  const now=Date.now(),o=sessOpen(cls,now);if(!SESS[cls]||!SESS[cls].f)return {o:true,t:'abierto 24 h'};
  if(o){const mc=minsToClose(cls);return {o,t:isFinite(mc)?'cierra en '+mkDur(mc):'abierta'};}
  const no=nextOpen(cls);return {o,t:no?'abre '+mkHM(no):'cerrada'};
}
const mkPct=v=>v==null?'—':pct(v);
const mkCls=v=>v==null?'':v>=0?'up':'down';

/* ---------- lista ---------- */
function mkKeys(){
  const all=[...new Set([...(market.universe||[]),...(S?S.agents.flatMap(a=>a.positions.map(p=>p.sym)):[])])];
  return all.filter(k=>metaOf(k)||mkPx(k));
}
function renderMkt(){
  if(!S)return;
  const keys=mkKeys(),now=Date.now();
  if(!keys.length){$('mkSess').innerHTML='';$('mkMov').innerHTML='';$('mkCats').innerHTML='';$('mkList').innerHTML='<div class="empty">Cargando mercados…</div>';return;}
  /* horario por región */
  const by={};keys.forEach(k=>{const c=sessOf(k);by[c]=(by[c]||0)+1;});
  $('mkSess').innerHTML=Object.keys(SESS).filter(c=>by[c]).map(c=>{const s=mkSessTxt(c);
    return `<div class="mks1"><span class="dot ${s.o?'on':''}"></span><span class="mksn">${esc(SESS[c].name)}<small>${by[c]} activos</small></span><span class="note">${esc(s.t)}</span></div>`;}).join('');
  /* mayores movimientos en 24 h */
  const ch=keys.map(k=>[k,mkChg(k)]).filter(x=>x[1]!=null);
  const ups=ch.filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,4),dns=ch.filter(x=>x[1]<0).sort((a,b)=>a[1]-b[1]).slice(0,4);
  const mv=x=>`<button type="button" class="mv" data-chart="${esc(x[0])}"><b>${esc(ubase(x[0]))}</b><span class="${mkCls(x[1])}">${pct(x[1])}</span></button>`;
  $('mkMov').innerHTML=ch.length?`<div class="mvc"><div class="lbl">Suben</div>${ups.map(mv).join('')||'<span class="note">—</span>'}</div><div class="mvc"><div class="lbl">Bajan</div>${dns.map(mv).join('')||'<span class="note">—</span>'}</div>`:'<div class="note">Aún sin datos de 24 h.</div>';
  /* categorías */
  const cnt={Todos:keys.length,'En cartera':keys.filter(k=>mkHeld(k).length).length};keys.forEach(k=>{const c=catOf(k);cnt[c]=(cnt[c]||0)+1;});
  if(!cnt[MK.cat])MK.cat='Todos';
  $('mkCats').innerHTML=MK_CATS.filter(c=>cnt[c]).map(c=>`<button type="button" class="mk mkc" data-mcat="${esc(c)}" aria-pressed="${MK.cat===c}">${esc(c)} <b>${cnt[c]}</b></button>`).join('');
  mkList(keys);
}
function mkList(keys){
  keys=keys||mkKeys();
  const q=MK.q.trim().toLowerCase(),score={};(ui.radar||[]).forEach(r=>{score[r.sym]=r;});
  let ks=keys.filter(k=>MK.cat==='Todos'||(MK.cat==='En cartera'?mkHeld(k).length:catOf(k)===MK.cat));
  if(q)ks=ks.filter(k=>(base(k)+' '+(mkName(k)||'')+' '+catOf(k)).toLowerCase().includes(q));
  const vol=k=>(metaOf(k)||{}).vol||0,c=k=>mkChg(k);
  ks.sort(MK.sort==='up'?(a,b)=>(c(b)??-9)-(c(a)??-9):MK.sort==='down'?(a,b)=>(c(a)??9)-(c(b)??9):MK.sort==='az'?(a,b)=>String(ubase(a)).localeCompare(String(ubase(b))):(a,b)=>vol(b)-vol(a));
  const rows=ks.slice(0,200).map(k=>{
    const p=mkPx(k),v=mkChg(k),o=isOpen(k),h=mkHeld(k),nm=mkName(k),r=score[k];
    return `<button type="button" class="mrow" data-chart="${esc(k)}"><span class="mn">${esc(ubase(k))}${h.length?' <span class="side '+(isShort(h[0].p)?'s':'l')+'">en cartera</span>':''}<small><span class="dot ${o?'on':''}"></span>${esc(nm?nm+' · ':'')}${esc(catOf(k))} · ${esc(mkSrc(k))}${r?' · agente '+r.score:''}</small></span><span class="mp">${p?px(p):'—'}</span><span class="mc ${mkCls(v)}">${mkPct(v)}</span></button>`;
  }).join('');
  const html=rows||'<div class="empty">Nada coincide con la búsqueda.</div>';
  if(html!==MK.html){MK.html=html;$('mkList').innerHTML=html;}
  $('mkInfo').textContent=ks.length>200?`Mostrando 200 de ${ks.length}. Usa la búsqueda para encontrar el resto.`:`${ks.length} activos · precios en directo · cambio en 24 h`;
}

/* ---------- velas ---------- */
async function mkFetch(k,tf,force){
  const key=k+'|'+tf,ms=MK_TF[tf],c=MK.cache[key];
  if(MK.busy[key])return;
  if(!force&&c&&Date.now()-c.at<Math.min(60000,Math.max(15000,ms/4)))return;
  MK.busy[key]=1;
  try{
    const now=Date.now(),id=idOf(k),s=srcOf(k),lim=300;let arr;
    if(s==='BN'){const r=await jget(`/api/v3/klines?symbol=${id}&interval=${tf}&limit=${lim}`);arr=r.map(x=>({t:x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5],ct:x[6]}));}
    else if(s==='BF'){const r=await fget(`${FAPI}/fapi/v1/klines?symbol=${id}&interval=${tf}&limit=${lim}`);arr=r.map(x=>({t:x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5],ct:x[6]}));}
    else{const r=await hl({type:'candleSnapshot',req:{coin:id,interval:tf,startTime:now-lim*ms,endTime:now}});arr=(r||[]).map(x=>({t:x.t,o:+x.o,h:+x.h,l:+x.l,c:+x.c,v:+x.v,ct:x.T}));}
    arr=arr.filter(x=>x.o>0&&x.h>0&&x.l>0&&x.c>0).sort((a,b)=>a.t-b.t).slice(-lim);
    MK.cache[key]={at:Date.now(),c:arr};MK.err[key]=null;
  }catch(e){MK.err[key]=why(e);}
  finally{MK.busy[key]=0;}
  if(MK.open===k&&MK.tf===tf)mkDetail(true);
}
/* la última vela se mueve con el precio en directo */
function mkLiveMerge(k,tf){
  const c=MK.cache[k+'|'+tf],p=mkPx(k);if(!c||!c.c.length||!p)return false;
  const ms=MK_TF[tf],last=c.c[c.c.length-1],now=Date.now();
  if(now<last.t+ms){if(last.c===p)return false;last.c=p;if(p>last.h)last.h=p;if(p<last.l)last.l=p;return true;}
  if(srcOf(k)!=='BN'&&!isOpen(k))return false;
  const t=last.t+Math.floor((now-last.t)/ms)*ms;c.c.push({t,o:last.c,h:Math.max(p,last.c),l:Math.min(p,last.c),c:p,v:0,ct:t+ms-1});if(c.c.length>300)c.c.shift();return true;
}

/* ---------- análisis con las reglas del agente ---------- */
function mkAnalyze(k,cs){
  const P=(S.agents[0]||{}).params||DEF_PARAMS,now=Date.now();
  const kk=cs.filter(x=>x.ct<now);if(kk.length<60)return null;
  const c=kk.map(x=>x.c),n=c.length-1,ef=ema(c,P.emaF),es=ema(c,P.emaS),r=rsi(c),a=atr(kk),price=mkPx(k)||c[n];
  const win=kk.slice(n-20,n),hi=Math.max(...win.map(x=>x.h)),lo=Math.min(...win.map(x=>x.l)),vavg=win.reduce((t,x)=>t+x.v,0)/20;
  const L={trend:ef[n]>es[n]&&c[n]>es[n],slope:es[n]>es[n-3],rsiOk:r>=P.rsiMin&&r<=P.rsiMax,rsiSweet:r>=50&&r<=65,brk:c[n]>hi,vol:vavg>0&&kk[n].v>1.3*vavg};
  const Sh={trend:ef[n]<es[n]&&c[n]<es[n],slope:es[n]<es[n-3],rsiOk:r<=100-P.rsiMin&&r>=100-P.rsiMax,rsiSweet:r<=50&&r>=35,brk:c[n]<lo,vol:L.vol};
  const sc=o=>(o.trend?30:0)+(o.slope?10:0)+(o.rsiOk?20:0)+(o.rsiSweet?5:0)+(o.brk?(P.wBrk??25):0)+(o.vol?(P.wVol??10):0);
  return {P,price,rsi:r,atr:a,atrPct:a/price,ef:ef[n],es:es[n],hi,lo,L,Sh,ls:sc(L),ss:sc(Sh)};
}
function mkVerdict(k,an){
  const P=an.P,sh=S.settings.shorts&&srcOf(k)!=='BN',open=isOpen(k),ex=typeof xp==='function'?xp(k):{adj:0,veto:false};
  const best=an.ls>=an.ss||!sh?'long':'short',s=best==='long'?an.ls:an.ss,f=best==='long'?an.L:an.Sh;
  let t,cls='';
  if(ex.veto){t='Vetado por experiencia: a este agente le ha ido mal con este activo y no entra aunque haya señal.';cls='down';}
  else if(s+ex.adj>=P.minScore&&f.trend){t=(best==='long'?'Señal alcista':'Señal bajista (para cortos)')+`: supera la puntuación mínima del agente (${P.minScore}). Entraría si además cubre comisiones, el riesgo cabe y el mercado está abierto.`;cls=best==='long'?'up':'down';}
  else if(an.L.trend){t='Tendencia alcista, pero sin fuerza suficiente para que el agente entre todavía'+(an.rsi>P.rsiMax?' (RSI sobrecomprado).':an.rsi<P.rsiMin?' (RSI flojo).':!an.L.brk?' (falta romper el máximo de las últimas 20 velas).':'.');}
  else if(an.Sh.trend){t=sh?'Tendencia bajista, aún sin fuerza para abrir un corto.':'Tendencia bajista: el agente no compra aquí'+(srcOf(k)==='BN'?' (en Binance contado no se abren cortos).':' (los cortos están desactivados).');}
  else t='Sin tendencia clara: las medias se cruzan y el agente esperaría.';
  if(!open)t+=' Ahora su mercado está cerrado, así que no opera.';
  return {t,cls,best,s:Math.max(0,Math.min(100,s+ex.adj)),adj:ex.adj,e:ex.e};
}

/* ---------- gráfico ---------- */
function mkColors(){const cs=getComputedStyle(document.documentElement),g=v=>cs.getPropertyValue(v).trim();return {fg:g('--fg'),mute:g('--mute'),line:g('--line'),up:g('--up'),down:g('--down'),info:g('--info'),money:g('--money'),panel:g('--panel')};}
function mkCanvas(cv){const r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1,w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}const x=cv.getContext('2d');x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,r.width,r.height);return {x,W:r.width,H:r.height};}
const mkFmtT=(t,tf)=>new Date(t).toLocaleString('es-ES',tf==='1d'?{day:'2-digit',month:'short'}:tf==='4h'||tf==='1h'?{day:'2-digit',month:'2-digit',hour:'2-digit'}:{hour:'2-digit',minute:'2-digit'});
function mkDraw(){
  const k=MK.open,cv=$('mkC'),rv=$('mkR');if(!k||!cv)return;
  const c=MK.cache[k+'|'+MK.tf],C=mkColors();
  const {x,W,H}=mkCanvas(cv),R=mkCanvas(rv);
  if(!c||!c.c.length){x.fillStyle=C.mute;x.font='13px system-ui';x.textAlign='center';const e=MK.err[k+'|'+MK.tf];x.fillText(e?'No se pudieron cargar las velas: '+e:'Cargando velas…',W/2,H/2);return;}
  const all=c.c,P=(S.agents[0]||{}).params||DEF_PARAMS,cl=all.map(v=>v.c),ef=ema(cl,P.emaF),es=ema(cl,P.emaS);
  const n=Math.max(20,Math.min(all.length,MK.zoom)),off=all.length-n,cs=all.slice(off);
  const padR=58,padB=18,cw=W-padR,vh=(H-padB)*.18,ph=H-padB-vh-6;
  const held=mkHeld(k),lv=[];held.forEach(({p})=>{lv.push([p.entry,C.fg,'entrada']);if(p.stop)lv.push([p.stop,C.down,'stop']);if(p.tp)lv.push([p.tp,C.up,'objetivo']);});
  let hi=-Infinity,lo=Infinity;cs.forEach(v=>{if(v.h>hi)hi=v.h;if(v.l<lo)lo=v.l;});
  for(let i=off;i<all.length;i++){hi=Math.max(hi,ef[i],es[i]);lo=Math.min(lo,ef[i],es[i]);}
  lv.forEach(([v])=>{if(v>lo-(hi-lo)*.6&&v<hi+(hi-lo)*.6){hi=Math.max(hi,v);lo=Math.min(lo,v);}});
  const pad=(hi-lo||hi*.01)*.06;hi+=pad;lo-=pad;
  const Y=v=>6+(hi-v)/(hi-lo)*(ph-6),step=cw/n,X=i=>(i+.5)*step,bw=Math.max(1,Math.min(14,step*.68));
  /* rejilla y escala de precios */
  x.strokeStyle=C.line;x.lineWidth=1;x.fillStyle=C.mute;x.font='10px "IBM Plex Mono",monospace';x.textAlign='left';x.textBaseline='middle';
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,y=Y(v);x.beginPath();x.moveTo(0,y);x.lineTo(cw,y);x.stroke();x.fillText(px(v),cw+4,y);}
  /* volumen */
  const vmax=Math.max(...cs.map(v=>v.v))||1,vb=ph+6+vh;
  cs.forEach((v,i)=>{x.fillStyle=(v.c>=v.o?C.up:C.down)+'55';const h=v.v/vmax*vh;x.fillRect(X(i)-bw/2,vb-h,bw,h);});
  /* velas */
  cs.forEach((v,i)=>{const col=v.c>=v.o?C.up:C.down,xx=X(i);x.strokeStyle=col;x.fillStyle=col;x.beginPath();x.moveTo(xx,Y(v.h));x.lineTo(xx,Y(v.l));x.stroke();
    const y1=Y(Math.max(v.o,v.c)),y2=Y(Math.min(v.o,v.c));x.fillRect(xx-bw/2,y1,bw,Math.max(1,y2-y1));});
  /* medias del agente */
  [[ef,C.info],[es,C.money]].forEach(([e,col])=>{x.strokeStyle=col;x.lineWidth=1.4;x.beginPath();for(let i=0;i<n;i++){const y=Y(e[off+i]);i?x.lineTo(X(i),y):x.moveTo(X(i),y);}x.stroke();});
  x.lineWidth=1;
  /* entrada, stop y objetivo de las posiciones abiertas */
  x.setLineDash([4,4]);lv.forEach(([v,col,l])=>{const y=Y(v);if(y<0||y>ph)return;x.strokeStyle=col;x.beginPath();x.moveTo(0,y);x.lineTo(cw,y);x.stroke();x.fillStyle=col;x.textAlign='left';x.fillText(l,4,y-7);});x.setLineDash([]);
  /* último precio */
  const last=cs[cs.length-1],ly=Y(last.c),lc=last.c>=last.o?C.up:C.down;
  x.strokeStyle=lc;x.setLineDash([2,3]);x.beginPath();x.moveTo(0,ly);x.lineTo(cw,ly);x.stroke();x.setLineDash([]);
  x.fillStyle=lc;x.fillRect(cw,ly-8,padR,16);x.fillStyle='#fff';x.textAlign='left';x.fillText(px(last.c),cw+4,ly);
  /* fechas */
  x.fillStyle=C.mute;x.textAlign='center';x.textBaseline='alphabetic';for(let j=0;j<4;j++){const i=Math.round((n-1)*(j+.5)/4);x.fillText(mkFmtT(cs[i].t,MK.tf),X(i),H-4);}
  /* RSI */
  const rr=[];for(let i=off;i<all.length;i++)rr.push(i>=15?rsi(cl.slice(Math.max(0,i-200),i+1)):null);
  const ry=v=>4+(100-v)/100*(R.H-8),rx=R.x;
  rx.fillStyle=C.mute;rx.font='10px "IBM Plex Mono",monospace';rx.textBaseline='middle';rx.textAlign='left';
  rx.fillStyle=C.info+'14';rx.fillRect(0,ry(70),cw,ry(30)-ry(70));
  rx.strokeStyle=C.line;[30,70].forEach(v=>{rx.beginPath();rx.moveTo(0,ry(v));rx.lineTo(cw,ry(v));rx.stroke();rx.fillStyle=C.mute;rx.fillText(v,cw+4,ry(v));});
  rx.strokeStyle=C.info;rx.lineWidth=1.4;rx.beginPath();let st=false;rr.forEach((v,i)=>{if(v==null)return;st?rx.lineTo(X(i),ry(v)):rx.moveTo(X(i),ry(v));st=true;});rx.stroke();
  const rl=rr[rr.length-1];if(rl!=null){rx.fillStyle=C.fg;rx.fillText('RSI '+rl.toFixed(0),4,10);}
  /* cruz al tocar */
  if(MK.cross!=null){const i=Math.max(0,Math.min(n-1,Math.floor(MK.cross/step))),v=cs[i];
    x.strokeStyle=C.mute;x.setLineDash([3,3]);x.beginPath();x.moveTo(X(i),0);x.lineTo(X(i),H-padB);x.stroke();x.setLineDash([]);
    rx.strokeStyle=C.mute;rx.beginPath();rx.moveTo(X(i),0);rx.lineTo(X(i),R.H);rx.stroke();
    const ch=v.c/v.o-1;$('mkRd').innerHTML=`<span>${new Date(v.t).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span> A <b>${px(v.o)}</b> M <b>${px(v.h)}</b> m <b>${px(v.l)}</b> C <b class="${mkCls(ch)}">${px(v.c)}</b> <span class="${mkCls(ch)}">${pct(ch)}</span>${rr[i]!=null?' · RSI '+rr[i].toFixed(0):''}`;}
  else $('mkRd').innerHTML=`<span style="color:var(--info)">━ EMA ${P.emaF}</span> <span style="color:var(--money)">━ EMA ${P.emaS}</span> <span>· toca el gráfico para ver cada vela</span>`;
}

/* ---------- ficha de un activo ---------- */
function mkOpen(k){
  if(!k)return;const was=!!MK.open;MK.open=k;MK.cross=null;
  const sh=$('mkSheet');sh.hidden=false;sh.scrollTop=0;document.body.classList.add('mkopen');
  if(!was)try{history.pushState({mk:1},'');}catch(e){}
  mkDetail();mkFetch(k,MK.tf);
  clearInterval(MK.live);MK.live=setInterval(()=>{if(!MK.open)return;if(mkLiveMerge(MK.open,MK.tf))mkDetail(true);else mkHead();mkFetch(MK.open,MK.tf);},2000);
}
function mkClose(fromPop){if(!MK.open)return;MK.open=null;clearInterval(MK.live);$('mkSheet').hidden=true;document.body.classList.remove('mkopen');if(!fromPop)try{history.back();}catch(e){}}
function mkHead(){
  const k=MK.open;if(!k)return;const p=mkPx(k),v=mkChg(k),s=mkSessTxt(sessOf(k)),m=metaOf(k)||{};
  $('mkTitle').innerHTML=`${esc(ubase(k))}<small>${esc(mkName(k)||catOf(k))}</small>`;
  $('mkPrice').innerHTML=`<span class="big mono">${p?px(p):'—'}</span><span class="pnl ${mkCls(v)}">${mkPct(v)} <small class="note">24 h</small></span>`;
  $('mkMeta').innerHTML=`<span class="mk"><span class="dot ${s.o?'on':''}" style="display:inline-block;margin-right:5px"></span>${esc(SESS[sessOf(k)]?SESS[sessOf(k)].name:'')} · ${esc(s.t)}</span><span class="mk">${esc(catOf(k))}</span><span class="mk">${esc(mkSrc(k))}</span>${m.vol?`<span class="mk">Vol. 24 h <b>$${(m.vol/1e6).toLocaleString('es-ES',{maximumFractionDigits:m.vol<1e7?2:0})} M</b></span>`:''}`;
}
function mkDetail(soft){
  const k=MK.open;if(!k)return;mkHead();
  if(!soft){
    $('mkTf').innerHTML=Object.keys(MK_TF).map(t=>`<button type="button" class="btn" data-mtf="${t}" aria-pressed="${t===MK.tf}">${MK_TFL[t]}</button>`).join('');
  }
  mkDraw();
  const c=MK.cache[k+'|'+MK.tf],an=c?mkAnalyze(k,c.c):null;
  if(!an)$('mkAn').innerHTML=`<div class="note">${c?'Hacen falta al menos 60 velas cerradas para analizarlo con las reglas del agente.':'Cargando…'}</div>`;
  else{
    const vd=mkVerdict(k,an),sh=S.settings.shorts&&srcOf(k)!=='BN',P=an.P;
    const f=(ok,t)=>`<li class="${ok?'ok':''}"><span>${ok?'✓':'·'}</span><span>${t}</span></li>`,o=vd.best==='long'?an.L:an.Sh,al=vd.best==='long';
    $('mkAn').innerHTML=`<div class="anh"><div><div class="lbl">Puntuación del agente · ${al?'al alza':'a la baja'}</div><div class="ansc ${vd.s>=P.minScore?(al?'up':'down'):''}">${vd.s}<small>/100 · entra desde ${P.minScore}</small></div></div>
      <div class="anb"><div class="lbl">Alza ${an.ls}${sh?' · Baja '+an.ss:''}</div><div class="meter ${an.ls>=P.minScore?'hot':''}"><i style="width:${an.ls}%"></i></div>${sh?`<div class="meter" style="margin-top:4px"><i style="width:${an.ss}%;background:var(--down)"></i></div>`:''}</div></div>
      <div class="lbl" style="margin-top:10px">Factores detectados (velas de ${MK_TFN[MK.tf]})</div>
      <ul class="fac">${f(o.trend,al?`Tendencia alcista: EMA ${P.emaF} por encima de EMA ${P.emaS} <b>+30</b>`:`Tendencia bajista: EMA ${P.emaF} por debajo de EMA ${P.emaS} <b>+30</b>`)}
      ${f(o.slope,`Media lenta ${al?'subiendo':'bajando'} <b>+10</b>`)}
      ${f(o.rsiOk,`RSI ${an.rsi.toFixed(0)} dentro de la zona del agente (${al?P.rsiMin+'–'+P.rsiMax:(100-P.rsiMax)+'–'+(100-P.rsiMin)}) <b>+20</b>`)}
      ${f(o.rsiSweet,`RSI en la zona ideal (${al?'50–65':'35–50'}) <b>+5</b>`)}
      ${f(o.brk,`${al?'Rompe el máximo':'Pierde el mínimo'} de las últimas 20 velas (${px(al?an.hi:an.lo)}) <b>+${P.wBrk??25}</b>`)}
      ${f(o.vol,`Volumen un 30 % por encima de la media <b>+${P.wVol??10}</b>`)}
      ${vd.adj?f(vd.adj>0,`Experiencia con este activo <b>${vd.adj>0?'+':''}${vd.adj}</b>`):''}</ul>
      <div class="dkv"><span>Volatilidad (ATR)</span><b>${(an.atrPct*100).toFixed(2)} % · ${px(an.atr)}</b><span>Stop y objetivo típicos</span><b>${px(an.price-(al?1:-1)*an.atr*P.stopATR)} · ${px(an.price+(al?1:-1)*an.atr*P.tpATR)}</b></div>
      <p class="interp ${vd.cls}"><b>Interpretación.</b> ${esc(vd.t)}</p>
      <p class="note" style="margin:6px 0 0">Son las mismas reglas con las que decide el agente, aplicadas a estas velas. Resumen técnico, no una predicción.</p>`;
  }
  /* el agente con este activo */
  const held=mkHeld(k),closed=S.agents.flatMap(a=>a.closed.filter(t=>t.sym===k).map(t=>Object.assign({an:a.name},t))).sort((a,b)=>b.t1-a.t1).slice(0,6),e=S.exp&&S.exp[k];
  const p0=mkPx(k);
  $('mkMine').innerHTML=(held.length?held.map(({a,p})=>{const pr=p0||p.entry,pl=(isShort(p)?p.entry-pr:pr-p.entry)*p.qty;
      return `<div class="dp"><div class="h"><span><span class="side ${isShort(p)?'s':'l'}">${isShort(p)?'corto':'largo'}</span> ${esc(a.name)} · velas ${esc(p.tf||S.settings.tf)}</span><span class="${mkCls(pl)}">${sgn(pl)}</span></div>
      <div class="dkv"><span>Entrada</span><b>${px(p.entry)}</b><span>Ahora</span><b>${px(pr)}</b><span>Stop</span><b>${p.stop?px(p.stop):'—'}</b><span>Objetivo</span><b>${p.tp?px(p.tp):'—'}</b><span>Cantidad</span><b>${+p.qty.toPrecision(6)}</b><span>Abierta</span><b>${clock(p.openedAt)}</b></div></div>`;}).join(''):'<div class="note">El agente no tiene posición abierta en este activo.</div>')
    +(e&&e.n?`<div class="lbl" style="margin-top:10px">Experiencia acumulada</div><div class="dkv"><span>Operaciones</span><b>${e.n}</b><span>Aciertos</span><b>${Math.round(e.w/e.n*100)} %</b><span>Resultado</span><b class="${mkCls(e.pnl)}">${sgn(e.pnl)}</b><span>Media</span><b class="${mkCls(e.sumPct)}">${pct(e.sumPct/e.n)}</b></div>`:'')
    +(closed.length?`<div class="lbl" style="margin-top:10px">Últimas operaciones aquí</div><div class="tw"><table><tr><th>Cierre</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>Resultado</th></tr>${closed.map(t=>`<tr><td>${clock(t.t1)}</td><td>${t.side==='short'?'corto':'largo'}</td><td>${px(t.entry)}</td><td>${px(t.exit)}</td><td class="${mkCls(t.pnl)}">${sgn(t.pnl)}</td></tr>`).join('')}</table></div>`:'');
}

/* ---------- eventos ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest&&e.target.closest('[data-chart]');
  if(t){e.preventDefault();mkOpen(t.dataset.chart);return;}
  const c=e.target.closest&&e.target.closest('[data-mcat]');if(c){MK.cat=c.dataset.mcat;mkSave();MK.html='';renderMkt();return;}
  const f=e.target.closest&&e.target.closest('[data-mtf]');if(f){MK.tf=f.dataset.mtf;mkSave();MK.cross=null;mkDetail();mkFetch(MK.open,MK.tf);return;}
});
$('mkQ').addEventListener('input',e=>{MK.q=e.target.value;mkList();});
$('mkSort').value=MK.sort;$('mkSort').addEventListener('change',e=>{MK.sort=e.target.value;mkSave();mkList();});
$('mkBack').addEventListener('click',()=>mkClose(false));
window.addEventListener('popstate',()=>{if(MK.open)mkClose(true);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&MK.open)mkClose(false);});
$('mkZin').addEventListener('click',()=>{MK.zoom=Math.max(30,Math.round(MK.zoom/1.5));mkSave();mkDraw();});
$('mkZout').addEventListener('click',()=>{MK.zoom=Math.min(300,Math.round(MK.zoom*1.5));mkSave();mkDraw();});
['mkC','mkR'].forEach(id=>{const cv=$(id);
  const mv=ev=>{const r=cv.getBoundingClientRect(),xx=ev.clientX-r.left;MK.cross=xx>=0&&xx<=r.width-58?xx:null;mkDraw();};
  cv.addEventListener('pointerdown',mv);cv.addEventListener('pointermove',mv);
  cv.addEventListener('pointerleave',ev=>{if(ev.pointerType==='mouse'){MK.cross=null;mkDraw();}});});
window.addEventListener('resize',()=>{if(MK.open)mkDraw();});
