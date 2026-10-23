"""SESS AI service.

Existing YOLO parking-violation detection remains available at POST /detect.
A separate Roboflow worker reads a configured RTSP camera and periodically detects
license-plate bounding boxes. OCR / plate-text recognition is intentionally not
claimed here: the selected Roboflow model currently returns object detections.
"""
import base64
import io
import os
import tempfile
import threading
import time
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel
from ultralytics import YOLO
from paddleocr import PaddleOCR

MODEL_PATH = os.environ.get("MODEL_PATH", r"C:\Smart-EvaluationSensing-Statistical-System\models\best.pt")
CONF = float(os.environ.get("CONF", "0.5"))
LOW_CONF = float(os.environ.get("LOW_CONF", "0.5"))
VIDEO_FRAMES = int(os.environ.get("VIDEO_FRAMES", "8"))

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "").strip()
ROBOFLOW_MODEL_ID = os.environ.get("ROBOFLOW_MODEL_ID", "license-plate-recognition-rxg4e/11").strip()
RTSP_URL = os.environ.get("RTSP_URL", "").strip()
CAMERA_FRAME_INTERVAL = max(0.5, float(os.environ.get("CAMERA_FRAME_INTERVAL", "1.0")))
PLATE_CONFIDENCE = min(1.0, max(0.0, float(os.environ.get("PLATE_CONFIDENCE", "0.5"))))
OCR_CONFIDENCE_THRESHOLD = min(1.0, max(0.0, float(os.environ.get("OCR_CONFIDENCE_THRESHOLD", "0.85"))))

# Request models
class CameraStartRequest(BaseModel):
    rtspUrl: str = None

app = FastAPI(title="SESS AI")
model = YOLO(MODEL_PATH)
NAMES = model.names

# Initialize PaddleOCR for license plate text recognition (lazy load)
_ocr_reader = None
def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        _ocr_reader = PaddleOCR(use_angle_cls=True, lang='id')
    return _ocr_reader

# Dedicated state for the live license-plate worker; does not touch the existing YOLO model.
_camera_lock = threading.Lock()
_camera_thread = None
_camera_stop_event = threading.Event()
_camera_rtsp_url = RTSP_URL  # Session-based RTSP URL (can be overridden)
_camera_state = {
    "running": False,
    "configured": bool(RTSP_URL and ROBOFLOW_API_KEY),
    "status": "stopped",
    "message": "Kamera belum dijalankan",
    "cameraId": "gate-01",
    "modelId": ROBOFLOW_MODEL_ID,
    "lastFrameAt": None,
    "lastInferenceAt": None,
    "frame": None,
    "predictions": [],
    "error": None,
}


def _detections_from_result(result):
    out = []
    for box in result.boxes:
        cls = NAMES[int(box.cls)]
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        out.append({"class": cls, "confidence": round(float(box.conf), 4), "box": [x1, y1, x2 - x1, y2 - y1]})
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
    if img is None:
        raise ValueError("File tidak dapat dibaca sebagai gambar")
    result = model.predict(img, conf=CONF, iou=0.5, verbose=False)[0]
    detections = _detections_from_result(result)
    if not detections and LOW_CONF < CONF:
        result_low = model.predict(img, conf=LOW_CONF, iou=0.5, verbose=False)[0]
        detections = _detections_from_result(result_low)
    return detections


def _detect_video(path: str):
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    step = max(1, total // VIDEO_FRAMES)
    best, best_score, idx = [], -1, 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                result = model.predict(frame, conf=CONF, iou=0.5, verbose=False)[0]
                dets = _detections_from_result(result)
                if not dets and LOW_CONF < CONF:
                    result_low = model.predict(frame, conf=LOW_CONF, iou=0.5, verbose=False)[0]
                    dets = _detections_from_result(result_low)
                score = _summary(dets)["violation"] * 100 + len(dets)
                if score > best_score:
                    best, best_score = dets, score
            idx += 1
    finally:
        cap.release()
    return best


def _roboflow_client():
    if not ROBOFLOW_API_KEY:
        raise RuntimeError("ROBOFLOW_API_KEY belum dikonfigurasi di environment container")
    from inference_sdk import InferenceHTTPClient, InferenceConfiguration
    client = InferenceHTTPClient(api_url="https://serverless.roboflow.com", api_key=ROBOFLOW_API_KEY)
    return client.configure(InferenceConfiguration(api_key_transport="header"))


def _normalise_predictions(result):
    predictions = result.get("predictions", []) if isinstance(result, dict) else []
    output = []
    for item in predictions:
        try:
            confidence = float(item.get("confidence", 0))
            if confidence < PLATE_CONFIDENCE:
                continue
            output.append({
                "x": float(item.get("x", 0)),
                "y": float(item.get("y", 0)),
                "width": float(item.get("width", 0)),
                "height": float(item.get("height", 0)),
                "confidence": round(confidence, 4),
                "class": str(item.get("class", "license-plate")),
            })
        except (TypeError, ValueError):
            continue
    return output



def _infer_license_plate_image(data: bytes):
    """Run the Roboflow plate detector on one image, used by webcam frame uploads."""
    import numpy as np

    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Frame webcam tidak dapat dibaca sebagai gambar")

    client = _roboflow_client()
    result = client.infer(image, model_id=ROBOFLOW_MODEL_ID)
    predictions = _normalise_predictions(result)

    # Return a preview with plate boxes, independent of the local YOLO model.
    preview = image.copy()
    for p in predictions:
        x1 = int(p["x"] - p["width"] / 2)
        y1 = int(p["y"] - p["height"] / 2)
        x2 = int(p["x"] + p["width"] / 2)
        y2 = int(p["y"] + p["height"] / 2)
        cv2.rectangle(preview, (x1, y1), (x2, y2), (0, 220, 80), 2)
        cv2.putText(
            preview,
            f"plate {p['confidence']:.0%}",
            (max(0, x1), max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 220, 80),
            2,
        )

    max_width = 800
    if preview.shape[1] > max_width:
        new_height = int(preview.shape[0] * max_width / preview.shape[1])
        preview = cv2.resize(preview, (max_width, new_height))

    ok_preview, preview_jpg = cv2.imencode(
        ".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 70]
    )
    frame_b64 = (
        base64.b64encode(preview_jpg.tobytes()).decode("ascii")
        if ok_preview
        else None
    )
    return predictions, (
        f"data:image/jpeg;base64,{frame_b64}" if frame_b64 else None
    )


def _camera_worker():
    client = None
    cap = None
    last_inference = 0.0
    # Get current RTSP URL from session (can be overridden)
    with _camera_lock:
        rtsp_url = _camera_rtsp_url
    try:
        client = _roboflow_client()
        while not _camera_stop_event.is_set():
            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
                # Request a small buffer to reduce delay on supported RTSP streams.
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if not cap.isOpened():
                    with _camera_lock:
                        _camera_state.update(status="reconnecting", message="Tidak dapat membuka stream CCTV; mencoba kembali", error="RTSP stream tidak dapat dibuka")
                    _camera_stop_event.wait(3)
                    continue

            ok, frame = cap.read()
            if not ok or frame is None:
                cap.release()
                cap = None
                with _camera_lock:
                    _camera_state.update(status="reconnecting", message="Stream CCTV terputus; mencoba menyambungkan kembali", error="Gagal membaca frame CCTV")
                _camera_stop_event.wait(1)
                continue

            now = time.monotonic()
            with _camera_lock:
                _camera_state["lastFrameAt"] = datetime.now(timezone.utc).isoformat()
                _camera_state["error"] = None
                _camera_state["status"] = "running"
                _camera_state["message"] = "CCTV tersambung"

            # Inference is rate-limited so the service does not send every camera frame to Roboflow.
            if now - last_inference >= CAMERA_FRAME_INTERVAL:
                last_inference = now
                try:
                    ok_jpg, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                    if not ok_jpg:
                        raise RuntimeError("Gagal mengubah frame CCTV menjadi JPEG")
                    import numpy as np
                    image = cv2.imdecode(np.frombuffer(jpg.tobytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
                    result = client.infer(image, model_id=ROBOFLOW_MODEL_ID)
                    predictions = _normalise_predictions(result)
                    # Draw boxes for an optional preview. Coordinates are center-based in Roboflow output.
                    preview = frame.copy()
                    for p in predictions:
                        x1 = int(p["x"] - p["width"] / 2)
                        y1 = int(p["y"] - p["height"] / 2)
                        x2 = int(p["x"] + p["width"] / 2)
                        y2 = int(p["y"] + p["height"] / 2)
                        cv2.rectangle(preview, (x1, y1), (x2, y2), (0, 220, 80), 2)
                        cv2.putText(preview, f"plate {p['confidence']:.0%}", (max(0, x1), max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 220, 80), 2)
                    preview = cv2.resize(preview, (min(800, preview.shape[1]), int(preview.shape[0] * min(800, preview.shape[1]) / preview.shape[1])))
                    ok_preview, preview_jpg = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                    frame_b64 = base64.b64encode(preview_jpg.tobytes()).decode("ascii") if ok_preview else None
                    with _camera_lock:
                        _camera_state.update(
                            status="running",
                            message="Inferensi CCTV aktif",
                            modelId=ROBOFLOW_MODEL_ID,
                            lastInferenceAt=datetime.now(timezone.utc).isoformat(),
                            predictions=predictions,
                            frame=f"data:image/jpeg;base64,{frame_b64}" if frame_b64 else None,
                            error=None,
                        )
                except Exception as exc:
                    with _camera_lock:
                        _camera_state.update(status="error", message="Inferensi Roboflow gagal; worker akan mencoba lagi", error=str(exc))
                    _camera_stop_event.wait(1)
            else:
                _camera_stop_event.wait(0.03)
    except Exception as exc:
        with _camera_lock:
            _camera_state.update(status="error", message="Worker CCTV gagal dijalankan", error=str(exc))
    finally:
        if cap is not None:
            cap.release()
        with _camera_lock:
            _camera_state["running"] = False
            if _camera_state["status"] not in ("error", "stopped"):
                _camera_state.update(status="stopped", message="Kamera dihentikan")


@app.get("/health")
def health():
    return {"status": "ok", "classes": list(NAMES.values()), "licensePlate": {"configured": bool(ROBOFLOW_API_KEY), "cctvConfigured": bool(ROBOFLOW_API_KEY and RTSP_URL), "webcamConfigured": bool(ROBOFLOW_API_KEY), "modelId": ROBOFLOW_MODEL_ID}}


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    data = await file.read()
    is_video = (file.content_type or "").startswith("video") or (file.filename or "").lower().endswith((".mp4", ".mov", ".avi", ".mkv"))
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



@app.post("/license-plate/webcam/detect")
async def detect_license_plate_webcam_frame(file: UploadFile = File(...)):
    """Accept one frame captured by the user's browser webcam and detect plates."""
    if not ROBOFLOW_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ROBOFLOW_API_KEY belum dikonfigurasi di environment ai-service",
        )

    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Frame webcam harus berupa file gambar")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Frame webcam kosong")

    try:
        predictions, preview = _infer_license_plate_image(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Inferensi Roboflow gagal: {exc}",
        ) from exc

    return {
        "success": True,
        "source": "webcam",
        "modelId": ROBOFLOW_MODEL_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "predictions": predictions,
        "count": len(predictions),
        "frame": preview,
    }


@app.post("/license-plate/ocr")
async def extract_license_plate_text(file: UploadFile = File(...)):
    """Extract license plate text from an image using PaddleOCR."""
    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="File harus berupa gambar")
    
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File gambar kosong")
    
    try:
        # Decode image
        arr = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Gambar tidak dapat dibaca")
        
        # Run OCR
        reader = _get_ocr_reader()
        results = reader.ocr(image, cls=True)
        
        # Parse results: extract text and average confidence
        texts = []
        confidences = []
        for line in results:
            if line:
                for word_info in line:
                    text = word_info[1]
                    conf = float(word_info[2])
                    texts.append(text)
                    confidences.append(conf)
        
        # Combine texts and calculate average confidence
        plate_text = " ".join(texts).strip().upper()
        avg_confidence = float(np.mean(confidences)) if confidences else 0.0
        
        return {
            "success": True,
            "source": "ocr",
            "text": plate_text,
            "confidence": round(avg_confidence, 4),
            "char_count": len(plate_text),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OCR extraction gagal: {str(exc)}",
        ) from exc


@app.post("/license-plate/camera/start")
def start_license_plate_camera(payload: CameraStartRequest = None):
    global _camera_thread, _camera_rtsp_url
    
    # Get RTSP URL from request or fallback to env
    rtsp_url = (payload.rtspUrl if payload else None) or RTSP_URL
    rtsp_url = rtsp_url.strip() if rtsp_url else ""
    
    if not rtsp_url:
        raise HTTPException(status_code=400, detail="RTSP_URL belum dikonfigurasi (pass {\"rtspUrl\": \"...\"} di body atau set env RTSP_URL)")
    if not ROBOFLOW_API_KEY:
        raise HTTPException(status_code=400, detail="ROBOFLOW_API_KEY belum dikonfigurasi di environment ai-service")
    
    with _camera_lock:
        # Update session RTSP URL
        _camera_rtsp_url = rtsp_url
        
        if _camera_thread is not None and _camera_thread.is_alive():
            return {"success": True, "message": "Worker CCTV sudah berjalan", "data": _camera_state.copy()}
        _camera_stop_event.clear()
        _camera_state.update(running=True, configured=True, status="starting", message="Menghubungkan ke CCTV...", error=None, predictions=[], frame=None)
        _camera_thread = threading.Thread(target=_camera_worker, name="license-plate-camera", daemon=True)
        _camera_thread.start()
    return {"success": True, "message": "Worker CCTV dimulai", "data": {"status": "starting", "modelId": ROBOFLOW_MODEL_ID}}


@app.post("/license-plate/camera/stop")
def stop_license_plate_camera():
    _camera_stop_event.set()
    with _camera_lock:
        _camera_state.update(running=False, status="stopped", message="Kamera dihentikan")
    return {"success": True, "message": "Permintaan penghentian dikirim"}


@app.get("/license-plate/camera/status")
def license_plate_camera_status():
    with _camera_lock:
        state = _camera_state.copy()
        state["running"] = bool(_camera_thread and _camera_thread.is_alive() and not _camera_stop_event.is_set())
    return {"success": True, "data": state}
