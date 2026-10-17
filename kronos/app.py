"""Cerebro Kronos para Automaton.

Recibe velas reales (las manda la app) y devuelve lo que Kronos prevé para las
próximas velas: rentabilidad media esperada, % de escenarios que acaban al alza y
rango. Varios escenarios independientes por activo para medir el acuerdo.
"""
import math
import os
import threading
import time

import numpy as np
import pandas as pd
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

MODEL = os.environ.get("KRONOS_MODEL", "NeoQuasar/Kronos-mini")
TOKENIZER = os.environ.get("KRONOS_TOKENIZER", "NeoQuasar/Kronos-Tokenizer-2k")
CONTEXT = 2048 if "mini" in MODEL.lower() else 512
FAKE = os.environ.get("KRONOS_FAKE") == "1"  # solo para pruebas locales sin el modelo
MAX_SERIES, MAX_SAMPLES, MAX_PRED, MIN_LEN, MAX_LEN = 8, 8, 24, 60, 300

state = {"ready": False, "error": None, "loaded_at": None, "model": MODEL, "calls": 0, "last_ms": None, "fake": FAKE}
predictor = None
infer_lock = threading.Lock()


class FakePredictor:
    """Paseo aleatorio con la volatilidad de la serie. Nunca se usa en producción."""

    def predict_batch(self, df_list, x_timestamp_list, y_timestamp_list, pred_len, **kw):
        out = []
        for df, ys in zip(df_list, y_timestamp_list):
            c = df["close"].to_numpy()
            vol = float(np.std(np.diff(np.log(c)))) or 1e-3
            p = c[-1] * np.exp(np.cumsum(np.random.normal(0.0002, vol, pred_len)))
            out.append(pd.DataFrame({"open": p, "high": p * (1 + vol), "low": p * (1 - vol), "close": p,
                                     "volume": 1.0, "amount": 1.0}, index=ys))
        return out


def load():
    global predictor
    try:
        if FAKE:
            predictor = FakePredictor()
        else:
            import torch
            torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS", "1")))
            from model import Kronos, KronosPredictor, KronosTokenizer
            tok = KronosTokenizer.from_pretrained(TOKENIZER)
            mdl = Kronos.from_pretrained(MODEL)
            predictor = KronosPredictor(mdl, tok, device="cpu", max_context=CONTEXT)
        state.update(ready=True, loaded_at=time.time(), error=None)
    except Exception as e:  # el estado lo verá la app en GET /
        state["error"] = repr(e)


threading.Thread(target=load, daemon=True).start()


def _clean(series):
    """Valida y normaliza la entrada; descarta lo que no sirva."""
    ok = []
    for s in series[:MAX_SERIES]:
        try:
            sid = str(s["id"])[:80]
            tf = int(s["tf_ms"])
            rows = [[float(x) for x in r[:6]] for r in s["candles"]][-MAX_LEN:]
        except Exception:
            continue
        if tf <= 0 or len(rows) < MIN_LEN:
            continue
        arr = np.array(rows, dtype=float)
        if not np.isfinite(arr).all() or (arr[:, 1:5] <= 0).any():
            continue
        ok.append((sid, tf, arr))
    return ok


def _forecast(items, pred_len, samples):
    n = min(len(a) for _, _, a in items)  # predict_batch necesita la misma longitud
    dfs, xts, yts, owners = [], [], [], []
    for sid, tf, arr in items:
        a = arr[-n:]
        df = pd.DataFrame(a[:, 1:6], columns=["open", "high", "low", "close", "volume"])
        df["amount"] = df["volume"] * df[["open", "high", "low", "close"]].mean(axis=1)
        xt = pd.Series(pd.to_datetime(a[:, 0], unit="ms"))
        last = int(a[-1, 0])
        yt = pd.Series(pd.to_datetime([last + tf * (i + 1) for i in range(pred_len)], unit="ms"))
        for _ in range(samples):  # escenarios independientes para medir el acuerdo
            dfs.append(df); xts.append(xt); yts.append(yt); owners.append(sid)
    preds = predictor.predict_batch(dfs, xts, yts, pred_len=pred_len, T=1.0, top_p=0.9, sample_count=1, verbose=False)
    out = {}
    for sid, tf, arr in items:
        c0 = float(arr[-1, 4])
        ps = [p for p, o in zip(preds, owners) if o == sid]
        closes = np.array([p["close"].to_numpy() for p in ps])
        final = closes[:, -1] / c0 - 1
        out[sid] = {
            "ret": round(float(final.mean()), 6),
            "up": round(float((final > 0).mean()), 4),
            "p25": round(float(np.percentile(final, 25)), 6),
            "p75": round(float(np.percentile(final, 75)), 6),
            "hi": round(float(max(p["high"].max() for p in ps) / c0 - 1), 6),
            "lo": round(float(min(p["low"].min() for p in ps) / c0 - 1), 6),
            "path": [round(float(x / c0 - 1), 6) for x in closes.mean(axis=0)],
            "n": len(ps),
        }
    return out


async def home(request: Request):
    return JSONResponse({"service": "automaton-kronos", **state})


async def forecast(request: Request):
    if not state["ready"]:
        return JSONResponse({"error": "modelo cargando" if not state["error"] else state["error"], **state}, status_code=503)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "JSON no válido"}, status_code=400)
    pred_len = max(1, min(MAX_PRED, int(body.get("pred_len", 6))))
    samples = max(2, min(MAX_SAMPLES, int(body.get("samples", 4))))
    items = _clean(body.get("series", []))
    if not items:
        return JSONResponse({"error": "sin series válidas (mínimo 60 velas)"}, status_code=400)
    t0 = time.time()

    def run():
        with infer_lock:
            return _forecast(items, pred_len, samples)

    try:
        res = await run_in_threadpool(run)
    except Exception as e:
        return JSONResponse({"error": repr(e)}, status_code=500)
    ms = int((time.time() - t0) * 1000)
    state["calls"] += 1
    state["last_ms"] = ms
    return JSONResponse({"model": MODEL, "fake": FAKE, "ms": ms, "pred_len": pred_len, "results": res})


AGENT = "http://127.0.0.1:" + os.environ.get("AGENT_PORT", "7000")


async def agent(request: Request):
    """Pasa /agent/... al agente 24/7 (Node, mismo contenedor)."""
    import urllib.error
    import urllib.request

    url = AGENT + request.url.path + (("?" + request.url.query) if request.url.query else "")
    body = await request.body() if request.method == "POST" else None

    def call():
        req = urllib.request.Request(url, data=body, method=request.method, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception as e:
            return 503, ('{"ok":false,"error":"el agente no responde (' + type(e).__name__ + ')"}').encode()

    code, data = await run_in_threadpool(call)
    return Response(data, status_code=code, media_type="application/json", headers={"Cache-Control": "no-store"})


app = Starlette(
    routes=[Route("/", home), Route("/forecast", forecast, methods=["POST"]),
            Route("/agent/{rest:path}", agent, methods=["GET", "POST"])],
    middleware=[Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"]),
                Middleware(GZipMiddleware, minimum_size=1000)],
)
