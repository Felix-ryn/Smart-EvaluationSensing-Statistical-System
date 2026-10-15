"""SESS AI service — YOLOv8 parking violation detection.

Loads models/best.pt once and exposes POST /detect for images and short videos.
Classes: parking_violation, parking_normal.
"""
import io
import os
import tempfile

import cv2
from fastapi import FastAPI, File, UploadFile
from ultralytics import YOLO

MODEL_PATH = os.environ.get("MODEL_PATH", r"C:\Smart-EvaluationSensing-Statistical-System\models\best.pt")
CONF = float(os.environ.get("CONF", "0.5"))
LOW_CONF = float(os.environ.get("LOW_CONF", "0.3"))
VIDEO_FRAMES = int(os.environ.get("VIDEO_FRAMES", "8"))  # frames sampled from a video

app = FastAPI(title="SESS AI")
model = YOLO(MODEL_PATH)
NAMES = model.names  # {0: 'parking_violation', 1: 'parking_normal'}


def _detections_from_result(result):
    """Flatten one Ultralytics result into JSON-friendly detections."""
    out = []
    for box in result.boxes:
        cls = NAMES[int(box.cls)]
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        out.append(
            {
                "class": cls,
                "confidence": round(float(box.conf), 4),
                # box: [x, y, width, height], top-left origin
                "box": [x1, y1, x2 - x1, y2 - y1],
            }
        )
    return out


def _summary(detections):
    return {
        "violation": sum(d["class"] == "parking_violation" for d in detections),
        "normal": sum(d["class"] == "parking_normal" for d in detections),
    }


def _detect_image(data: bytes):
    import numpy as np

    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    # Pass 1: threshold normal (lebih ketat untuk mengurangi false positive).
    result = model.predict(img, conf=CONF, verbose=False)[0]
    detections = _detections_from_result(result)

    # Pass 2 (fallback): jika kosong total, longgarkan threshold.
    # Ini membantu kasus pelanggaran yang confidence-nya sedang.
    if not detections and LOW_CONF < CONF:
        result_low = model.predict(img, conf=LOW_CONF, verbose=False)[0]
        detections = _detections_from_result(result_low)

    return detections


def _detect_video(path: str):
    """Sample a few evenly-spaced frames; return detections from the frame with
    the most parking violations (fallback: most total detections)."""
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    step = max(1, total // VIDEO_FRAMES)
    best, best_score = [], -1
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            result = model.predict(frame, conf=CONF, verbose=False)[0]
            dets = _detections_from_result(result)

            # fallback per-frame jika kosong total
            if not dets and LOW_CONF < CONF:
                result_low = model.predict(frame, conf=LOW_CONF, verbose=False)[0]
                dets = _detections_from_result(result_low)

            score = _summary(dets)["violation"] * 100 + len(dets)
            if score > best_score:
                best, best_score = dets, score
        idx += 1
    cap.release()
    return best


@app.get("/health")
def health():
    return {"status": "ok", "classes": list(NAMES.values())}


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    data = await file.read()
    is_video = (file.content_type or "").startswith("video") or (
        file.filename or ""
    ).lower().endswith((".mp4", ".mov", ".avi", ".mkv"))

    if is_video:
        suffix = os.path.splitext(file.filename or "v.mp4")[1] or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            detections = _detect_video(tmp_path)
        finally:
            os.unlink(tmp_path)
    else:
        detections = _detect_image(data)

    return {"detections": detections, "summary": _summary(detections)}
