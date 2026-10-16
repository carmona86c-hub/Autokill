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
      if(Date.now()>=(p.until||p.openedAt+P.maxHold*TF_MS[S.settings.tf]))closePos(a,p,'tiempo máximo');
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
   chequeos de salud, mensajes padre-hijo con límites, financiación desde la reserva y retirada de hijos muertos.
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
const childFund=a=>Math.max(20,.15*a.initial);
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
  if(a.reserve<fund)return `reserva insuficiente (${money(a.reserve)} de ${money(fund)})`;
  const id=S.nextId;
  g=Object.assign({name:`Automaton-${a.gen+1}.${id}`,spec:pickSpec(a),msg:`Hijo de ${a.name}. Especialízate y sobrevive: gana tu existencia respetando la constitución.`},g||{});
  g.name=String(g.name).trim();
  const bad=validGenesis(g);if(bad){if(!manual)L(a,'info',`Replicación cancelada: ${bad}.`);return bad;}
  S.nextId++;
  const c=newAgent({id,name:g.name,gen:a.gen+1,parentId:a.id,params:mutate(a.params),initial:0,cash:0,peak:0,status:'starting',life:null,events:[],inbox:[],spec:g.spec,genesis:{name:g.name,spec:g.spec,msg:g.msg,at:Date.now(),parent:a.name},constitution:null,constHash:null,lifeAt:Date.now()});
  lifeEvt(c,'spawning',`génesis validada · especialidad ${g.spec}`);
  S.agents.push(c);
  a.reserve-=fund;c.initial=fund;c.cash=fund;c.peak=fund;c.hist=[[Date.now(),fund]];
  a.lastSpawn=Date.now();
  L(a,'spawn',`Replicación${manual?' manual':''}: nace ${c.name} (${g.spec}) con ${money(fund)} de la reserva de ${a.name}, con parámetros mutados.`);
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
function refund(c){const par=agentById(c.parentId);if(!par||c.positions.length)return;const x=c.cash+c.reserve;if(x>0){c.cash=0;c.reserve=0;par.reserve+=x;}}
/* fund_child: de la reserva del padre a la cartera del hijo (sube su capital, no es beneficio) */
function fundChild(par,c,amt){
  amt=+amt;if(!(amt>0))return 'cantidad no válida';
  if(c.parentId!==par.id)return 'no es hijo suyo';
  if(c.status==='dead')return 'el hijo ya está muerto';
  if(par.reserve<amt)return `reserva insuficiente (${money(par.reserve)})`;
  par.reserve-=amt;c.cash+=amt;c.initial+=amt;c.peak=Math.max(c.peak,total(c));
  L(par,'fund',`Financia a ${c.name} con ${money(amt)} de su reserva (capital del hijo: ${money(c.initial)}).`);
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
function childReport(c){const s=stats(c);return `Informe: ${LIFE_LAB[c.life]}, nivel ${c.tier}, operativo ${money(eq(c))}, resultado ${pct(s.ret)}, ${s.n} operaciones${s.n?', '+(s.hit*100).toFixed(0)+'% aciertos':''}, enviado al padre ${money(c.swept)}.`;}
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
/* prune_dead_children: retira los hijos muertos; su dinero restante vuelve a la reserva del padre
   y su historial queda en el cementerio (la experiencia de mercado ya está en S.exp) */
function pruneDead(manual){
  const dead=S.agents.filter(a=>a.parentId!=null&&a.status==='dead'&&!a.positions.length&&(manual||Date.now()-(a.diedAt||0)>=24*3600e3));
  if(!dead.length)return 0;
  S.graveyard=S.graveyard||[];
  dead.forEach(d=>{
    let par=agentById(d.parentId);while(par&&par.status==='dead'&&par.parentId!=null&&dead.includes(par))par=agentById(par.parentId);
    par=par||S.agents[0];
    const left=d.cash+d.reserve;par.reserve+=left;d.cash=0;d.reserve=0;
    kidsOf(d).forEach(k=>{k.parentId=par.id;});
    const s=stats(d);
    S.graveyard.unshift({id:d.id,name:d.name,gen:d.gen,parent:par.name,spec:d.spec,born:d.born,died:d.diedAt,initial:d.initial,trades:s.n,hit:s.hit,pnl:d.closed.reduce((t,c)=>t+c.pnl,0),ret:s.ret,swept:d.swept,returned:left,events:(d.events||[]).slice(0,10),why:(d.events||[])[0]?.why||''});
    S.agents.splice(S.agents.indexOf(d),1);
    L(par,'life',`${d.name} retirado del linaje${left>0.005?`: ${money(left)} vuelven a la reserva de ${par.name}`:''}.`);
  });
  if(S.graveyard.length>50)S.graveyard.length=50;
  return dead.length;
}
function maybeSpawn(a){
  const s=S.settings;if(!s.repl||canSpawn(a))return;
  const fund=childFund(a);
  if(a.reserve<fund*2||Date.now()-a.lastSpawn<6*3600e3)return;
  spawnChild(a,null,fund,false);
}
function maybeEvolve(a){
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

