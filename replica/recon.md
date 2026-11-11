# Recon de Automaton (la propia app, para mejorarla, no para copiarla)

Fuentes: el código de este repositorio, el estado real del agente (rama `estado`, `agent.json`, guardado el 26-10-2026 02:53 UTC) y la app publicada.

## Bucle principal
El agente vigila mercados con precios reales, abre operaciones simuladas con las comisiones y reglas de IBKR, las gestiona con stop, toma parcial, trailing y tiempo máximo, y aprende de cada cierre (experiencia por activo y automejora de reglas).

## Pantallas
| ID | pantalla | cómo se llega | propósito | estados |
| --- | --- | --- | --- | --- |
| S01 | Panel | pestaña Panel | capital, posiciones, mercados, radar | sin datos, sin red (netBan), servidor parado (srvBan, nuevo) |
| S02 | Registro | pestaña Registro | cada decisión con su motivo | vacío, filtrado |
| S03 | Estadísticas | pestaña Estadísticas | curva, KPIs, operaciones, órdenes, informe, experiencia | sin operaciones |
| S04 | Linaje | pestaña Linaje | replicar, financiar hijos, cementerio | sin hijos |
| S05 | Ajustes | pestaña Ajustes | servidor 24/7, broker, costes, mercados, Kronos, parámetros, avisos, copias | servidor conectado / caído |

## Flujos
- F01 Ver el agente 24/7 desde el móvil: S05 conectar → S01 (2 toques). Caso límite: servidor dormido o suspendido.
- F02 El agente opera: escanea → decide → abre → gestiona → cierra → aprende (sin intervención).
- F03 Revisar resultados: S03 KPIs → informe → copiar.
- F04 Replicar un agente: S04 → padre, financiación → Replicar.
- F05 Cambiar capital o broker: S05 → guardar.

## Datos (ya en el código)
Estado `S` → agentes (cash, posiciones, cerradas, parámetros, evo), log, exp por activo, órdenes (formato IBKR), lab, ajustes. Persistencia: localStorage en el dispositivo y GitHub (rama `estado`) en el servidor.

## Lo que muestran los datos reales (19-oct → 26-oct)
- 68 operaciones cerradas, 13 ganadoras (19 %), resultado −$167,98 sobre $2.000.
- Las 16 operaciones con velas de 1 h: 0 ganadoras, todas cerradas a los ~85 min por «sin avance» (16 velas de 5 min en vez de 16 de 1 h).
- 8 veces la misma acción abierta dos veces a la vez por dos vías (BF y HL): NVDA, AMD, CL, NBIS, TSLA, SOXL, SKHY. Neto −$35,8.
- Comisiones en las últimas 148 órdenes: $89,99.
- El servidor dejó de guardar el 26-10 02:53 UTC y no ha vuelto (16 días parado sin ningún aviso). El despertador de GitHub Actions estaba en `extra/` y nunca se activó.

## Fuera de alcance
Dinero real (prohibido por ahora), bots de rejilla/DCA, mercado de señales.

Tamaño de la mejora: S.
