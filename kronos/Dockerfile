# Servidor de Automaton (Render, plan gratuito: 512 MB): cerebro Kronos + agente 24/7
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git tzdata && rm -rf /var/lib/apt/lists/*
# Node 22: trae WebSocket de serie para recibir los precios en directo (el de Debian es el 18 y no lo tiene)
RUN python -c "import urllib.request as u;u.urlretrieve('https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.gz','/tmp/n.tgz')" \
 && tar -xzf /tmp/n.tgz -C /opt && ln -s /opt/node-v22.11.0-linux-x64/bin/node /usr/local/bin/node && rm /tmp/n.tgz && node -e "if(typeof WebSocket!=='function')process.exit(1)"
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir "numpy<2.3" pandas einops==0.8.1 huggingface_hub==0.33.1 safetensors tqdm starlette uvicorn
RUN git clone --depth 1 https://github.com/shiyu-coder/Kronos /opt/kronos
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
# el agente (Node) y Kronos/API pública (uvicorn); al apagar, el agente guarda su estado antes de salir
CMD ["sh", "-c", "U=0; N=0; if [ -f /app/agent/server.js ]; then node /app/agent/server.js & N=$!; fi; uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000} & U=$!; trap 'kill -TERM $U $N 2>/dev/null; wait $N' TERM INT; wait $U"]
