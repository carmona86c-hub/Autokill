# Servidor de Automaton (Render, plan gratuito: 512 MB): cerebro Kronos + agente 24/7
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git tzdata && rm -rf /var/lib/apt/lists/*
# Node 22: trae WebSocket de serie para recibir los precios en directo (el de Debian es el 18 y no lo tiene)
# se copia de la imagen oficial de Node (verificada por Docker), no de una descarga suelta
COPY --from=node:22.11.0-bookworm-slim /usr/local/bin/node /usr/local/bin/node
RUN node -e "if(typeof WebSocket!=='function')process.exit(1)"
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir "numpy<2.3" pandas einops==0.8.1 huggingface_hub==0.33.1 safetensors tqdm starlette uvicorn
# versión fija de Kronos: un cambio de su autor no puede romper el servidor al actualizar
RUN git clone https://github.com/shiyu-coder/Kronos /opt/kronos && cd /opt/kronos && git checkout -q 67b630e67f6a18c9e9be918d9b4337c960db1e9a
ENV PYTHONPATH=/opt/kronos HF_HOME=/opt/hf OMP_NUM_THREADS=1 MALLOC_ARENA_MAX=2 WEB_DIR=/app/web/js AGENT_PORT=7000 TZ=Europe/Madrid
# el modelo se descarga al construir, así el servidor arranca rápido al despertar
RUN python -c "from huggingface_hub import snapshot_download as d; d('NeoQuasar/Kronos-mini'); d('NeoQuasar/Kronos-Tokenizer-2k')"
WORKDIR /app
# funciona tanto si Render construye desde la raíz del repositorio como desde la carpeta kronos
COPY . /src
RUN if [ -f /src/app.py ]; then cp /src/app.py /app/app.py; else cp /src/kronos/app.py /app/app.py; fi \
 && mkdir -p /app/web /app/agent \
 && if [ -d /src/js ]; then cp -r /src/js /app/web/js; fi \
 && if [ -f /src/agent/server.js ]; then cp /src/agent/server.js /src/agent/broker.js /app/agent/ 2>/dev/null || cp /src/agent/server.js /app/agent/server.js; fi \
 && rm -rf /src
# uvicorn sirve la API pública y vigila al agente (Node): si el agente se cae, lo vuelve a arrancar;
# al apagar, le avisa para que guarde su estado antes de salir
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000} --timeout-graceful-shutdown 25"]
