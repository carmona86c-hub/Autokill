'use strict';
/* Conector de órdenes reales — PREPARADO Y DESACTIVADO.
   El servidor solo lo carga si en Render existe LIVE_TRADING=si, y además el modo real tiene que activarse expresamente.
   Hoy no se carga: todas las órdenes se simulan dentro de la app con las mismas reglas del exchange.
   Antes de usarlo con dinero: probar con cantidades mínimas, claves SIN permiso de retirada y confirmación expresa del dueño.

   - Binance contado y Futuros: firma HMAC-SHA256 con BINANCE_KEY / BINANCE_SECRET.
   - Hyperliquid: necesita firmar con una cartera (EIP-712, clave de agente). Pendiente: no se envía nada a Hyperliquid. */
const crypto = require('crypto');
const KEY = process.env.BINANCE_KEY || '', SECRET = process.env.BINANCE_SECRET || '';
const HOST = { '/api/': 'https://api.binance.com', '/sapi/': 'https://api.binance.com', '/fapi/': 'https://fapi.binance.com' };

function sign(params) {
  const q = new URLSearchParams(Object.assign({}, params, { timestamp: Date.now(), recvWindow: 5000 })).toString();
  return q + '&signature=' + crypto.createHmac('sha256', SECRET).update(q).digest('hex');
}
async function send(order, log) {
  const r = order && order.req; if (!r) return;
  const [method, path] = r.api.split(' ');
  if (!path || !path.startsWith('/')) { log('Sin envío: ' + r.api); return; }
  if (path.startsWith('/iserver/')) { log('Orden real NO enviada: IBKR aún no está conectado:', order.sym); return; }
  /* de /sapi/ solo se permite la transferencia interna Spot <-> Funding (apartar beneficio); nunca retiradas */
  if (path.startsWith('/sapi/') && path !== '/sapi/v1/asset/transfer') { log('Orden real NO enviada: ruta no permitida', path); return; }
  if (!path.startsWith('/api/') && !path.startsWith('/fapi/') && !path.startsWith('/sapi/')) { log('Orden real NO enviada (Hyperliquid aún no tiene firma de cartera):', order.sym); return; }
  if (!KEY || !SECRET) { log('Orden real NO enviada: faltan BINANCE_KEY / BINANCE_SECRET'); return; }
  const host = HOST[path.startsWith('/fapi/') ? '/fapi/' : path.startsWith('/sapi/') ? '/sapi/' : '/api/'];
  const res = await fetch(host + path + '?' + sign(r.p), { method, headers: { 'X-MBX-APIKEY': KEY } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Binance ' + res.status + ' ' + (j.msg || ''));
  order.ack = j.tranId ? { id: j.tranId, status: 'transferido' } : { id: j.orderId, status: j.status, filled: j.executedQty, avg: j.avgPrice || j.cummulativeQuoteQty };
  log('Orden real enviada:', order.sym, order.kind, j.orderId, j.status);
}
module.exports = { send };
