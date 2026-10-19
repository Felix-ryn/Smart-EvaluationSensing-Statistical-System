FROM python:3.11-slim

# OpenCV runtime deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# Pin a compatible torch/torchvision CPU pair so ultralytics can't swap torch
# to a mismatched build (cause of "torchvision::nms does not exist").
RUN pip install --no-cache-dir -r requirements.txt \
      torch==2.2.2 torchvision==0.17.2 \
      --extra-index-url https://download.pytorch.org/whl/cpu

COPY main.py .

ENV MODEL_PATH=/models/best.pt
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
