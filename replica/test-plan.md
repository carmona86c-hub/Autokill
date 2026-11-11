# Plan de pruebas

| caso | flujo | comprobación | resultado |
| --- | --- | --- | --- |
| F02-H1 | operar 120 ciclos con precios simulados | dinero cuadra al céntimo (invariante = 0) | OK |
| F02-H2 | comisiones por operación | suma de órdenes = comisión registrada en cada cierre | OK (0 diferencias) |
| F02-E1 | posición de 1 h a los 90 min sin avance | sigue abierta | OK (antes se cerraba) |
| F02-E2 | posición de 1 h tras 17 h sin avance | se cierra por «sin avance» | OK |
| F02-E3 | misma acción por otra vía (BF/HL) | «ya en cartera» | OK (antes la abría) |
| F02-E4 | posiciones abiertas | ningún subyacente repetido | OK |
| F01-E1 | servidor no responde | aviso rojo en el Panel + notificación | OK |
| F01-E2 | servidor vuelve | aviso desaparece | OK |
| F03-H1 | Estadísticas | KPIs «Comisiones pagadas» y «Sin comisiones habría sido» | OK |
| F03-H2 | Informe | línea COMISIONES | OK |
| SRV-H1 | servidor Node en modo simulado | arranca, /agent/health y /agent/state responden | OK |
| UI-1 | contraste modo claro y oscuro | 0 pares por debajo de AA | OK (antes 9 fallos en claro) |

Errores de consola durante las pruebas: 0.
