# Bugs encontrados (reproducidos con datos reales)

## B1 · S2 · Las operaciones de 15 min y 1 h se cerraban demasiado pronto
- Pasos: el agente abre con señal de velas de 1 h; pasan 80 min sin avanzar.
- Esperado: esperar 16 velas de 1 h (16 h) antes de «sin avance».
- Real: se cerraba a los ~85 min (16 velas de 5 min, el marco de ajustes).
- Evidencia: 16 de 16 operaciones de 1 h cerradas así, 0 ganadoras, −$56,27.
- Arreglo: `js/a3.js`, la espera usa las velas de la propia operación. Estado: corregido.

## B2 · S2 · Misma acción abierta dos veces por dos vías
- Pasos: hay señal en BF:NVDAUSDT y en HL:xyz:NVDA a la vez.
- Esperado: una sola posición en NVDA.
- Real: abría las dos (doble riesgo y doble comisión).
- Evidencia: 8 solapamientos, neto −$35,80.
- Arreglo: `js/a2.js`, «ya en cartera» compara el activo subyacente en todos los mercados. Estado: corregido.

## B3 · S1 · El servidor 24/7 se paró y nadie se enteró
- Evidencia: último guardado del agente el 26-10-2026 02:53 UTC; 16 días sin operar ni vigilar stops.
- Causa probable: el plan gratuito de Render (750 h al mes para todos los servicios) y el despertador de GitHub sin activar (estaba en `extra/`).
- Arreglo: aviso rojo en el Panel con la hora del último guardado, notificación y Telegram, botón «Despertar», y el despertador listo en `extra/despertar.yml` (hay que copiarlo a `.github/workflows/` desde la web de GitHub: el acceso que uso no puede escribir flujos de trabajo). Estado: corregido en la app; el servidor hay que reanudarlo en Render.

## B4 · S4 · Colores del modo claro con poco contraste
- 9 combinaciones por debajo de WCAG AA (verde, rojo, ámbar y azul sobre fondo claro).
- Arreglo: tonos más oscuros en `index.html`. Estado: corregido (0 fallos).
