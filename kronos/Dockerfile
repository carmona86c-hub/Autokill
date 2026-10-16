# Cerebro Kronos para Automaton (Render, plan gratuito: 512 MB)
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir "numpy<2.3" pandas einops==0.8.1 huggingface_hub==0.33.1 safetensors tqdm starlette uvicorn
RUN git clone --depth 1 https://github.com/shiyu-coder/Kronos /opt/kronos
ENV PYTHONPATH=/opt/kronos HF_HOME=/opt/hf OMP_NUM_THREADS=1 MALLOC_ARENA_MAX=2
# el modelo se descarga al construir, así el servidor arranca rápido al despertar
RUN python -c "from huggingface_hub import snapshot_download as d; d('NeoQuasar/Kronos-mini'); d('NeoQuasar/Kronos-Tokenizer-2k')"
WORKDIR /app
# funciona tanto si Render construye desde la raíz del repositorio como desde la carpeta kronos
COPY . /src
RUN if [ -f /src/app.py ]; then cp /src/app.py /app/app.py; else cp /src/kronos/app.py /app/app.py; fi && rm -rf /src
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000}"]
