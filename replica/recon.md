# Recon map: Automaton / Autokill (PWA web, móvil primero)

Scope: la app completa (es pequeña): agente de trading simulado, panel, registro, estadísticas, linaje, ajustes, servidor 24/7 y servicio Kronos.
For: el propio dueño (reconstrucción limpia de su app). *Supuesto: confirmar si el objetivo es otro (producto para vender, nicho).*
Date: 2026-11-11

> Es la app del propio usuario: la fuente principal es su repositorio, no hay términos de terceros que impidan estudiarla.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | repositorio propio | github.com/carmona86c-hub/Autokill | `index.html`, `js/a1..a5.js` (~1.900 líneas), `agent/`, `kronos/` |
| 2 | historial de commits | mismo repo, 50 commits | lo último: IBKR, comisiones mínimas, desplegable de posiciones |
| 3 | API pública Binance contado | https://developers.binance.com/docs/binance-spot-api-docs | klines, exchangeInfo, ws `!miniTicker@arr` |
| 4 | API pública Binance Futuros | https://developers.binance.com/docs/derivatives/usds-margined-futures | `fapi`, financiación |
| 5 | API pública Hyperliquid | https://hyperliquid.gitbook.io/hyperliquid-docs | `/info` y ws |
| 6 | tarifas IBKR | https://www.interactivebrokers.com/en/pricing/commissions-stocks.php | escalonada / fija, mínimos |
| 7 | modelo Kronos | https://github.com/shiyu-coder/Kronos (HF `NeoQuasar/Kronos-mini`) | previsión de velas, código abierto |
| 8 | Telegram Bot API | https://core.telegram.org/bots/api | avisos y copias |

## Core loop

Fijar un capital ficticio y dejar que el agente opere solo con precios reales, explicando cada decisión (también las que rechaza), y aprender de cada activo.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S00 | Cabecera fija | siempre visible | patrimonio total, PnL, chips conexión y nivel | big number, chips, tiles, desplegables Modo y Posiciones | conectado/desconectado, normal/low_compute/critical/dead, sin posiciones |
| S01 | Panel | pestaña Panel (inicio) | capital, control del agente, mercados | input capital, botones Pausar / Reevaluar, lista posiciones, mercados vigilados, diagnóstico, cotizaciones, radar | vacío (sin posiciones), lleno, mercado cerrado, banner error de red, pausado |
| S02 | Registro | pestaña Registro | todas las decisiones con motivo | lista de eventos por tipo (compra, venta, rechazo, pausa, info) | vacío, lleno (máx. 500) |
| S03 | Estadísticas | pestaña Estadísticas | resultados por agente | selector agente, KPIs, gráfico patrimonio (canvas), tablas operaciones / órdenes / experiencia, informe copiable | sin operaciones, lleno, modo IBKR vs exchanges |
| S04 | Linaje | pestaña Linaje | replicación de agentes | constitución + huella, formulario replicar, control de hijos, tarjetas de linaje, cementerio | sin hijos, hijos en cada estado de vida, límite alcanzado, cementerio oculto/visible |
| S05 | Ajustes | pestaña Ajustes | toda la configuración | tarjetas: Servidor 24/7, Broker, Mercado y costes, Mercados, Kronos, Replicación, Parámetros, Avisos, Dispositivo y copias, Constitución | local vs remoto, Kronos off/ok/error, Telegram sin configurar/ok |
| S06 | Barra de pestañas | fija abajo | navegación | 5 tabs | pestaña activa |
| S07 | API servidor 24/7 | `/agent/health`, `/agent/state`, `/agent/cmd` | sin pantalla; el móvil la usa | — | sin clave, clave errónea, agente no responde (503) |
| S08 | API Kronos | `/`, `POST /forecast` | previsión | — | modelo cargando (503), series inválidas (400) |

## Flows

```
F01 Empezar a operar
    S01 escribir capital -> "Fijar y reiniciar" -> el agente escanea -> posiciones en S00/S01
    happy path clicks: 2
    edge: capital < 20, sin red (banner), todos los mercados cerrados, comisión mínima > ganancia esperada

F02 Entender por qué no compra
    S01 Radar del mercado -> S02 Registro (motivos de rechazo)
    happy path clicks: 1
    edge: rechazos repetidos (se deduplican 30 min), Kronos pendiente

F03 Revisar resultados y mandar informe
    S03 elegir agente -> KPIs/gráfico -> "Copiar informe"
    happy path clicks: 2
    edge: portapapeles bloqueado (se muestra textarea)

F04 Replicar un agente
    S04 elegir padre / especialidad / financiación -> "Replicar ahora" -> ciclo creando → vivo
    happy path clicks: 1-4
    edge: máx. 3 hijos vivos o 3 generaciones, fondos insuficientes, hijo enfermo / muerto, huella de constitución distinta

F05 Pasar el agente al servidor 24/7
    S05 URL + clave -> "Pasar mi agente al servidor" -> el móvil queda como pantalla remota
    happy path clicks: 3
    edge: clave errónea, servidor dormido (Render gratis), sin GITHUB_TOKEN (solo memoria), volver a "Usar el de este dispositivo"

F06 Activar Kronos
    S05 URL Kronos -> modo -> "Probar Kronos" -> Guardar
    happy path clicks: 3
    edge: modelo cargando, timeout, servidor caído (el agente sigue con reglas)

F07 Configurar avisos Telegram
    S05 token -> escribir al bot -> "Buscar mi chat" -> "Enviar prueba"
    happy path clicks: 3 (+ fuera de la app)
    edge: token inválido, chat no encontrado

F08 Copia y restauración entre dispositivos
    S05 "Enviar copia a Telegram" -> en otro dispositivo "Restaurar desde archivo" o "Pegar copia"
    happy path clicks: 2 + 2
    edge: JSON inválido, versión antigua (migrate), dos dispositivos operando a la vez

F09 Cambiar broker a IBKR
    S05 Broker = IBKR, tarifa -> Guardar -> solo activos permitidos, experiencia por activo desde cero
    happy path clicks: 3
    edge: cuenta < $2.000 sin cortos, efectivo pendiente de liquidar
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primario (`pri`), normal, aviso (`warn`), tile-botón | default, disabled | todas |
| Chip | conexión (live/off), nivel (normal, low_compute, critical, dead) | — | S00, S01 |
| Tile | estático, botón con desplegable | cerrado/abierto (`aria-expanded`) | S00 |
| Dropdown panel | Modo, Posiciones | hidden/visible | S00 |
| Card | normal, `cap`, `const` | — | todas |
| Field (label + input/select/textarea) | number, url, password con ojo, select, file | vacío, relleno | S01, S04, S05 |
| Banner | error de red | oculto / visible con Reintentar / Copiar instrucciones | S01 |
| Tabla (`.tw`) | operaciones, órdenes, experiencia, cotizaciones, cementerio | vacía / llena | S01, S03, S04 |
| Gráfico canvas | patrimonio, mini-gráfico de posición, sparkline | sin datos / con datos | S00, S03 |
| Entrada de registro | compra, venta, rechazo, pausa, info, vida | — | S02 |
| Tarjeta de agente (linaje) | por estado de vida | 8 estados | S04 |
| Details/summary | constitución, cotizaciones | plegado / abierto | S01, S04 |
| Tab bar | 5 pestañas | seleccionada | S06 |

Tokens actuales: tema claro/oscuro (`--bg --panel --line --fg --mute --money --up --down --info --chip`), fuentes Bricolage Grotesque + IBM Plex Mono.

## Inferred data model

Todo vive en un único documento JSON (`localStorage` clave `automaton.app.real.v1` + IndexedDB; en servidor, `agent.json` en la rama `estado`). Confianza alta: leído del código.

```
State     v, initial, startedAt, lastSeen, running, nextId, log[], exp{}, orders[], settings, agents[]
          evidence: fresh(), valid(), migrate() en js/a1-a2   confidence: high

Settings  fee, slip, maxDay, universe, tf (1m|5m|15m), repl, maxKids, shorts, cryptoFut,
          markets{BN,BF,HL}, kronos{url,mode off|filter|full}, broker (ibkr|ex), ibPlan (tiered|fixed),
          device; flags de migración (maxOpenV, noResV…)
          evidence: S05, buildSettings/applySettings   confidence: high

Agent     id, name, gen, parentId, born, spec, params{riskPct,maxPosPct,maxPos,emaF,emaS,rsiMin,rsiMax,
          stopATR,tpATR,trailATR,minScore,maxHold}, initial, seed, cash, reserve, swept, peak, maxDD,
          dayStart, status (alive|dead), tier (normal|low_compute|critical|dead),
          life (spawning|provisioning|configuring|starting|alive|unhealthy|recovering|dead),
          positions[], closed[], cooldown{sym:t}, hist[[t,equity]], events[], inbox[],
          genesis{name,spec,msg}, constitution, constHash, evo{ver,at,last,hist,prev,check}
          evidence: newAgent() a1.js:322, LIFE/TIER   confidence: high

Position  sym (prefijo fuente BN:|BF:|HL:), side (long|short), tf, entry, qty, qty0, stop, tp, openedAt,
          taken (mitad asegurada), kr (confirmada por Kronos)   confidence: medium (campos parciales vistos)

Trade     sym, side, tf, entry, exit, qty, pnl, pct, reason, t0, t1, kr, user
          evidence: closePos a2.js:358   confidence: high

Order     t, ag, sym, venue, kind, side, qty, price, fee, mode ('simulada'), req (ticket real), ack?
          evidence: logOrder a2.js:263   confidence: high

Experience  por sym: n, w, pnl, sumPct   (ajuste ±15 de puntuación, veto si n≥6, pnl<0, winrate<35 %)
          evidence: xp() a2.js:442   confidence: high

LogEntry  t, a (agente o "Sistema"), type, msg   (máx. 500; rechazos deduplicados 30 min)
          confidence: high

NotifSettings  token, chat, ops, daily, bk, sys   (aparte, solo en el dispositivo)   confidence: high
Market (en memoria, no se guarda)  universe[], precios, k[tf][sym] velas, sesiones, err
```

Relationships: State 1-n Agent; Agent 1-n Agent (parentId, máx. 3 vivos, 3 generaciones); Agent 1-n Position, 1-n Trade; State 1-n Order, 1-n LogEntry; Experience por símbolo compartida por todos los agentes.

## Feature matrix

See `features.csv`. Must: 24, should: 20, could: 9 (de ellas 3 marcadas skip).

## Out of scope (cannot or should not be cloned)

- Los datos de mercado: son de Binance / Hyperliquid; se consumen por API pública, no se replican.
- El modelo Kronos: es de terceros (código abierto); se despliega tal cual, no se reentrena.
- Órdenes con dinero real: el conector Binance está preparado y **desactivado**; la reconstrucción lo mantiene apagado salvo decisión expresa. Hyperliquid real no existe (firma de cartera).
- Licencias reguladas: si algún día se ofrece a terceros con dinero real, entra en asesoramiento/gestión de inversiones (regulado).

## Size

Screens 6 (+2 APIs), flows 9, entities 8.
Hard parts:
1. Motor de simulación fiel: reglas por exchange e IBKR (lotes, mínimos, comisión mínima, liquidación T+1, financiación de perpetuos).
2. Horarios reales de mercado con festivos (NYSE, CME) y cierre previo.
3. El mismo código corriendo en navegador y en servidor (DOM falso con `vm`), con estado remoto y sincronización.
4. Auto-mejora / backtest de variantes y replicación con ciclo de vida.
5. Datos en tiempo real por WebSocket de 3 fuentes con respaldo.

Size: **M** (unas semanas) para rehacer el núcleo limpio; **L** si se incluye todo (linaje, auto-mejora, IBKR, servidor 24/7).
