# Qué odian los usuarios de bots parecidos y qué cambia en Automaton

Muestra: 21 citas de 4 fuentes (Trustpilot de 3Commas y Pionex, foro de Gainium, HackerNoon, incidencias en IsDown). Muestra pequeña: marca una dirección, no un ranking. Detalle con enlaces en `feedback.md` y `reviews.csv`.

## Lo que odian
1. **El bot se para o no coloca órdenes y no te enteras** (IsDown, 3Commas: «trades not being placed», «major outage»). A Automaton le pasó: 16 días parado. → Aviso visible + despertador.
2. **Las comisiones se comen el resultado** («watch you bleed fees», «Their fees are high»). En Automaton: $90 en comisiones frente a −$168 de resultado. → Comisiones visibles en Estadísticas y en el informe.
3. **No entiendes lo que hace el bot** («If you don't understand how the bot trades…»). Automaton ya registra cada decisión con su motivo: se mantiene.
4. **El trailing no salta como debe** («trailing is not triggered properly»). Revisado: el trailing y las esperas ahora usan el marco correcto de cada operación.
5. **Backtest y simulación no coinciden** (foro de Gainium). Automaton valida la automejora en dos periodos y deshace cambios que pierden en real; queda pendiente una vista lado a lado.

## Plan aplicado
| mejora | tamaño | evidencia | estado |
| --- | --- | --- | --- |
| Esperas en velas de la propia operación | S | B1, 16 ops | hecho |
| Sin doble exposición al mismo activo | S | B2, 8 casos | hecho |
| Alerta de servidor parado + despertar | S | B3 + IsDown | hecho |
| Despertador de GitHub Actions activo | S | B3 | listo en extra/, falta copiarlo a .github/workflows |
| Comisiones a la vista | S | HackerNoon, Pionex, datos propios | hecho |
| Contraste AA en modo claro | S | contrast.py | hecho |
| Simulado vs real lado a lado | M | Gainium | pendiente |

## Ángulo
Para quien quiere un bot que no se pare en silencio ni esconda lo que cobra: Automaton avisa en cuanto deja de operar y muestra cada decisión y cada comisión.
