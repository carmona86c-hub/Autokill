'use strict';
const RLAB=[['sin tendencia','sin tendencia clara'],['sobrecomprado','RSI sobrecomprado'],['sobrevendido','RSI sobrevendido'],['sin fuerza','RSI sin fuerza'],['presión vendedora','sin presión vendedora'],['desactivados','cortos desactivados'],['experiencia','vetado por experiencia'],['puntuación','puntuación insuficiente'],
  ['demasiado baja','se mueve demasiado poco para cubrir comisiones'],['excesiva','volatilidad excesiva'],['no cubre','objetivo no cubre costes'],['escapó','precio ya escapado'],['espera','en espera tras pérdida'],['máximo','límite de posiciones'],['misma dirección','demasiadas criptos en la misma dirección'],['cartera','ya en cartera'],['capital','capital insuficiente'],['previsión de Kronos','esperando a Kronos'],['Kronos no confirma','Kronos no confirma la dirección'],['poco recorrido','Kronos prevé poco recorrido'],['saltos','paso de precio demasiado grande'],['bitcoin','contra la tendencia del bitcoin'],['IBKR','no disponible o no permitido en IBKR'],['margen','cortos solo con cuenta de margen'],['efectivo','efectivo pendiente de liquidar o insuficiente'],['enteras','no cabe una acción entera']];
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
      p.bars++;
      const an=analyze(p.sym,P,p.tf);
      const px0=pxFresh(p.sym,90000)?market.price[p.sym]:null,prog=px0?(isShort(p)?p.entry-px0:px0-p.entry)/p.risk:null;
      /* las esperas se cuentan en velas de la propia operación: una entrada con velas de 1 h no se juzga con relojes de 5 min */
      const tfm=TF_MS[p.tf||S.settings.tf]||TF_MS[S.settings.tf];
      if(Date.now()>=(p.until||p.openedAt+P.maxHold*tfm))closePos(a,p,'tiempo máximo');
      /* sin avance: si tras 16 velas (de su marco) no ha recorrido ni un cuarto del riesgo hacia el objetivo, se cierra para usar el dinero en algo que se mueva */
      else if(prog!=null&&Date.now()-p.openedAt>=16*tfm&&prog<.25&&!p.half)closePos(a,p,'sin avance: libera el capital');
      /* cruce de medias en contra: en pérdida, corta; en ganancia, no vende pero asegura el stop en la entrada */
      else if(an&&(isShort(p)?an.bullCross:an.bearCross)){if(prog!=null&&prog>0){if(!p.xProt){p.xProt=1;protect(p);}}else closePos(a,p,isShort(p)?'cruce alcista de medias':'cruce bajista de medias');}
    }
  }
  const keys=halted||sick?[]:uni().filter(k=>inSpec(a,k)&&isOpen(k)&&minsToClose(sessOf(k))>15).slice(0,T.syms);
  if(halted&&a.id===0){ui.summary='Pausa por límite de pérdida diaria: hoy no abre más operaciones';ui.reasons='';ui.scanAt=Date.now();}
  const rows=keys.map(k=>tfs().map(tf=>analyze(k,P,tf)).filter(Boolean).flatMap(an=>canShort(k)?[an,an.short]:[an])).filter(x=>x.length)
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
  const last=c.closed.filter(x=>!x.user).slice(-4);if(last.length===4&&last.every(x=>x.pnl<=0)&&c.closed.length-(c.recFrom||0)>=4)why.push('4 pérdidas seguidas');
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
/* simula las reglas P sobre una serie entre las velas i0 e i1, con las mismas salidas que en real: entra en la apertura de la
   vela siguiente a la señal, paga comisiones y deslizamiento, a +1R vende la mitad y sube el stop a la entrada, desde +1,5R
   trailing, y al llegar al objetivo lo deja correr. Si en una vela se tocan stop y algo favorable, cuenta el stop (lo peor).
   rL: límite de ganancia limpia opcional (en tanto por uno de la posición) para estudiar variantes. */
function simCore(s,P,i0,i1,cost,shorts,rL){
  const {k,c,R,A,HI,LO,VA}=s,ef=s.E[P.emaF]||(s.E[P.emaF]=ema(c,P.emaF)),es=s.E[P.emaS]||(s.E[P.emaS]=ema(c,P.emaS)),out=[];let p=null;
  const fin=x=>{const rr=(p.sh?p.e-x:x-p.e)/p.e-cost;out.push({r:p.half?(p.r1+rr)/2:rr,bars:p.bars,sz:p.sz});p=null;};
  for(let i=Math.max(i0,60);i<i1;i++){
    if(p){
      const b=k[i];p.bars++;
      if(p.sh?b.h>=p.stop:b.l<=p.stop){fin(p.stop);continue;}
      if(p.cap&&(p.sh?b.l<=p.cap:b.h>=p.cap)){fin(p.cap);continue;}
      const best=p.sh?b.l:b.h,fav=(p.sh?p.e-best:best-p.e)/p.r;
      if(!p.half&&fav>=1){p.half=true;p.r1=p.r/p.e-cost;const be=p.e*(p.sh?1-cost:1+cost);p.stop=p.sh?Math.min(p.stop,be):Math.max(p.stop,be);}
      if(p.sh){if(b.l<p.low)p.low=b.l;}else if(b.h>p.high)p.high=b.h;
      if(!p.run&&(p.sh?b.l<=p.tp:b.h>=p.tp))p.run=true;
      if(fav>=1.5||p.run){const d=(p.run?1:P.trailATR)*p.atr;p.stop=p.sh?Math.min(p.stop,p.low+d):Math.max(p.stop,p.high-d);}
      const prog=(p.sh?p.e-b.c:b.c-p.e)/p.r,cross=p.sh?ef[i]>es[i]:ef[i]<es[i];
      if(cross&&prog>0){const be=p.e*(p.sh?1-cost:1+cost);p.stop=p.sh?Math.min(p.stop,be):Math.max(p.stop,be);}
      if(p.bars>=P.maxHold||(cross&&prog<=0)||(p.bars>=16&&prog<.25&&!p.half))fin(b.c);
      continue;
    }
    if(i+1>=i1)break;
    const a=A[i],ap=a/c[i];if(!(ap>=.002&&ap<=.06)||P.tpATR*ap<Math.max(.006,3*cost))continue;
    const r=R[i],vol=k[i].v>1.3*VA[i];let sh=null;
    if(ef[i]>es[i]&&c[i]>es[i]&&r>=P.rsiMin&&r<=P.rsiMax&&40+(es[i]>es[i-3]?10:0)+(r>=50&&r<=65?5:0)+(c[i]>HI[i]?P.wBrk:0)+(vol?P.wVol:0)>=P.minScore)sh=false;
    else if(shorts&&ef[i]<es[i]&&c[i]<es[i]&&r<=100-P.rsiMin&&r>=100-P.rsiMax&&40+(es[i]<es[i-3]?10:0)+(r<=50&&r>=35?5:0)+(c[i]<LO[i]?P.wBrk:0)+(vol?P.wVol:0)>=P.minScore)sh=true;
    if(sh===null)continue;
    const e=k[i+1].o,sd=P.stopATR*a;
    p={sh,e,r:sd,atr:a,stop:sh?e+sd:e-sd,tp:sh?e-P.tpATR*a:e+P.tpATR*a,cap:rL>0&&isFinite(rL)?(sh?e*(1-rL-cost):e*(1+rL+cost)):0,high:e,low:e,bars:0,half:false,run:false,r1:0,sz:Math.min(.25,.01*e/sd)};
  }
  return out;
}
const simSerie=(s,P,i0,i1,cost,shorts)=>simCore(s,P,i0,i1,cost,shorts).map(o=>o.sz*o.r);
function variant(P){
  const Q={...P},ks=OPT_KEYS.slice().sort(()=>Math.random()-.5).slice(0,2+Math.floor(Math.random()*3));
  ks.forEach(k=>{const[lo,hi]=BOUNDS[k];const v=Math.min(hi,Math.max(lo,Q[k]+(Math.random()*2-1)*(hi-lo)*.2));Q[k]=INTS.has(k)?Math.round(v):+v.toFixed(k==='rsiMin'||k==='rsiMax'?1:2);});
  if(Q.emaF>=Q.emaS)Q.emaS=Math.min(BOUNDS.emaS[1],Q.emaF+4);
  return Q;
}
const liveExp=(a,since)=>{const t=a.closed.filter(x=>!x.user&&(!since||x.t1>since)).slice(0,30);return {n:t.length,m:t.length?t.reduce((s,x)=>s+x.pct,0)/t.length:0};};
const evoOf=a=>a.evo||(a.evo={ver:1,at:0,last:0,hist:[],prev:null,check:null});
function selfImprove(a,force){
  if(a.status!=='alive'||S.settings.selfOpt===false)return null;
  const ev=evoOf(a);if(!force&&Date.now()-ev.last<OPT_EVERY)return null;
  const ser=[];for(const tf of tfs())for(const k of uni()){if(!inSpec(a,k))continue;const c=kOf(tf,k);if(c&&c.length>=150)ser.push({s:serie(c),cost:costOf(k),sh:canShort(k)});}
  if(ser.length<8)return 'aún no hay velas suficientes para probar variantes';
  ev.last=Date.now();
  /* validación en dos periodos: elige con el 60 % más antiguo de las velas y exige mejorar en los dos tramos recientes (60-80 % y 80-100 %) */
  const run=(P,part)=>{let sum=0,n=0,w=0;for(const x of ser){const L0=x.s.k.length,cut=[60,Math.floor(L0*.6),Math.floor(L0*.8),L0],r=simSerie(x.s,P,cut[part],cut[part+1],x.cost,x.sh);r.forEach(v=>{sum+=v;n++;if(v>0)w++;});}return {sum,n,w,fit:sum-(n<6?(6-n)*.003:0)};};
  const both=(A,B)=>({sum:A.sum+B.sum,n:A.n+B.n,w:A.w+B.w,fit:A.fit+B.fit});
  const cur={...a.params},c0=run(cur,0),t0a=run(cur,1),t0b=run(cur,2),t0=both(t0a,t0b);
  let best=cur,bf=c0,tried=1;
  const seeds=[{...cur,...Object.fromEntries(OPT_KEYS.map(k=>[k,DEF_PARAMS[k]]))},...S.agents.filter(x=>x!==a&&x.status==='alive').map(x=>({...cur,...Object.fromEntries(OPT_KEYS.map(k=>[k,x.params[k]]))}))];
  for(const q of seeds){tried++;const f=run(q,0);if(f.fit>bf.fit){best=q;bf=f;}}
  for(let round=0;round<3;round++){const base=best;for(let j=0;j<14;j++){tried++;const q=variant(base),f=run(q,0);if(f.fit>bf.fit){best=q;bf=f;}}}
  const t1a=best===cur?t0a:run(best,1),t1b=best===cur?t0b:run(best,2),t1=both(t1a,t1b),margin=Math.max(.002,Math.abs(t0.sum)*.1);
  ev.check={at:Date.now(),tried,series:ser.length,cur:t0.sum,best:t1.sum,n:t1.n};
  const diff=OPT_KEYS.filter(k=>best[k]!==cur[k]);
  if(!diff.length||t1.n<5||t1.fit<t0.fit+margin||t1a.sum<t0a.sum||t1b.sum<t0b.sum||bf.fit<=c0.fit){
    L(a,'info',`Automejora: probó ${tried} variantes de sus reglas en ${ser.length} series de velas reales; ninguna gana de forma fiable en los dos periodos recientes de prueba (actuales ${pct(t0.sum)}), así que mantiene las suyas.`);
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
    const all=S.agents.flatMap(a=>a.closed.filter(x=>!x.user).slice(0,200)).sort((x,y)=>y.t1-x.t1),m={},f=xs=>{xs=xs.slice(0,40);if(xs.length<12)return 0;const v=xs.reduce((t,x)=>t+x.pct,0)/xs.length;return v<-.002?-10:v>.004?5:0;};
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
  if(!lines.length)return protReport();
  edgeC.at=0;const e=Object.entries(edgeAdj({sym:'',side:'long'})&&edgeC.m).filter(([,v])=>v).map(([k,v])=>`${k.slice(2).replace('long','largos').replace('short','cortos')} ${v>0?'+':''}${v}`).join(', ');
  return '\nAUTOMEJORA\n'+lines.join('\n')+'\n  Ajuste por resultados recientes: '+(e||'ninguno (aún sin suficientes operaciones o resultados neutros)')+protReport();
}

/* ---------- protecciones: tipo de mercado, momentos peligrosos y pausa de lo que no funciona ----------
   Se añaden como filtros finales de cada entrada (decide) y como ajuste del tamaño (openPos), sin tocar las reglas del agente. */
/* fechas oficiales: decisiones de la Reserva Federal (federalreserve.gov) y dato de inflación IPC (bls.gov, 8:30 de Nueva York) */
const PROT_EV=[['2026-12-09','fomc'],['2027-01-27','fomc'],['2026-12-10','cpi'],['2027-01-13','cpi'],['2027-02-11','cpi'],['2027-03-10','cpi'],['2027-04-13','cpi']];
const etP=t=>parts(t,'America/New_York');
const isStk=k=>!['Cripto','Divisas','Materias primas'].includes(catOf(k));
/* momentos peligrosos conocidos: la Fed decide a las 14:00 de Nueva York (y explica a las 14:30); el IPC sale a las 8:30, antes de abrir la bolsa */
function evNow(k,t){const p=etP(t);for(const [d,e] of PROT_EV){if(d!==p.y)continue;
  if(e==='fomc'&&p.m>=825&&p.m<930)return 'reunión de la Reserva Federal (decisión de tipos a las 14:00 de Nueva York)';
  if(e==='cpi'&&(catOf(k)==='Cripto'?p.m>=495&&p.m<570:p.m>=570&&p.m<630))return 'dato de inflación de EE. UU. (IPC) recién publicado';}
  return null;}
/* eficiencia del movimiento en las últimas 20 velas: 1 = va derecho en una dirección, cerca de 0 = sube y baja sin ir a ningún sitio */
function effOf(c,n=20){if(!c||c.length<n+1)return null;const a=c.slice(-n-1);let s=0;for(let i=1;i<a.length;i++)s+=Math.abs(a[i].c-a[i-1].c);return s>0?Math.abs(a[a.length-1].c-a[0].c)/s:0;}
/* nerviosismo: rango medio de las 14 últimas velas frente al de las 100 últimas */
function nervOf(c){if(!c||c.length<100)return null;const r=x=>(x.h-x.l)/x.c,m=a=>a.reduce((t,x)=>t+r(x),0)/a.length,b=m(c.slice(-100));return b>0?m(c.slice(-14))/b:null;}
/* día de noticias (resultados de la empresa u otra noticia): la acción abre hoy con un salto de más del 4 % sobre el cierre anterior */
const gapC={};
function gapOf(k){const p=etP(Date.now()),ck=k+'|'+p.y;if(ck in gapC)return gapC[ck];const c=kOf('1h',k)||kOf(S.settings.tf,k);if(!c||c.length<10)return null;
  let i=c.length-1;while(i>0&&etP(c[i].t).y===p.y)i--;if(i>=c.length-1||etP(c[i+1].t).y!==p.y)return null;
  const g=c[i+1].o/c[i].c-1;if(Object.keys(gapC).length>500)for(const x in gapC)delete gapC[x];return gapC[ck]=g;}
/* referencia de la bolsa: el Nasdaq (QQQ o su contrato) en velas de 1 h */
let ndxC={at:0,v:null};
function ndxTrend(P){if(Date.now()-ndxC.at<60000)return ndxC.v;const k=uni().find(x=>['QQQ','XYZ100','US100','NAS100','USTECH'].includes(base(x).toUpperCase())),an=k&&analyze(k,P,'1h');
  ndxC={at:Date.now(),v:an?(an.trend?'up':an.short.trend?'down':null):null,k};return ndxC.v;}
/* pausa de lo que no funciona: tipo de operación = mercado + dirección + velas. Si en sus últimas operaciones (al menos 8) pierde de forma clara
   (media negativa y t < −1,5: no es mala suerte), se pausa 48 h; luego vuelve a prueba con la mitad de riesgo. Si en 5 operaciones de prueba
   sigue perdiendo, se pausa el doble (hasta 14 días); si no, queda reactivado y se juzga solo con lo que haga desde entonces. */
const patKey=x=>catOf(x.sym)+'|'+(x.side||'long')+'|'+(x.tf||'?');
const patLab=k=>{const [c,s,t]=k.split('|');return `${c} ${s==='short'?'a la baja':'al alza'} con velas de ${t}`;};
let patAt=0;
function patCheck(force){
  const now=Date.now();if(!force&&now-patAt<600000)return;patAt=now;const PZ=S.pause||(S.pause={});
  const all=S.agents.flatMap(a=>a.closed.filter(x=>!x.user&&x.t1>now-30*864e5)),g={};all.forEach(x=>{(g[patKey(x)]=g[patKey(x)]||[]).push(x);});
  const tg=t=>{L(null,'info',t);try{tgPost('🛡️ Automaton · '+t);}catch(e){}};
  for(const k in g){
    const st=PZ[k],xs=g[k].filter(x=>x.t1>((st&&st.clear)||0)).sort((a,b)=>b.t1-a.t1);
    if(st&&st.until>now)continue;
    if(st&&st.until&&!st.prob){st.prob=now;st.until=0;tg(`Vuelve a prueba: ${patLab(k)}, con la mitad de riesgo.`);continue;}
    if(st&&st.prob){const af=xs.filter(x=>x.t1>st.prob);if(af.length<5)continue;const m=af.reduce((t,x)=>t+x.pct,0)/af.length;
      if(m<0){st.dur=Math.min(14*864e5,(st.dur||48*3600e3)*2);st.until=now+st.dur;st.prob=0;st.n=af.length;st.m=m;tg(`Sigue perdiendo en prueba (${af.length} operaciones, media ${pct(m)}): ${patLab(k)} en pausa ${Math.round(st.dur/3600e3)} h.`);}
      else{PZ[k]={clear:now};tg(`Reactivado: ${patLab(k)} (en prueba, ${af.length} operaciones con media ${pct(m)}).`);}continue;}
    const r=xs.slice(0,20);if(r.length<8)continue;
    const v=r.map(x=>x.pct),m=v.reduce((t,x)=>t+x,0)/v.length,sd=Math.sqrt(v.reduce((t,x)=>t+(x-m)**2,0)/(v.length-1)),tt=sd>0?m/(sd/Math.sqrt(v.length)):(m<0?-9:0),pl=r.reduce((t,x)=>t+x.pnl,0);
    if(m<0&&tt<-1.5&&pl<0){PZ[k]={until:now+48*3600e3,dur:48*3600e3,since:now,n:r.length,m,pnl:pl,clear:(st&&st.clear)||0};
      tg(`En pausa 48 h: ${patLab(k)}. Pierde de forma clara: ${r.length} operaciones, media ${pct(m)} por operación, ${sgn(pl)} en total.`);}
  }
}
function protGuard(a,an,P){
  const k=an.sym,sh=an.side==='short',now=Date.now();patCheck();
  const st=(S.pause||{})[patKey(an)];
  if(st&&st.until>now)return `tipo de operación en pausa (${patLab(patKey(an))}): pierde de forma clara, se reintenta ${new Date(st.until).toLocaleString('es-ES',{weekday:'short',hour:'2-digit',minute:'2-digit'})}`;
  const ev=evNow(k,now);if(ev)return 'momento peligroso: '+ev;
  if(isStk(k)&&sessOf(k)==='us'){const p=etP(now);if(p.m<585)return 'apertura de la bolsa: primeros 15 min, precios erráticos';
    const g=gapOf(k);if(g!=null&&Math.abs(g)>.04)return `día de noticias: abrió con un salto del ${pct(g,1)} (resultados u otra noticia)`;
    if(catOf(k)==='Acciones'){const nd=ndxTrend(P);if(nd&&((sh&&nd==='up')||(!sh&&nd==='down')))return `contra la tendencia del Nasdaq (${nd==='up'?'alcista':'bajista'})`;}}
  if(isBS(k)){const nd=ndxTrend(P);if(nd&&((sh&&nd==='up')||(!sh&&nd==='down')))return `contra la tendencia del Nasdaq (${nd==='up'?'alcista':'bajista'})`;}
  const c=kOf(an.tf,k),e=effOf(c);if(e!=null&&e<.2)return `mercado de lado: en las últimas 20 velas de ${an.tf} se mueve sin dirección clara (eficiencia ${Math.round(e*100)} %)`;
  const nv=nervOf(c);an.nerv=nv!=null&&nv>1.8?nv:0;an.prob=!!(st&&st.prob);
  return null;
}
{const d0=decide;decide=function(a,an,P,T,pre){return d0(a,an,P,T,pre)||protGuard(a,an,P);};}
/* mercado nervioso o tipo de operación en prueba: misma entrada, pero arriesgando la mitad */
{const o0=openPos;openPos=function(a,an,P){if(!an.nerv&&!an.prob)return o0(a,an,P);
  const r=o0(a,an,Object.assign({},P,{riskPct:P.riskPct/2}));if(!r)L(a,'info',`${base(an.sym)}: posición a la mitad de riesgo (${an.nerv?`mercado nervioso, se mueve ${an.nerv.toFixed(1)} veces más de lo normal`:'tipo de operación en prueba tras una pausa'}).`);return r;};}
RLAB.unshift(['pausa','tipo de operación en pausa'],['momento peligroso','momento peligroso (Fed o IPC)'],['apertura de la bolsa','primeros 15 min de bolsa'],['día de noticias','día de noticias'],['Nasdaq','contra la tendencia del Nasdaq'],['de lado','mercado de lado']);
function protReport(){
  const now=Date.now(),PZ=S.pause||{},P=(S.agents[0]||{}).params||DEF_PARAMS,nd=ndxTrend(P);
  const bt=typeof btcTrend==='function'?btcTrend(P):null,pz=Object.entries(PZ).filter(([,v])=>v.until>now||v.prob);
  const nx=PROT_EV.filter(([d])=>d>=etP(now).y).sort().slice(0,3).map(([d,e])=>`${d} ${e==='fomc'?'Fed':'IPC'}`).join(', ');
  return '\nPROTECCIONES\n'+`  tendencia de referencia: bitcoin ${bt==='up'?'alcista':bt==='down'?'bajista':'sin tendencia'} · Nasdaq ${nd==='up'?'alcista':nd==='down'?'bajista':'sin tendencia o sin dato'}`+
    `\n  pausas: ${pz.length?pz.map(([k,v])=>v.until>now?`${patLab(k)} hasta ${new Date(v.until).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} (${v.n} ops, media ${pct(v.m)})`:`${patLab(k)} en prueba`).join(' · '):'ninguna'}`+
    `\n  próximos momentos peligrosos: ${nx||'ninguno en la lista'}`;
}

/* ---------- laboratorio de señales ----------
   Cada señal con dirección que ve el agente (entre o no) se guarda en una ficha con todo lo que veía: puntuación, RSI, ruptura, volumen,
   tendencia en 1 h y en varios días, fuerza frente a su mercado (bitcoin o Nasdaq), eficiencia del movimiento, nerviosismo, hora, día y
   qué decidió. Después se sigue el precio vela a vela: ¿llegó antes al objetivo o al stop? ¿cuánto llegó a ir a favor y en contra? El
   resultado se mide en R (veces lo arriesgado) ya restados los costes. Con eso se calcula qué acierta de verdad y, solo con pruebas claras
   (al menos 40 casos y t ≥ 2,5), actúa: bloquea los tipos de señal que pierden y apaga los filtros que están quitando operaciones buenas. */
const SIG_MAX=1500,SIG_N=40,SIG_T=2.5;
/* orden fijo de las características: cada ficha las guarda como lista para ocupar poco */
const SIG_FK=['lado','mercado','velas','mercado y lado','puntuación','RSI','ruptura','volumen','eficiencia','nerviosismo','volatilidad (ATR %)','tendencia 1 h','últimas 24 h','últimos 5 días','fuerza frente a su mercado (4 h)','fuerza frente a su mercado (24 h)','tendencia de su mercado','hora','día','experiencia'];
const sigOf=()=>S.sig||(S.sig={list:[],open:[],sum:null,act:{block:{},off:{}},at:0,sumAt:0});
const ret1h=(k,n)=>{const c=kOf('1h',k);if(!c||c.length<=n)return null;return c[c.length-1].c/c[c.length-1-n].c-1;};
const refOf=k=>catOf(k)==='Cripto'&&!isBS(k)?uni().find(x=>catOf(x)==='Cripto'&&base(x)==='BTC'):(isStk(k)||isBS(k))?(ndxC.k||uni().find(x=>['QQQ','XYZ100','US100','NAS100','USTECH'].includes(base(x).toUpperCase()))):null;
const band=(v,cuts,labs)=>{if(v==null||!isFinite(v))return 'sin dato';for(let i=0;i<cuts.length;i++)if(v<cuts[i])return labs[i];return labs[labs.length-1];};
function sigFeat(a,an,P){
  const k=an.sym,sh=an.side==='short',d=sh?-1:1,c=kOf(an.tf,k)||[],n=c.length-1,f={};
  f.lado=sh?'a la baja':'al alza';f.mercado=catOf(k);f.velas=an.tf;f['mercado y lado']=catOf(k)+' '+f.lado;
  f.puntuación=band(an.score,[60,70,80,90],['<60','60-69','70-79','80-89','90+']);
  f.RSI=band(sh?100-an.rsi:an.rsi,[45,55,65,75],['<45','45-54','55-64','65-74','75+']);
  if(n>21){const w=c.slice(n-20,n),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l)),va=w.reduce((t,x)=>t+x.v,0)/20;
    f.ruptura=(sh?c[n].c<lo:c[n].c>hi)?'sí':'no';f.volumen=band(va>0?c[n].v/va:null,[.7,1.3,2],['bajo','normal','alto','muy alto']);}
  f.eficiencia=band(effOf(c),[.2,.35,.5],['<0,20 (de lado)','0,20-0,34','0,35-0,49','0,50+ (va derecho)']);
  f.nerviosismo=band(nervOf(c),[.8,1.2,1.8],['tranquilo','normal','movido','nervioso']);
  f['volatilidad (ATR %)']=band(an.atrPct*100,[.3,.6,1.2,2.5],['<0,3','0,3-0,6','0,6-1,2','1,2-2,5','2,5+']);
  {const h=analyze(k,P,'1h');f['tendencia 1 h']=!h?'sin dato':(sh?h.short.trend:h.trend)?'a favor':(sh?h.trend:h.short.trend)?'en contra':'sin tendencia';}
  {const r24=ret1h(k,24),r120=ret1h(k,120);f['últimas 24 h']=band(r24==null?null:d*r24*100,[-2,-.5,.5,2],['muy en contra','en contra','plano','a favor','muy a favor']);
    f['últimos 5 días']=band(r120==null?null:d*r120*100,[-5,-1,1,5],['muy en contra','en contra','plano','a favor','muy a favor']);}
  {const rf=refOf(k);if(rf&&rf!==k){const a4=ret1h(k,4),b4=ret1h(rf,4),a24=ret1h(k,24),b24=ret1h(rf,24);
    f['fuerza frente a su mercado (4 h)']=band(a4==null||b4==null?null:d*(a4-b4)*100,[-1,-.25,.25,1],['mucho más débil','más débil','igual','más fuerte','mucho más fuerte']);
    f['fuerza frente a su mercado (24 h)']=band(a24==null||b24==null?null:d*(a24-b24)*100,[-2,-.5,.5,2],['mucho más débil','más débil','igual','más fuerte','mucho más fuerte']);}}
  {const r=catOf(k)==='Cripto'&&!isBS(k)?btcTrend(P):(isStk(k)||isBS(k))?ndxTrend(P):null;f['tendencia de su mercado']=r==null?'sin dato':(r==='up')===!sh?'a favor':'en contra';}
  {const t=Date.now();if(isStk(k)){const p=etP(t);f.hora='NY '+band(p.m/60,[10,11,12,13,14,15],['9:30-10','10-11','11-12','12-13','13-14','14-15','15-16']);}
    else{const hu=new Date(t).getUTCHours();f.hora='UTC '+band(hu,[4,8,12,16,20],['0-4','4-8','8-12','12-16','16-20','20-24']);}
    f.día=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][new Date(t).getUTCDay()];}
  {const x=xp(k);f.experiencia=x.e&&x.e.n>=3?(x.adj>0?'buena':x.adj<0?'mala':'neutra'):'sin historial';}
  return f;
}
/* guarda una ficha por activo, velas, dirección y vela (no se repite en la misma vela) */
function sigRecord(a,an,P,why){
  if(!an||!an.trend||a.id!==0)return;const G=sigOf(),c=kOf(an.tf,an.sym);if(!c||c.length<60)return;
  const id=an.sym+'|'+an.tf+'|'+an.side+'|'+c[c.length-1].t;if(G.open.some(x=>x.id===id))return;
  const sd=P.stopATR*an.atr;if(!(sd>0))return;
  G.open.push({id,k:an.sym,tf:an.tf,sh:an.side==='short'?1:0,t:Date.now(),e:an.price,sd,tp:P.tpATR*an.atr,cR:costOf(an.sym)*an.price/sd,
    h:Math.min(P.maxHold||48,48),dec:why?rlab(why):'apta: entra',f:(f=>SIG_FK.map(x=>f[x]??null))(sigFeat(a,an,P))});
  if(G.open.length>800)G.open.splice(0,G.open.length-800);
}
/* sigue cada ficha con las velas de su marco: objetivo o stop (si en la misma vela se tocan los dos, cuenta el stop) */
function sigResolve(){
  const G=sigOf(),keep=[];
  for(const s of G.open){
    const c=kOf(s.tf,s.k);if(!c){if(Date.now()-s.t>3*864e5)continue;keep.push(s);continue;}
    const after=c.filter(x=>x.t>s.t);let out=null,mfe=0,mae=0;
    for(let i=0;i<after.length&&i<s.h;i++){const b=after[i],up=(s.sh?s.e-b.l:b.h-s.e)/s.sd,dn=(s.sh?b.h-s.e:s.e-b.l)/s.sd;
      mfe=Math.max(mfe,up);mae=Math.max(mae,dn);
      if(dn>=1){out={r:-1,res:'stop'};break;}if(up*s.sd>=s.tp){out={r:s.tp/s.sd,res:'objetivo'};break;}}
    if(!out&&after.length>=s.h){const l=after[s.h-1].c;out={r:(s.sh?s.e-l:l-s.e)/s.sd,res:'tiempo'};}
    if(!out){if(Date.now()-s.t>7*864e5)continue;keep.push(s);continue;}
    G.list.unshift({t:s.t,k:s.k,dec:s.dec,f:s.f,r:+(out.r-s.cR).toFixed(3),res:out.res,mfe:+mfe.toFixed(2),mae:+mae.toFixed(2)});
  }
  G.open=keep;if(G.list.length>SIG_MAX)G.list.length=SIG_MAX;
}
const mstat=v=>{const n=v.length;if(!n)return {n:0,m:0,t:0,w:0};const m=v.reduce((a,b)=>a+b,0)/n,sd=n>1?Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(n-1)):0;return {n,m,t:sd>0?m/(sd/Math.sqrt(n)):0,w:v.filter(x=>x>0).length/n};};
/* análisis: para cada característica y cada valor, cuántas señales, cuántas ganaron, R medio y si la diferencia es clara (t) */
function sigAnalyze(){
  const G=sigOf(),LA=G.list.filter(x=>Date.now()-x.t<30*864e5),L0=LA.filter(x=>SIG_OK.has(x.dec)),all=mstat(L0.map(x=>x.r)),feats={};
  for(const s of L0)s.f.forEach((fv,i)=>{if(fv==null)return;const fk=SIG_FK[i],o=(feats[fk]=feats[fk]||{});(o[fv]=o[fv]||[]).push(s.r);});
  const rows=[];for(const fk in feats)for(const fv in feats[fk]){const st=mstat(feats[fk][fv]);rows.push({f:fk,v:fv,...st,d:st.m-all.m});}
  const dec={};for(const s of LA)(dec[s.dec]=dec[s.dec]||[]).push(s.r);
  const decs=Object.entries(dec).map(([k,v])=>({k,...mstat(v)})).sort((x,y)=>y.n-x.n);
  const clear=rows.filter(r=>r.n>=SIG_N&&Math.abs(r.t)>=SIG_T).sort((x,y)=>y.m-x.m);
  G.sum={at:Date.now(),n:L0.length,nAll:LA.length,open:G.open.length,all,best:clear.filter(r=>r.m>0).slice(0,8),worst:clear.filter(r=>r.m<0).slice(-8).reverse(),
    promising:rows.filter(r=>r.n>=15&&r.n<SIG_N&&Math.abs(r.d)>.3).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d)).slice(0,6),decs,act:G.act};
  return G.sum;
}
/* acciones con pruebas claras: bloquear lo que pierde y apagar los filtros que rechazan señales que habrían ganado.
   Se revisan cada hora y se deshacen solas si la prueba deja de ser clara. */
/* señales aptas: las que pasaron los filtros de calidad (entró, o no entró solo por falta de hueco o dinero, o por el propio laboratorio).
   Las que se rechazan por calidad (sin tendencia, sin recorrido para cubrir costes…) no sirven para juzgar: casi siempre pierden. */
const SIG_OK=new Set(['apta: entra','bloqueado por el laboratorio','límite de posiciones','ya en cartera','demasiadas criptos en la misma dirección','capital insuficiente','efectivo pendiente de liquidar o insuficiente']);
const SIG_MAXBLOCK=6;
const SIG_FEATS_BLOCK=['mercado y lado','velas','hora','puntuación','RSI','tendencia 1 h','últimos 5 días','fuerza frente a su mercado (24 h)','volatilidad (ATR %)'];
const SIG_FILTERS=['mercado de lado','contra la tendencia del Nasdaq','primeros 15 min de bolsa','día de noticias'];
function sigAct(){
  const G=sigOf(),sm=G.sum;if(!sm)return;const A=G.act,tg=t=>{L(null,'evolve',t);try{tgPost('🔬 Automaton · '+t);}catch(e){}};
  const rowsBy={},base=sm.all;for(const s of G.list.filter(x=>Date.now()-x.t<30*864e5&&SIG_OK.has(x.dec)))for(const fk of SIG_FEATS_BLOCK){const fv=s.f[SIG_FK.indexOf(fk)];if(fv==null||fv==='sin dato')continue;(rowsBy[fk+'='+fv]=rowsBy[fk+'='+fv]||[]).push(s.r);}
  /* solo se bloquea lo que pierde de forma clara y además es bastante peor que la media (0,2R); como mucho 6 a la vez, los peores.
     Si todo pierde, el problema es la estrategia: no se bloquea todo, se informa. */
  const cand=Object.entries(rowsBy).map(([key,v])=>({key,st:mstat(v)})).filter(x=>x.st.n>=SIG_N&&x.st.m<0&&x.st.t<=-SIG_T&&x.st.m<base.m-.2).sort((x,y)=>x.st.m-y.st.m).slice(0,SIG_MAXBLOCK),worst=new Set(cand.map(x=>x.key));
  for(const key in rowsBy){const st=mstat(rowsBy[key]);const bad=worst.has(key);
    if(bad&&!A.block[key]&&Object.keys(A.block).length<SIG_MAXBLOCK){A.block[key]={at:Date.now(),n:st.n,m:st.m};tg(`Laboratorio: bloquea las señales con ${key.replace('=',' = ')}. En ${st.n} casos dieron ${st.m.toFixed(2)}R de media (ganaron ${Math.round(st.w*100)} %): pierden de forma clara.`);}
    else if(!bad&&A.block[key]&&(st.n<SIG_N||st.t>-1.5||st.m>=base.m-.1)){delete A.block[key];tg(`Laboratorio: vuelve a permitir ${key.replace('=',' = ')} (la prueba ya no es clara: ${st.n} casos, ${st.m.toFixed(2)}R).`);}}
  for(const d of sm.decs){if(!SIG_FILTERS.includes(d.k))continue;const good=d.n>=SIG_N&&d.m>0&&d.t>=SIG_T;
    if(good&&!A.off[d.k]){A.off[d.k]={at:Date.now(),n:d.n,m:d.m};tg(`Laboratorio: apaga el filtro «${d.k}». Rechazó ${d.n} señales que habrían dado ${d.m.toFixed(2)}R de media: estaba quitando operaciones buenas.`);}
    else if(!good&&A.off[d.k]&&d.n>=SIG_N&&d.t<1)delete A.off[d.k];}
}
function sigTick(){const G=sigOf(),now=Date.now();if(now-G.at<5*60e3)return;G.at=now;sigResolve();if(now-G.sumAt>=3600e3||!G.sum){G.sumAt=now;sigAnalyze();sigAct();}}
const sigBlocked=(f,A)=>{for(const key in A.block){const i=key.indexOf('=');if(f[key.slice(0,i)]===key.slice(i+1))return key.replace('=',' = ');}return null;};
{const d1=decide;decide=function(a,an,P,T,pre){
  let w=d1(a,an,P,T,pre);
  if(w&&a.id===0){const lab=rlab(w),A=sigOf().act;if(A.off[lab]&&SIG_FILTERS.includes(lab)&&w===protGuardLast){w=null;}}
  if(!w&&a.id===0&&an.trend){const f=sigFeat(a,an,P),b=sigBlocked(f,sigOf().act);if(b)w=`el laboratorio lo bloquea: las señales con ${b} pierden de forma clara`;}
  if(!pre)try{sigRecord(a,an,P,w);sigTick();}catch(e){}
  return w;};}
/* para poder apagar un filtro, se recuerda el último motivo que dio la protección */
let protGuardLast=null;{const g0=protGuard;protGuard=function(a,an,P){const r=g0(a,an,P);protGuardLast=r;if(r&&a.id===0){const lab=rlab(r),A=(S.sig||{}).act;if(A&&A.off[lab])return null;}return r;};}
RLAB.unshift(['laboratorio','bloqueado por el laboratorio']);
function sigReport(){
  const sm=(S.sig||{}).sum;if(!sm)return '\nLABORATORIO DE SEÑALES: reuniendo datos (las primeras conclusiones salen tras unas horas)';
  const f=r=>`${r.f} = ${r.v}: ${r.n} casos, ${Math.round(r.w*100)} % ganan, ${r.m>=0?'+':''}${r.m.toFixed(2)}R (t ${r.t.toFixed(1)})`;
  const A=sm.act||{block:{},off:{}};
  return `\nLABORATORIO DE SEÑALES (${sm.nAll||sm.n} señales seguidas en 30 días, ${sm.n} aptas, ${sm.open} en seguimiento) · media de las aptas: ${sm.all.m>=0?'+':''}${sm.all.m.toFixed(2)}R, ganan ${Math.round(sm.all.w*100)} %`+
    `\n  lo que gana de forma clara:\n${sm.best.map(r=>'    '+f(r)).join('\n')||'    aún nada claro'}`+
    `\n  lo que pierde de forma clara:\n${sm.worst.map(r=>'    '+f(r)).join('\n')||'    aún nada claro'}`+
    `\n  prometedor (pocos casos aún):\n${sm.promising.map(r=>'    '+f(r)).join('\n')||'    —'}`+
    `\n  por decisión (qué habría pasado con las señales que se rechazaron):\n${sm.decs.slice(0,10).map(d=>`    ${d.k}: ${d.n} señales, ${Math.round(d.w*100)} % habrían ganado, ${d.m>=0?'+':''}${d.m.toFixed(2)}R`).join('\n')}`+
    `\n  acciones automáticas: ${[...Object.keys(A.block).map(k=>'bloquea '+k.replace('=',' = ')),...Object.keys(A.off).map(k=>'filtro apagado: '+k)].join(' · ')||'ninguna (hacen falta 40 casos y una diferencia clara)'}`;
}
{const p0=protReport;protReport=function(){return p0()+sigReport();};}
/* tarjeta «Laboratorio de señales» en Estadísticas y estado ligero para los dispositivos que miran el servidor */
function sigCard(){
  if(typeof document==='undefined'||!document.getElementById)return;const host=document.getElementById('s-stats');if(!host||!host.insertBefore)return;
  let box=document.getElementById('sigCard');if(!box){box=document.createElement('div');box.className='card';box.id='sigCard';const ref=document.getElementById('routeCard')||document.getElementById('trades');if(ref&&ref.parentNode===host)host.insertBefore(box,ref.closest?ref:ref);else host.appendChild(box);}
  const sm=(S.sig||{}).sum,row=r=>`<tr><td>${esc(r.f)}</td><td>${esc(r.v)}</td><td>${r.n}</td><td>${Math.round(r.w*100)} %</td><td class="${r.m>=0?'up':'down'}">${r.m>=0?'+':''}${r.m.toFixed(2)}R</td></tr>`;
  if(!sm){box.innerHTML='<h2>Laboratorio de señales</h2><p class="note" style="margin:0">Reuniendo datos: guarda cada señal que ve el agente (entre o no) y sigue qué pasa después. Las primeras conclusiones salen tras unas horas; las fiables, tras unos días.</p>';return;}
  const A=sm.act||{block:{},off:{}},acts=[...Object.keys(A.block).map(k=>'Bloquea: '+k.replace('=',' = ')),...Object.keys(A.off).map(k=>'Filtro apagado: '+k)];
  const th='<tr><th>Característica</th><th>Valor</th><th>Casos</th><th>Ganan</th><th>R medio</th></tr>';
  box.innerHTML=`<h2>Laboratorio de señales</h2><p class="note" style="margin:0 0 8px">${sm.nAll||sm.n} señales seguidas en 30 días, ${sm.n} aptas (pasaron los filtros de calidad), ${sm.open} en seguimiento. Las aptas dan de media <b class="${sm.all.m>=0?'up':'down'}">${sm.all.m>=0?'+':''}${sm.all.m.toFixed(2)}R</b> y ganan un ${Math.round(sm.all.w*100)} %. R = veces lo arriesgado, ya restados los costes. «Claro» = al menos ${SIG_N} casos y diferencia que no es casualidad.</p>
  <div class="lbl">Gana de forma clara</div><div class="tw">${sm.best.length?`<table>${th}${sm.best.map(row).join('')}</table>`:'<p class="note">Aún nada claro.</p>'}</div>
  <div class="lbl" style="margin-top:8px">Pierde de forma clara</div><div class="tw">${sm.worst.length?`<table>${th}${sm.worst.map(row).join('')}</table>`:'<p class="note">Aún nada claro.</p>'}</div>
  ${sm.promising.length?`<div class="lbl" style="margin-top:8px">Prometedor (pocos casos aún)</div><div class="tw"><table>${th}${sm.promising.map(row).join('')}</table></div>`:''}
  <div class="lbl" style="margin-top:8px">Qué habría pasado con cada decisión</div><div class="tw"><table><tr><th>Decisión</th><th>Señales</th><th>Habrían ganado</th><th>R medio</th></tr>${sm.decs.slice(0,10).map(d=>`<tr><td>${esc(d.k)}</td><td>${d.n}</td><td>${Math.round(d.w*100)} %</td><td class="${d.m>=0?'up':'down'}">${d.m>=0?'+':''}${d.m.toFixed(2)}R</td></tr>`).join('')}</table></div>
  <p class="note" style="margin:8px 0 0"><b>Acciones automáticas:</b> ${acts.length?acts.map(esc).join(' · '):'ninguna todavía (solo actúa con pruebas claras)'}.</p>`;
}
function sigLate(){
  if(typeof renderStats==='function'&&!renderStats.__sig){const r0=renderStats;renderStats=function(){r0.apply(this,arguments);try{sigCard();}catch(e){}};renderStats.__sig=1;}
  if(typeof exportView==='function'&&!exportView.__sig){const e0=exportView;exportView=function(){const G=S.sig;if(G)S.sig={sum:G.sum,act:G.act};try{return e0.apply(this,arguments);}finally{if(G)S.sig=G;}};exportView.__sig=1;}
}
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('DOMContentLoaded',sigLate);
{const s0=sigTick;sigTick=function(){sigLate();return s0();};}
