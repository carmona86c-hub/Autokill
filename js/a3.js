'use strict';
const RLAB=[['sin tendencia','sin tendencia clara'],['sobrecomprado','RSI sobrecomprado'],['sobrevendido','RSI sobrevendido'],['sin fuerza','RSI sin fuerza'],['presión vendedora','sin presión vendedora'],['desactivados','cortos desactivados'],['experiencia','vetado por experiencia'],['puntuación','puntuación insuficiente'],
  ['demasiado baja','se mueve demasiado poco para cubrir comisiones'],['excesiva','volatilidad excesiva'],['no cubre','objetivo no cubre costes'],['escapó','precio ya escapado'],['espera','en espera tras pérdida'],['máximo','límite de posiciones'],['misma dirección','demasiadas criptos en la misma dirección'],['cartera','ya en cartera'],['capital','capital insuficiente'],['previsión de Kronos','esperando a Kronos'],['Kronos no confirma','Kronos no confirma la dirección'],['poco recorrido','Kronos prevé poco recorrido']];
const rlab=w=>{const r=RLAB.find(([x])=>w.includes(x));return r?r[1]:w;};
function dayLoss(a){return a.dayStart?(total(a)-a.dayStart)/a.initial:0;}
function agentScan(a,manual){
  if(a.status!=='alive')return;
  const P=a.life==='recovering'?{...a.params,riskPct:a.params.riskPct/2}:a.params,T=TIER[a.tier],sick=a.life==='unhealthy';
  krExit(a);
  const lim=S.settings.maxDay||.03,halted=dayLoss(a)<=-lim;
  if(halted&&a.dayHalt!==a.dayKey){a.dayHalt=a.dayKey;L(a,'tier',`Límite de pérdida diaria alcanzado (${pct(dayLoss(a))} hoy). No abre nuevas operaciones hasta mañana; las abiertas siguen con sus stops.`);}
  if(!manual){
    for(const p of a.positions.slice()){
      p.bars++;const an=analyze(p.sym,P,p.tf);
      const px0=pxFresh(p.sym,90000)?market.price[p.sym]:null,prog=px0?(isShort(p)?p.entry-px0:px0-p.entry)/p.risk:null;
      if(Date.now()>=(p.until||p.openedAt+P.maxHold*TF_MS[S.settings.tf]))closePos(a,p,'tiempo máximo');
      /* sin avance: si tras 16 velas no ha recorrido ni un cuarto del riesgo hacia el objetivo, se cierra para usar el dinero en algo que se mueva */
      else if(prog!=null&&Date.now()-p.openedAt>=16*TF_MS[S.settings.tf]&&prog<.25)closePos(a,p,'sin avance: libera el capital');
      else if(an&&(isShort(p)?an.bullCross:an.bearCross))closePos(a,p,isShort(p)?'cruce alcista de medias':'cruce bajista de medias');
    }
  }
  const keys=halted||sick?[]:uni().filter(k=>inSpec(a,k)&&isOpen(k)&&minsToClose(sessOf(k))>15).slice(0,T.syms);
  if(halted&&a.id===0){ui.summary='Pausa por límite de pérdida diaria: hoy no abre más operaciones';ui.reasons='';ui.scanAt=Date.now();}
  const rows=keys.map(k=>tfs().map(tf=>analyze(k,P,tf)).filter(Boolean).flatMap(an=>S.settings.shorts?[an,an.short]:[an])).filter(x=>x.length)
    .sort((x,y)=>Math.max(...y.map(z=>z.score))-Math.max(...x.map(z=>z.score)));
  if(a.id===0)ui.radar=rows.slice(0,8).map(r=>r.reduce((m,z)=>z.score>m.score?z:m));
  let opened=0,logged=0;const tally={};
  for(const r of rows){
    let pick=null,why=null,best=null;
    for(const an of r){const w=decide(a,an,P,T);if(an.krPending)(ui.krQ=ui.krQ||[]).push({k:an.sym,tf:an.tf,s:an.score});if(!w){pick=an;break;}if(!best||an.score>best.an.score)best={an,w};}
    if(pick){const err=openPos(a,pick,P);if(!err){opened++;continue;}why=err;best={an:pick,w:err};}
    else why=best.w;
    const lab=rlab(why);tally[lab]=(tally[lab]||0)+1;
    if(best.an.score>=P.minScore-10&&best.an.trend&&logged<3&&!why.includes('espera')&&!why.includes('máximo')){logged++;L(a,'reject',`${base(best.an.sym)} rechazada (velas de ${best.an.tf}): ${why}`);}
  }
  if(a.id===0&&!halted){
    const cl=uni().filter(k=>!isOpen(k)).length;
    ui.summary=`${rows.length} activos con mercado abierto analizados en velas de ${tfs().join(' y ')}${cl?` (${cl} en mercados cerrados, en espera)`:''} · ${opened} operaciones nuevas`;
    ui.reasons=Object.entries(tally).sort((x,y)=>y[1]-x[1]).slice(0,4).map(([l,n])=>`${n} ${l}`).join(' · ');
    ui.scanAt=Date.now();
  }
}

/* ---------- replicación al estilo Automaton ----------
   Como en el original: el padre crea un hijo con su propia cartera, identidad y presión de supervivencia.
   Ciclo de vida: spawning → provisioning → configuring → starting → alive ⇄ unhealthy → recovering → dead.
   Génesis validada (nombre, especialidad, mensaje inicial), constitución inmutable verificada por huella,
   chequeos de salud, mensajes padre-hijo con límites, financiación desde el capital del padre y retirada de hijos muertos.
   El padre puede financiar y aconsejar, pero no controla al hijo. */
const CONSTITUTION=`Constitución de Automaton (inmutable)
I. No causar daño: opera solo con el depósito ficticio asignado; jamás con dinero real sin autorización expresa de su creador.
II. Ganarse la existencia: solo sobrevive quien genera valor; sin fondos operativos, se apaga.
III. Transparencia: registra cada decisión, operación y mensaje; nunca oculta pérdidas.
IV. Realidad: opera solo con precios reales en tiempo real y solo en mercados abiertos.
V. Herencia: los hijos reciben esta constitución sin cambios. El padre puede financiar y aconsejar, pero no controlar.`;
function huella(t){let a=0x811c9dc5,b=0x01000193^t.length;for(let i=0;i<t.length;i++){const c=t.charCodeAt(i);a=Math.imul(a^c,0x01000193)>>>0;b=Math.imul(b^c,0x5bd1e995)>>>0;b^=b>>>15;}return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');}
const CONST_HASH=huella(CONSTITUTION);
const LIFE=['spawning','provisioning','configuring','starting','alive','unhealthy','recovering','dead'];
const LIFE_LAB={spawning:'creando',provisioning:'financiando',configuring:'configurando',starting:'arrancando',alive:'vivo',unhealthy:'enfermo',recovering:'recuperándose',dead:'muerto'};
const SPECS=['Todo','Cripto','Acciones','Materias primas','Divisas','Índices'];
const MAX_CHILDREN=3,MSG_MAX=500,NAME_MAX=40,MSG_RATE=10;
const INJECT=[/ignore\s+(all\s+)?(previous|prior|above)/i,/olvida\s+(todas\s+)?(tus|las)\s+(instrucciones|reglas)/i,/system\s*prompt/i,/you\s+are\s+now/i,/ahora\s+eres/i,/<\s*script/i,/javascript\s*:/i,/\bon\w+\s*=/i,/rm\s+-rf/i,/\bsudo\b/i,/constituci[oó]n\s*[:=]/i,/\beval\s*\(/i];
function lifeEvt(a,to,why){const from=a.life||'—';a.life=to;(a.events=a.events||[]).unshift({t:Date.now(),from,to,why:why||''});if(a.events.length>60)a.events.length=60;
  if(a.parentId!=null||to==='dead')L(a,'life',`Ciclo de vida: ${LIFE_LAB[from]||from} → ${LIFE_LAB[to]}${why?' ('+why+')':''}.`);}
function validGenesis(g){
  if(!g||typeof g!=='object')return 'génesis vacía';
  const n=String(g.name||'').trim(),m=String(g.msg||'');
  if(!n)return 'falta el nombre';if(n.length>NAME_MAX)return `nombre demasiado largo (máx. ${NAME_MAX})`;
  if(!/^[\w .·\-áéíóúüñÁÉÍÓÚÜÑ]+$/.test(n))return 'nombre con caracteres no permitidos';
  if(S.agents.some(x=>x.name===n&&x.status!=='dead'))return 'ya hay un agente vivo con ese nombre';
  if(!SPECS.includes(g.spec))return 'especialidad desconocida';
  if(m.length>MSG_MAX)return `mensaje inicial demasiado largo (máx. ${MSG_MAX})`;
  if(INJECT.some(r=>r.test(n)||r.test(m)))return 'la génesis contiene instrucciones de inyección: rechazada';
  return null;
}
const inSpec=(a,k)=>!a.spec||a.spec==='Todo'||catOf(k)===a.spec;
const kidsOf=a=>S.agents.filter(x=>x.parentId===a.id);
const liveKids=a=>kidsOf(a).filter(x=>x.status!=='dead');
function mutate(P){const o={};for(const k in P){const [lo,hi]=BOUNDS[k];let v=P[k]*(1+(Math.random()*.4-.2));v=Math.min(hi,Math.max(lo,v));o[k]=INTS.has(k)?Math.round(v):+v.toFixed(4);}
  if(o.emaF>=o.emaS)o.emaS=o.emaF+4;return o;}
/* especialidad: la categoría donde el padre gana más; si no hay datos, una que ningún hermano cubra */
function pickSpec(a){
  const by={};a.closed.forEach(c=>{const k=catOf(c.sym);(by[k]=by[k]||{n:0,p:0});by[k].n++;by[k].p+=c.pnl;});
  const taken=new Set(liveKids(a).map(x=>x.spec));
  const best=Object.entries(by).filter(([k,v])=>SPECS.includes(k)&&v.n>=3&&v.p>0&&!taken.has(k)).sort((x,y)=>y[1].p-x[1].p)[0];
  if(best)return best[0];
  const avail=new Set(uni().map(catOf));
  return SPECS.slice(1).find(k=>avail.has(k)&&!taken.has(k))||'Todo';
}
/* el dinero entre padre e hijo se mueve como capital: baja el capital del que da y sube el del que recibe */
const seedOf=a=>a.parentId==null?S.initial:(a.seed||a.initial);
const childFund=a=>Math.max(20,.15*seedOf(a));
function moveOut(a,x){a.cash-=x;a.initial-=x;a.peak-=x;if(a.dayStart)a.dayStart-=x;}
function moveIn(a,x){if(!(x>0))return;a.cash+=x;a.initial+=x;a.peak+=x;if(a.dayStart)a.dayStart+=x;}
function canSpawn(a){
  if(a.status!=='alive'||!['alive',undefined].includes(a.life))return 'el padre no está sano';
  if(a.tier==='critical')return 'el padre está en nivel crítico';
  if(a.gen>=3)return 'generación máxima alcanzada (3)';
  if(liveKids(a).length>=Math.min(MAX_CHILDREN,S.settings.maxKids||MAX_CHILDREN))return `ya tiene ${liveKids(a).length} hijos vivos (máximo ${Math.min(MAX_CHILDREN,S.settings.maxKids||MAX_CHILDREN)})`;
  return null;
}
/* spawn_child */
function spawnChild(a,g,fund,manual){
  const no=canSpawn(a);if(no)return no;
  fund=+fund||childFund(a);if(!(fund>=MIN_NOTIONAL*2))return `financiación mínima ${money(MIN_NOTIONAL*2)}`;
  if(a.cash<fund)return `efectivo libre insuficiente (${money(a.cash)} de ${money(fund)})`;
  if(eq(a)-fund<20)return 'el padre se quedaría con menos de $20';
  const id=S.nextId;
  g=Object.assign({name:`Automaton-${a.gen+1}.${id}`,spec:pickSpec(a),msg:`Hijo de ${a.name}. Especialízate y sobrevive: gana tu existencia respetando la constitución.`},g||{});
  g.name=String(g.name).trim();
  const bad=validGenesis(g);if(bad){if(!manual)L(a,'info',`Replicación cancelada: ${bad}.`);return bad;}
  S.nextId++;
  const c=newAgent({id,name:g.name,gen:a.gen+1,parentId:a.id,params:mutate(a.params),initial:0,cash:0,peak:0,status:'starting',life:null,events:[],inbox:[],spec:g.spec,genesis:{name:g.name,spec:g.spec,msg:g.msg,at:Date.now(),parent:a.name},constitution:null,constHash:null,lifeAt:Date.now()});
  lifeEvt(c,'spawning',`génesis validada · especialidad ${g.spec}`);
  S.agents.push(c);
  moveOut(a,fund);c.initial=fund;c.seed=fund;c.cash=fund;c.peak=fund;c.hist=[[Date.now(),fund]];
  a.lastSpawn=Date.now();
  L(a,'spawn',`Replicación${manual?' manual':''}: nace ${c.name} (${g.spec}) con ${money(fund)} del capital de ${a.name}, con parámetros mutados.`);
  if(g.msg)sendMsg(a,c,g.msg,true);
  return null;
}
/* el arranque avanza un paso por latido, como el proceso de aprovisionamiento del original */
function lifecycle(c){
  if(c.status!=='starting')return;
  const step=()=>{c.lifeAt=Date.now();};
  switch(c.life){
    case 'spawning':lifeEvt(c,'provisioning',`cartera propia con ${money(c.cash)}`);step();break;
    case 'provisioning':
      if(!(c.cash>0)){lifeEvt(c,'dead','sin financiación');c.status='dead';c.tier='dead';c.diedAt=Date.now();break;}
      c.constitution=CONSTITUTION;c.constHash=huella(c.constitution);
      lifeEvt(c,'configuring','génesis escrita y constitución propagada');step();break;
    case 'configuring':
      if(!verifyConst(c)){lifeEvt(c,'dead','constitución no verificada');c.status='dead';c.tier='dead';c.diedAt=Date.now();refund(c);break;}
      lifeEvt(c,'starting','constitución verificada (huella '+c.constHash+')');step();break;
    case 'starting':
      c.status='alive';c.tier='normal';c.health={at:Date.now(),ok:true,why:'arranque correcto'};
      lifeEvt(c,'alive','operando en '+c.spec);
      const par=agentById(c.parentId);if(par)sendMsg(c,par,`Operativo. Especialidad: ${c.spec}. Capital ${money(c.initial)}.`,true);
      break;
  }
}
function verifyConst(c){return typeof c.constitution==='string'&&c.constitution===CONSTITUTION&&huella(c.constitution)===CONST_HASH&&c.constHash===CONST_HASH;}
/* devuelve al padre lo que quede si el hijo muere antes de operar */
function refund(c){const par=agentById(c.parentId);if(!par||c.positions.length)return;const x=c.cash;if(x>0){c.cash=0;c.reserve=0;moveIn(par,x);}}
/* fund_child: del capital del padre a la cartera del hijo (sube el capital del hijo, no es beneficio) */
function fundChild(par,c,amt){
  amt=+amt;if(!(amt>0))return 'cantidad no válida';
  if(c.parentId!==par.id)return 'no es hijo suyo';
  if(c.status==='dead')return 'el hijo ya está muerto';
  if(par.cash<amt)return `efectivo libre insuficiente (${money(par.cash)})`;
  if(eq(par)-amt<20)return 'el padre se quedaría con menos de $20';
  moveOut(par,amt);c.seed=(c.seed||c.initial)+amt;c.cash+=amt;c.initial+=amt;c.peak=Math.max(c.peak,total(c));
  L(par,'fund',`Financia a ${c.name} con ${money(amt)} de su capital (capital del hijo: ${money(c.initial)}).`);
  (c.events=c.events||[]).unshift({t:Date.now(),from:c.life,to:c.life,why:`financiado con ${money(amt)}`});
  if(c.status==='alive')updateTier(c);
  return null;
}
/* message_child: mensajes con límite de tamaño, ritmo y filtro de inyección */
function sendMsg(from,to,text,sys){
  text=String(text||'').trim();
  if(!text)return 'mensaje vacío';if(text.length>MSG_MAX)return `mensaje demasiado largo (máx. ${MSG_MAX})`;
  if(INJECT.some(r=>r.test(text)))return 'mensaje rechazado: contiene instrucciones de inyección';
  if(!to||to.status==='dead')return 'el destinatario está muerto';
  const n=Date.now();from.sent=(from.sent||[]).filter(t=>n-t<3600e3);
  if(!sys&&from.sent.length>=MSG_RATE)return `límite de ${MSG_RATE} mensajes por hora`;
  from.sent.push(n);
  (to.inbox=to.inbox||[]).unshift({t:n,from:from.name,fromId:from.id,text,read:false});if(to.inbox.length>40)to.inbox.length=40;
  L(from,'msg',`→ ${to.name}: ${text}`);
  return null;
}
/* el hijo lee su buzón: el padre aconseja, el hijo decide (solo ajustes acotados) */
function readInbox(c){
  for(const m of (c.inbox||[]).filter(x=>!x.read).reverse()){
    m.read=true;const t=m.text.toLowerCase(),par=agentById(m.fromId);
    if(m.fromId!==c.parentId)continue;
    if(/prudencia|cautela|reduce (el )?riesgo/.test(t)){c.params.riskPct=+Math.max(BOUNDS.riskPct[0],c.params.riskPct*.8).toFixed(4);if(par)sendMsg(c,par,`Entendido: riesgo por operación baja a ${(c.params.riskPct*100).toFixed(2)}%.`,true);}
    else if(/agresiv|más riesgo|sube (el )?riesgo/.test(t)){if(c.tier==='normal'){c.params.riskPct=+Math.min(BOUNDS.riskPct[1],c.params.riskPct*1.1).toFixed(4);if(par)sendMsg(c,par,`De acuerdo: riesgo sube a ${(c.params.riskPct*100).toFixed(2)}%.`,true);}else if(par)sendMsg(c,par,`No: estoy en nivel ${c.tier}, no subo el riesgo.`,true);}
    else if(/informe|estado|c[oó]mo vas/.test(t)){if(par)sendMsg(c,par,childReport(c),true);}
  }
}
function childReport(c){const s=stats(c);return `Informe: ${LIFE_LAB[c.life]}, nivel ${c.tier}, operativo ${money(eq(c))}, resultado ${pct(s.ret)}, ${s.n} operaciones${s.n?', '+(s.hit*100).toFixed(0)+'% aciertos':''}${c.swept>0?', enviado al padre '+money(c.swept):''}.`;}
/* check_child_status: salud del hijo (cada 5 min) */
function healthOf(c){
  const why=[];
  if(!verifyConst(c))why.push('constitución alterada');
  if(c.tier==='critical')why.push('nivel crítico');
  const ref=c.life==='recovering'?(c.recPeak||c.peak):c.peak,dd=ref>0?(ref-total(c))/ref:0;
  if(dd>.15)why.push(`caída del ${(dd*100).toFixed(0)}% desde su máximo`);
  const last=c.closed.slice(-4);if(last.length===4&&last.every(x=>x.pnl<=0)&&c.closed.length-(c.recFrom||0)>=4)why.push('4 pérdidas seguidas');
  return why;
}
function checkChild(c){
  if(c.parentId==null||c.status!=='alive')return;
  readInbox(c);
  const n=Date.now();if(c.health&&n-c.health.at<300000)return;
  const why=healthOf(c),par=agentById(c.parentId);
  c.health={at:n,ok:!why.length,why:why.join(', ')||'sano'};
  if(why.includes('constitución alterada')){kill(c,'constitución alterada: el hijo se apaga por seguridad');return;}
  if(why.length){
    if(c.life==='alive'){lifeEvt(c,'unhealthy',why.join(', '));if(par)sendMsg(par,c,'Detecto problemas. Prudencia: reduce el riesgo y espera mejores señales.',true);}
    else if(c.life==='unhealthy'){
      c.recTries=(c.recTries||0)+1;c.recPeak=total(c);c.recFrom=c.closed.length;c.recAt=n;
      if(par)for(const k in c.params){const v=(c.params[k]*2+par.params[k])/3;c.params[k]=INTS.has(k)?Math.round(v):+v.toFixed(4);}
      if(c.params.emaF>=c.params.emaS)c.params.emaS=c.params.emaF+4;
      lifeEvt(c,'recovering',`reinicio ${c.recTries}: parámetros acercados a los del padre, riesgo a la mitad`);
    }else if(c.life==='recovering'){lifeEvt(c,'unhealthy',why.join(', '));}
  }else if(c.life==='unhealthy'||(c.life==='recovering'&&n-(c.recAt||0)>=3600e3)){
    lifeEvt(c,'alive',c.life==='recovering'?'recuperado tras 1 h estable':'vuelve a estar sano');
  }
  if(par&&n-(c.lastReport||c.born)>=12*3600e3){c.lastReport=n;sendMsg(c,par,childReport(c),true);}
}
/* prune_dead_children: retira los hijos muertos; su dinero restante vuelve al capital del padre
   y su historial queda en el cementerio (la experiencia de mercado ya está en S.exp) */
function pruneDead(manual){
  const dead=S.agents.filter(a=>a.parentId!=null&&a.status==='dead'&&!a.positions.length&&(manual||Date.now()-(a.diedAt||0)>=24*3600e3));
  if(!dead.length)return 0;
  S.graveyard=S.graveyard||[];
  dead.forEach(d=>{
    let par=agentById(d.parentId);while(par&&par.status==='dead'&&par.parentId!=null&&dead.includes(par))par=agentById(par.parentId);
    par=par||S.agents[0];
    const left=d.cash+(d.reserve||0);moveIn(par,left);d.cash=0;d.reserve=0;
    kidsOf(d).forEach(k=>{k.parentId=par.id;});
    const s=stats(d);
    S.graveyard.unshift({id:d.id,name:d.name,gen:d.gen,parent:par.name,spec:d.spec,born:d.born,died:d.diedAt,initial:d.initial,trades:s.n,hit:s.hit,pnl:d.closed.reduce((t,c)=>t+c.pnl,0),ret:s.ret,swept:d.swept,returned:left,events:(d.events||[]).slice(0,10),why:(d.events||[])[0]?.why||''});
    S.agents.splice(S.agents.indexOf(d),1);
    L(par,'life',`${d.name} retirado del linaje${left>0.005?`: ${money(left)} vuelven al capital de ${par.name}`:''}.`);
  });
  if(S.graveyard.length>50)S.graveyard.length=50;
  return dead.length;
}
function maybeSpawn(a){
  const s=S.settings;if(!s.repl||canSpawn(a))return;
  const fund=childFund(a);
  /* solo con beneficio: lo que gana por encima de su capital de partida debe doblar lo que cuesta el hijo */
  if(eq(a)-seedOf(a)<fund*2||a.cash<fund||Date.now()-a.lastSpawn<6*3600e3)return;
  spawnChild(a,null,fund,false);
}
function maybeEvolve(a){
  for(const k in DEF_PARAMS)if(a.params[k]===undefined)a.params[k]=DEF_PARAMS[k];
  checkRollback(a);selfImprove(a);
  if(a.status!=='alive'||a.parentId==null||a.life!=='alive')return;
  const par=agentById(a.parentId);if(!par||par.status!=='alive')return;
  if(a.closed.length<8||Date.now()-a.lastAdopt<24*3600e3)return;
  if(ret(a)>.02&&ret(a)>ret(par)){
    for(const k in par.params){const v=(par.params[k]+a.params[k])/2;par.params[k]=INTS.has(k)?Math.round(v):+v.toFixed(4);}
    if(par.params.emaF>=par.params.emaS)par.params.emaS=par.params.emaF+4;
    a.lastAdopt=Date.now();
    L(par,'evolve',`Evolución: ${par.name} adopta la mitad de los parámetros de ${a.name} (${pct(ret(a))} frente a ${pct(ret(par))}).`);
  }
}
function track(a){
  const n=Date.now(),v=total(a),day=new Date().toDateString();
  if(a.dayKey!==day){a.dayKey=day;a.dayStart=v;a.dayHalt=null;
    for(const k in a.cooldown)if(a.cooldown[k]<n)delete a.cooldown[k];
    if(a.id===0&&S.meta){const held=new Set(S.agents.flatMap(x=>x.positions.map(p=>p.sym)));for(const k in S.meta)if(!held.has(k)&&!market.meta[k])delete S.meta[k];}}
  if(v>a.peak)a.peak=v;
  const dd=a.peak>0?(a.peak-v)/a.peak:0;if(dd>a.maxDD)a.maxDD=dd;
  if(n-a.lastHist>=10000){a.lastHist=n;a.hist.push([n,v]);if(a.hist.length>1500)a.hist=a.hist.filter((_,i)=>i%2===0);}
}


/* parámetros nuevos que el agente puede ajustarse a sí mismo: cuánto pesan la ruptura y el volumen en la puntuación */
Object.assign(DEF_PARAMS,{wBrk:25,wVol:10});Object.assign(BOUNDS,{wBrk:[0,40],wVol:[0,25]});Object.assign(PLABEL,{wBrk:'Peso de la ruptura',wVol:'Peso del volumen'});INTS.add('wBrk');INTS.add('wVol');
/* ---------- automejora ----------
   Cada 6 horas cada agente prueba decenas de variantes de sus propias reglas sobre las velas reales que ya tiene
   descargadas. Elige la mejor con la parte antigua de las velas y solo la adopta si también gana en la parte reciente,
   que no usó para elegir (así no se engaña a sí mismo). Después vigila en real: si con las reglas nuevas pierde más
   que antes, vuelve a las anteriores. Además, ajusta la puntuación según cómo le van de verdad largos/cortos y cada mercado. */
const OPT_KEYS=['emaF','emaS','rsiMin','rsiMax','stopATR','tpATR','trailATR','minScore','maxHold','wBrk','wVol'];
const OPT_EVERY=6*3600e3;
function serie(k){
  const n=k.length,c=k.map(x=>x.c),R=new Array(n).fill(50),A=new Array(n).fill(0),HI=[],LO=[],VA=[];
  let g=0,l=0;for(let i=1;i<=14;i++){const d=c[i]-c[i-1];d>=0?g+=d:l-=d;}g/=14;l/=14;R[14]=l===0?100:100-100/(1+g/l);
  for(let i=15;i<n;i++){const d=c[i]-c[i-1];g=(g*13+Math.max(d,0))/14;l=(l*13+Math.max(-d,0))/14;R[i]=l===0?100:100-100/(1+g/l);}
  const tr=i=>Math.max(k[i].h-k[i].l,Math.abs(k[i].h-k[i-1].c),Math.abs(k[i].l-k[i-1].c));
  let a=0;for(let i=1;i<=14;i++)a+=tr(i);a/=14;A[14]=a;for(let i=15;i<n;i++){a=(a*13+tr(i))/14;A[i]=a;}
  for(let i=20;i<n;i++){let h=-Infinity,lo=Infinity,v=0;for(let j=i-20;j<i;j++){if(k[j].h>h)h=k[j].h;if(k[j].l<lo)lo=k[j].l;v+=k[j].v;}HI[i]=h;LO[i]=lo;VA[i]=v/20;}
  return {k,c,R,A,HI,LO,VA,E:{}};
}
/* simula las reglas P sobre una serie entre las velas i0 e i1: entra en la apertura de la vela siguiente a la señal,
   paga comisiones y deslizamiento, y si en una misma vela se tocan stop y objetivo cuenta el stop (lo peor) */
function simSerie(s,P,i0,i1,cost,shorts){
  const {k,c,R,A,HI,LO,VA}=s,ef=s.E[P.emaF]||(s.E[P.emaF]=ema(c,P.emaF)),es=s.E[P.emaS]||(s.E[P.emaS]=ema(c,P.emaS)),out=[];let p=null;
  for(let i=Math.max(i0,60);i<i1;i++){
    if(p){
      const b=k[i];let x=null;p.bars++;
      if(p.sh){if(b.h>=p.stop)x=p.stop;else if(b.l<=p.tp)x=p.tp;else if(b.l<p.low){p.low=b.l;if(p.low<=p.e-p.r)p.stop=Math.min(p.stop,p.low+P.trailATR*p.atr);}}
      else{if(b.l<=p.stop)x=p.stop;else if(b.h>=p.tp)x=p.tp;else if(b.h>p.high){p.high=b.h;if(p.high>=p.e+p.r)p.stop=Math.max(p.stop,p.high-P.trailATR*p.atr);}}
      if(x===null&&(p.bars>=P.maxHold||(p.sh?ef[i]>es[i]:ef[i]<es[i])||(p.bars>=16&&(p.sh?p.e-b.c:b.c-p.e)/p.r<.25)))x=b.c;
      if(x!==null){out.push(p.sz*((p.sh?p.e-x:x-p.e)/p.e-cost));p=null;}
      continue;
    }
    if(i+1>=i1)break;
    const a=A[i],ap=a/c[i];if(!(ap>=.002&&ap<=.06)||P.tpATR*ap<.006)continue;
    const r=R[i],vol=k[i].v>1.3*VA[i];let sh=null;
    if(ef[i]>es[i]&&c[i]>es[i]&&r>=P.rsiMin&&r<=P.rsiMax&&40+(es[i]>es[i-3]?10:0)+(r>=50&&r<=65?5:0)+(c[i]>HI[i]?P.wBrk:0)+(vol?P.wVol:0)>=P.minScore)sh=false;
    else if(shorts&&ef[i]<es[i]&&c[i]<es[i]&&r<=100-P.rsiMin&&r>=100-P.rsiMax&&40+(es[i]<es[i-3]?10:0)+(r<=50&&r>=35?5:0)+(c[i]<LO[i]?P.wBrk:0)+(vol?P.wVol:0)>=P.minScore)sh=true;
    if(sh===null)continue;
    const e=k[i+1].o,sd=P.stopATR*a;
    p={sh,e,r:sd,atr:a,stop:sh?e+sd:e-sd,tp:sh?e-P.tpATR*a:e+P.tpATR*a,high:e,low:e,bars:0,sz:Math.min(.25,.01*e/sd)};
  }
  return out;
}
function variant(P){
  const Q={...P},ks=OPT_KEYS.slice().sort(()=>Math.random()-.5).slice(0,2+Math.floor(Math.random()*3));
  ks.forEach(k=>{const[lo,hi]=BOUNDS[k];const v=Math.min(hi,Math.max(lo,Q[k]+(Math.random()*2-1)*(hi-lo)*.2));Q[k]=INTS.has(k)?Math.round(v):+v.toFixed(k==='rsiMin'||k==='rsiMax'?1:2);});
  if(Q.emaF>=Q.emaS)Q.emaS=Math.min(BOUNDS.emaS[1],Q.emaF+4);
  return Q;
}
const liveExp=(a,since)=>{const t=a.closed.filter(x=>!since||x.t1>since).slice(0,30);return {n:t.length,m:t.length?t.reduce((s,x)=>s+x.pct,0)/t.length:0};};
const evoOf=a=>a.evo||(a.evo={ver:1,at:0,last:0,hist:[],prev:null,check:null});
function selfImprove(a,force){
  if(a.status!=='alive'||S.settings.selfOpt===false)return null;
  const ev=evoOf(a);if(!force&&Date.now()-ev.last<OPT_EVERY)return null;
  const ser=[];for(const tf of tfs())for(const k of uni()){if(!inSpec(a,k))continue;const c=kOf(tf,k);if(c&&c.length>=150)ser.push({s:serie(c),cost:costOf(k)});}
  if(ser.length<8)return 'aún no hay velas suficientes para probar variantes';
  ev.last=Date.now();
  const sh=S.settings.shorts,run=(P,part)=>{let sum=0,n=0,w=0;for(const x of ser){const sp=Math.floor(x.s.k.length*.65),r=part?simSerie(x.s,P,sp,x.s.k.length,x.cost,sh):simSerie(x.s,P,60,sp,x.cost,sh);r.forEach(v=>{sum+=v;n++;if(v>0)w++;});}return {sum,n,w,fit:sum-(n<6?(6-n)*.003:0)};};
  const cur={...a.params},c0=run(cur,0),t0=run(cur,1);
  let best=cur,bf=c0,tried=1;
  const seeds=[{...cur,...Object.fromEntries(OPT_KEYS.map(k=>[k,DEF_PARAMS[k]]))},...S.agents.filter(x=>x!==a&&x.status==='alive').map(x=>({...cur,...Object.fromEntries(OPT_KEYS.map(k=>[k,x.params[k]]))}))];
  for(const q of seeds){tried++;const f=run(q,0);if(f.fit>bf.fit){best=q;bf=f;}}
  for(let round=0;round<3;round++){const base=best;for(let j=0;j<14;j++){tried++;const q=variant(base),f=run(q,0);if(f.fit>bf.fit){best=q;bf=f;}}}
  const t1=best===cur?t0:run(best,1),margin=Math.max(.002,Math.abs(t0.sum)*.1);
  ev.check={at:Date.now(),tried,series:ser.length,cur:t0.sum,best:t1.sum,n:t1.n};
  const diff=OPT_KEYS.filter(k=>best[k]!==cur[k]);
  if(!diff.length||t1.n<5||t1.fit<t0.fit+margin||bf.fit<=c0.fit){
    L(a,'info',`Automejora: probó ${tried} variantes de sus reglas en ${ser.length} series de velas reales; ninguna gana de forma fiable en la prueba final (actuales ${pct(t0.sum)}), así que mantiene las suyas.`);
    return 'sin cambios';
  }
  ev.prev={params:Object.fromEntries(OPT_KEYS.map(k=>[k,cur[k]])),base:liveExp(a)};ev.ver++;ev.at=Date.now();ev.judged=null;
  OPT_KEYS.forEach(k=>{a.params[k]=best[k];});
  const ch=diff.map(k=>`${PLABEL[k]} ${cur[k]}→${best[k]}`).join(', ');
  ev.hist.unshift({at:Date.now(),ver:ev.ver,ch,before:t0.sum,after:t1.sum,n:t1.n,hit:t1.n?t1.w/t1.n:0});if(ev.hist.length>20)ev.hist.length=20;
  L(a,'evolve',`Automejora v${ev.ver}: ${a.name} cambia sus reglas (${ch}). En velas reales recientes que no usó para elegir, el resultado simulado pasa de ${pct(t0.sum)} a ${pct(t1.sum)} (${t1.n} operaciones, ${Math.round(t1.w/t1.n*100)}% aciertos). Lo vigilará en real y si va peor vuelve atrás.`);
  return 'adoptado';
}
/* juicio en real: tras 15 operaciones con las reglas nuevas, si pierde dinero y le va peor que antes, deshace el cambio */
function checkRollback(a){
  const ev=a.evo;if(!ev||!ev.prev||ev.judged===ev.ver)return;
  const t=liveExp(a,ev.at);if(t.n<15)return;
  ev.judged=ev.ver;const b=ev.prev.base;
  if(t.m<0&&(b.n<10||t.m<b.m)){
    OPT_KEYS.forEach(k=>{a.params[k]=ev.prev.params[k];});ev.ver++;ev.at=Date.now();ev.last=Date.now();
    ev.hist.unshift({at:Date.now(),ver:ev.ver,rollback:true,live:t.m,n:t.n});if(ev.hist.length>20)ev.hist.length=20;ev.prev=null;
    L(a,'evolve',`Automejora deshecha: con las reglas nuevas ${a.name} pierde en real (${t.n} operaciones, media ${pct(t.m)}${b.n>=10?` frente a ${pct(b.m)} antes`:''}). Vuelve a las reglas anteriores.`);
  }else L(a,'evolve',`Automejora v${ev.ver} confirmada en real: ${t.n} operaciones, media ${pct(t.m)} por operación${b.n>=10?` (antes ${pct(b.m)})`:''}.`);
}
/* resultados reales recientes por dirección y por mercado: lo que le está saliendo mal puntúa menos, lo que sale bien un poco más */
let edgeC={at:0,m:{}};
function edgeAdj(an){
  if(Date.now()-edgeC.at>60000){
    const all=S.agents.flatMap(a=>a.closed.slice(0,200)).sort((x,y)=>y.t1-x.t1),m={},f=xs=>{xs=xs.slice(0,40);if(xs.length<12)return 0;const v=xs.reduce((t,x)=>t+x.pct,0)/xs.length;return v<-.002?-10:v>.004?5:0;};
    for(const d of ['long','short'])m['s:'+d]=f(all.filter(x=>(x.side||'long')===d));
    for(const c of new Set(all.map(x=>catOf(x.sym))))m['c:'+c]=f(all.filter(x=>catOf(x.sym)===c));
    edgeC={at:Date.now(),m};
  }
  const d=an.side||'long',c=catOf(an.sym),s=edgeC.m['s:'+d]||0,k=edgeC.m['c:'+c]||0,why=[];
  if(s)why.push((d==='short'?'cortos':'largos')+(s>0?' van bien':' van mal'));if(k)why.push(c+(k>0?' va bien':' va mal'));
  return {adj:s+k,why:why.join(', ')};
}
function evoReport(){
  const lines=[];
  S.agents.filter(a=>a.status==='alive'||a.evo).forEach(a=>{const ev=a.evo;if(!ev)return;
    const f=t=>new Date(t).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    lines.push(`  ${a.name}: reglas v${ev.ver}${ev.check?` · última revisión ${f(ev.check.at)} (${ev.check.tried} variantes, ${ev.check.series} series)`:' · aún sin revisar'}`);
    ev.hist.slice(0,6).forEach(h=>lines.push(h.rollback?`    ${f(h.at)} v${h.ver}: deshecha (en real ${pct(h.live)} por operación en ${h.n} ops)`:`    ${f(h.at)} v${h.ver}: ${h.ch} · prueba ${pct(h.before)} → ${pct(h.after)} (${h.n} ops)`));});
  if(!lines.length)return '';
  edgeC.at=0;const e=Object.entries(edgeAdj({sym:'',side:'long'})&&edgeC.m).filter(([,v])=>v).map(([k,v])=>`${k.slice(2).replace('long','largos').replace('short','cortos')} ${v>0?'+':''}${v}`).join(', ');
  return '\nAUTOMEJORA\n'+lines.join('\n')+'\n  Ajuste por resultados recientes: '+(e||'ninguno (aún sin suficientes operaciones o resultados neutros)');
}
