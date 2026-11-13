"""SESS AI service.

Existing YOLO parking-violation detection remains available at POST /detect.
A separate Roboflow worker reads a configured RTSP camera and periodically detects
license-plate bounding boxes. OCR / plate-text recognition is intentionally not
claimed here: the selected Roboflow model currently returns object detections.
"""
import base64
import io
import os
import re
import tempfile
import threading
import time
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
from paddleocr import PaddleOCR
from inference_sdk import InferenceHTTPClient

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
model = YOLO(MODEL_PATH)
NAMES = model.names

# Initialize PaddleOCR for license plate text recognition (lazy load)
_ocr_reader = None
def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        _ocr_reader = PaddleOCR(use_angle_cls=True, lang='id')
    return _ocr_reader


# Warm-up: load models on startup so first request is not slow.
def _warmup():
    """Pre-load OCR and detection models on startup."""
    try:
        print("[Warmup] Loading OCR model...")
        reader = _get_ocr_reader()
        # Dummy inference on a minimal black image.
        dummy_img = np.zeros((50, 100, 3), dtype=np.uint8)
        reader.predict(dummy_img)
        print("[Warmup] OCR model loaded successfully")
    except Exception as e:
        print(f"[Warmup] OCR warmup failed (non-fatal): {e}")

# Run warmup once at module load.
_warmup()


# Expiry-date pattern like "11.31", "11-31", "11 31" (with possible month/year
# prefix/suffix). We strip it defensively before normalizing whitespace.
_EXPIRY_RE = re.compile(r"\b\d{1,2}\s*[\.\-\s/]\s*\d{1,2}\b")

# Indonesian plate: 1-2 region letters + 1-4 digits + 1-3 letters (with optional spaces).
_PLATE_RE = re.compile(r"^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$")

# Pattern to extract plate from concatenated OCR text (with word boundaries).
# Matches: 1-2 letters, 1-4 digits, 1-3 letters, with optional spaces between.
_PLATE_EXTRACT_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{1,2})\s?(\d{1,4})\s?([A-Z]{1,3})(?![A-Z0-9])")


def _valid_plate_format(plate: str) -> bool:
    """True when the normalized plate matches the Indonesian format."""
    if not plate:
        return False
    return bool(_PLATE_RE.match(plate))


def extract_plate(texts):
    """Extract plate from a list of OCR-recognized texts.
    
    Concatenates all texts, normalizes to uppercase, replaces non-alphanumeric
    with spaces, then searches for the plate pattern. Returns "R NNNN X" or
    "RR NNNN XXX" if found, None otherwise.
    """
    if not texts:
        return None
    joined = " ".join(str(t) for t in texts).upper()
    joined = re.sub(r"[^A-Z0-9]+", " ", joined)  # dots, tildes, etc. → spaces
    m = _PLATE_EXTRACT_RE.search(joined)
    if not m:
        return None
    return f"{m.group(1)} {m.group(2)} {m.group(3)}"


def clean_plate_text(text: str) -> str:
    """Normalize a raw OCR line into a canonical Indonesian plate string.

    Removes the expiry-date fragment (e.g. "B 5857 FFT 11.31" -> "B 5857 FFT")
    and collapses to upper-case with single spaces. Returns "" when nothing
    plate-like remains.
    """
    cleaned = _EXPIRY_RE.sub(" ", text or "")
    cleaned = re.sub(r"[^A-Za-z0-9]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().upper()
    return cleaned


def select_main_plate_line(lines):
    """Select the main plate text from OCR line boxes.

    `lines` is a list of dicts with keys "text", "confidence", "height", and
    "center_y" (optional). The plate is the set of boxes whose height is at
    least 60% of the tallest box and whose center-y is vertically aligned with
    the tallest box (difference <= half the tallest box's height). Boxes are
    sorted left-to-right and joined with a single space. Small boxes below the
    plate (e.g. the expiry date "28-22") are dropped.
    """
    if not lines:
        return ""

    # Tallest box anchors the main plate row.
    tallest = max(lines, key=lambda l: l.get("height", 0) or 0)
    tall_h = tallest.get("height", 0) or 0

    def center_y(l):
        return l.get("center_y") if l.get("center_y") is not None else None

    main = []
    tall_cy = center_y(tallest)
    for l in lines:
        h = l.get("height", 0) or 0
        if tall_h > 0 and h < 0.6 * tall_h:
            continue
        cy = center_y(l)
        if tall_cy is not None and cy is not None and tall_h > 0:
            if abs(cy - tall_cy) > 0.5 * tall_h:
                continue
        main.append(l)

    main.sort(key=lambda l: l.get("x_center", 0) or 0)
    return " ".join(str(l["text"]) for l in main if str(l.get("text", "")).strip())

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
        raise RuntimeError(
            "ROBOFLOW_API_KEY belum dikonfigurasi di environment container"
        )

    client = InferenceHTTPClient(
        api_url="https://serverless.roboflow.com",
        api_key=ROBOFLOW_API_KEY,
    )
    return client



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




@app.post("/license-plate/read")
async def read_license_plate(file: UploadFile = File(...), debug: int = 0):
    """Read a license plate from a frame: detect box, crop, OCR, extract plate.
    
    Returns plate + metadata in a single HTTP 200 for all business cases.
    Cropping, OCR, and extraction all happen on the server.
    """
    if not ROBOFLOW_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ROBOFLOW_API_KEY belum dikonfigurasi di environment ai-service",
        )

    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="File harus berupa gambar")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File gambar kosong")

    detect_ms = 0
    ocr_ms = 0
    
    try:
        # Decode image
        arr = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Gambar tidak dapat dibaca")
        
        h_orig, w_orig = image.shape[:2]
        frame_size = {"w": w_orig, "h": h_orig}

        # Step 1: Detect plate box
        det_start = time.time()
        try:
            predictions, _ = _infer_license_plate_image(data)
        except Exception as e:
            raise ValueError(f"Deteksi plat gagal: {e}")
        detect_ms = int((time.time() - det_start) * 1000)

        # Check for plate detection
        if not predictions:
            print(f"[/license-plate/read] no_plate (no predictions)")
            return {
                "success": True,
                "status": "no_plate",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": None,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": 0},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Get highest-confidence prediction
        best = max(predictions, key=lambda p: p.get("confidence", 0))
        conf = best.get("confidence", 0)
        if conf < PLATE_CONFIDENCE:
            print(f"[/license-plate/read] no_plate (confidence {conf:.2f} < {PLATE_CONFIDENCE})")
            return {
                "success": True,
                "status": "no_plate",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": 0},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Step 2: Crop plate from image
        cx = best["x"]
        cy = best["y"]
        cw = best["width"]
        ch = best["height"]
        pad = 0.08
        
        bx = cx - (cw / 2) * (1 + pad)
        by = cy - (ch / 2) * (1 + pad)
        bw = cw * (1 + pad * 2)
        bh = ch * (1 + pad * 2)
        
        # Clamp to image bounds
        bx = max(0, min(bx, w_orig - 1))
        by = max(0, min(by, h_orig - 1))
        bw = min(bw, w_orig - bx)
        bh = min(bh, h_orig - by)
        
        if bw < 20 or bh < 20:
            print(f"[/license-plate/read] no_plate (crop too small: {bw:.0f}x{bh:.0f})")
            return {
                "success": True,
                "status": "no_plate",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": 0},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Extract crop as integer coordinates
        x1 = int(bx)
        y1 = int(by)
        x2 = int(bx + bw)
        y2 = int(by + bh)
        crop = image[y1:y2, x1:x2]
        
        # Upscale crop to min 320px width
        scale_up = max(1, 320 / crop.shape[1]) if crop.shape[1] > 0 else 1
        if scale_up > 1:
            crop = cv2.resize(crop, (int(crop.shape[1] * scale_up), int(crop.shape[0] * scale_up)))

        # Step 3: OCR on crop
        ocr_start = time.time()
        try:
            reader = _get_ocr_reader()
            results = reader.predict(crop)
        except Exception as e:
            print(f"[/license-plate/read] OCR error: {e}")
            return {
                "success": True,
                "status": "invalid",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": int((time.time() - ocr_start) * 1000)},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ocr_ms = int((time.time() - ocr_start) * 1000)

        # Parse OCR results - collect ALL boxes with conf >= 0.3
        all_texts_raw = []
        boxes_with_score = []
        for result in results or []:
            if isinstance(result, dict):
                result_data = result
            else:
                result_data = getattr(result, "json", None)
                if callable(result_data):
                    result_data = result_data()
            
            if isinstance(result_data, dict):
                result_data = result_data.get("res", result_data)
            else:
                continue
            
            rec_texts = result_data.get("rec_texts", [])
            rec_scores = result_data.get("rec_scores", [])
            rec_polys = result_data.get("rec_polys", [])
            
            for i, (text, score) in enumerate(zip(rec_texts, rec_scores)):
                if text and str(text).strip():
                    text_clean = str(text).strip()
                    all_texts_raw.append(text_clean)
                    
                    # Collect box with position info
                    x_center = None
                    if i < len(rec_polys):
                        poly = rec_polys[i]
                        if isinstance(poly, (list, tuple)) and len(poly) >= 4:
                            try:
                                xs = [float(pt[0]) for pt in poly]
                                x_center = (max(xs) + min(xs)) / 2.0
                            except (TypeError, ValueError, IndexError):
                                pass
                    
                    boxes_with_score.append({
                        "text": text_clean,
                        "score": float(score),
                        "x_center": x_center or 0,
                    })

        if not all_texts_raw:
            print(f"[/license-plate/read] no_text")
            return {
                "success": True,
                "status": "no_text",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": ocr_ms},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Step 4: Use ALL boxes with confidence >= 0.3, sorted left-to-right
        high_conf_boxes = [b for b in boxes_with_score if b.get("score", 0) >= 0.3]
        high_conf_boxes.sort(key=lambda b: b.get("x_center", 0))
        
        if high_conf_boxes:
            selected_texts = [b["text"] for b in high_conf_boxes]
            raw_text = " ".join(selected_texts)
            boxes = selected_texts
        else:
            raw_text = " ".join(all_texts_raw)
            boxes = all_texts_raw

        # Extract plate via regex
        plate = extract_plate(selected_texts if high_conf_boxes else all_texts_raw)
        
        if plate is None:
            print(f"[/license-plate/read] invalid (no match), raw: {raw_text}")
            return {
                "success": True,
                "status": "invalid",
                "plate": None,
                "raw_text": raw_text,
                "valid": False,
                "boxes": boxes,
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": ocr_ms},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        print(f"[/license-plate/read] ok: {plate}, raw: {raw_text}, timings: {detect_ms}ms detect + {ocr_ms}ms ocr")
        
        resp = {
            "success": True,
            "status": "ok",
            "plate": plate,
            "raw_text": raw_text,
            "valid": True,
            "boxes": boxes,
            "box": best,
            "frame_size": frame_size,
            "timings_ms": {"detect": detect_ms, "ocr": ocr_ms},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # Optionally include debug crop
        if debug:
            ok_jpg, jpg_bytes = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if ok_jpg:
                b64 = base64.b64encode(jpg_bytes.tobytes()).decode("ascii")
                resp["debug_crop"] = f"data:image/jpeg;base64,{b64}"
        
        return resp

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[/license-plate/read] server error: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Plate read failed: {str(exc)}",
        ) from exc

@app.post("/license-plate/read")
async def read_license_plate(file: UploadFile = File(...), debug: int = 0):
    """Read a license plate from a frame: detect box, crop, OCR, extract plate.
    
    Returns plate + metadata in a single HTTP 200 for all business cases.
    Cropping, OCR, and extraction all happen on the server.
    """
    if not ROBOFLOW_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ROBOFLOW_API_KEY belum dikonfigurasi di environment ai-service",
        )

    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="File harus berupa gambar")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File gambar kosong")

    detect_ms = 0
    ocr_ms = 0
    
    try:
        # Decode image
        arr = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Gambar tidak dapat dibaca")
        
        h_orig, w_orig = image.shape[:2]
        frame_size = {"w": w_orig, "h": h_orig}

        # Step 1: Detect plate box
        det_start = time.time()
        try:
            predictions, _ = _infer_license_plate_image(data)
        except Exception as e:
            raise ValueError(f"Deteksi plat gagal: {e}")
        detect_ms = int((time.time() - det_start) * 1000)

        # Check for plate detection
        if not predictions:
            print(f"[/license-plate/read] no_plate (no predictions)")
            return {
                "success": True,
                "status": "no_plate",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": None,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": 0},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Get highest-confidence prediction
        best = max(predictions, key=lambda p: p.get("confidence", 0))
        conf = best.get("confidence", 0)
        if conf < PLATE_CONFIDENCE:
            print(f"[/license-plate/read] no_plate (confidence {conf:.2f} < {PLATE_CONFIDENCE})")
            return {
                "success": True,
                "status": "no_plate",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": 0},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Step 2: Crop plate from image
        cx = best["x"]
        cy = best["y"]
        cw = best["width"]
        ch = best["height"]
        pad = 0.08
        
        bx = cx - (cw / 2) * (1 + pad)
        by = cy - (ch / 2) * (1 + pad)
        bw = cw * (1 + pad * 2)
        bh = ch * (1 + pad * 2)
        
        # Clamp to image bounds
        bx = max(0, min(bx, w_orig - 1))
        by = max(0, min(by, h_orig - 1))
        bw = min(bw, w_orig - bx)
        bh = min(bh, h_orig - by)
        
        if bw < 20 or bh < 20:
            print(f"[/license-plate/read] no_plate (crop too small: {bw:.0f}x{bh:.0f})")
            return {
                "success": True,
                "status": "no_plate",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": 0},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Extract crop as integer coordinates
        x1 = int(bx)
        y1 = int(by)
        x2 = int(bx + bw)
        y2 = int(by + bh)
        crop = image[y1:y2, x1:x2]
        
        # Upscale crop to min 320px width
        scale_up = max(1, 320 / crop.shape[1]) if crop.shape[1] > 0 else 1
        if scale_up > 1:
            crop = cv2.resize(crop, (int(crop.shape[1] * scale_up), int(crop.shape[0] * scale_up)))

        # Step 3: OCR on crop
        ocr_start = time.time()
        try:
            reader = _get_ocr_reader()
            results = reader.predict(crop)
        except Exception as e:
            print(f"[/license-plate/read] OCR error: {e}")
            return {
                "success": True,
                "status": "invalid",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": int((time.time() - ocr_start) * 1000)},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ocr_ms = int((time.time() - ocr_start) * 1000)

        # Parse OCR results
        all_texts = []
        for result in results or []:
            if isinstance(result, dict):
                result_data = result
            else:
                result_data = getattr(result, "json", None)
                if callable(result_data):
                    result_data = result_data()
            
            if isinstance(result_data, dict):
                result_data = result_data.get("res", result_data)
            else:
                continue
            
            rec_texts = result_data.get("rec_texts", [])
            for text in rec_texts:
                if text and str(text).strip():
                    all_texts.append(str(text).strip())

        if not all_texts:
            print(f"[/license-plate/read] no_text")
            return {
                "success": True,
                "status": "no_text",
                "plate": None,
                "raw_text": "",
                "valid": False,
                "boxes": [],
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": ocr_ms},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Step 4: Extract plate via regex
        plate = extract_plate(all_texts)
        raw_text = " ".join(all_texts)
        
        if plate is None:
            print(f"[/license-plate/read] invalid (no match), raw: {raw_text}")
            return {
                "success": True,
                "status": "invalid",
                "plate": None,
                "raw_text": raw_text,
                "valid": False,
                "boxes": all_texts,
                "box": best,
                "frame_size": frame_size,
                "timings_ms": {"detect": detect_ms, "ocr": ocr_ms},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        print(f"[/license-plate/read] ok: {plate}, raw: {raw_text}, timings: {detect_ms}ms detect + {ocr_ms}ms ocr")
        
        resp = {
            "success": True,
            "status": "ok",
            "plate": plate,
            "raw_text": raw_text,
            "valid": True,
            "boxes": all_texts,
            "box": best,
            "frame_size": frame_size,
            "timings_ms": {"detect": detect_ms, "ocr": ocr_ms},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # Optionally include debug crop
        if debug:
            ok_jpg, jpg_bytes = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if ok_jpg:
                b64 = base64.b64encode(jpg_bytes.tobytes()).decode("ascii")
                resp["debug_crop"] = f"data:image/jpeg;base64,{b64}"
        
        return resp

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[/license-plate/read] server error: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Plate read failed: {str(exc)}",
        ) from exc


@app.post("/license-plate/ocr")
async def extract_license_plate_text(file: UploadFile = File(...)):
    """Extract license plate text from an image using PaddleOCR."""
    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail="File harus berupa gambar",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File gambar kosong")

    start_time = time.time()
    try:
        # Decode image
        arr = np.frombuffer(data, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Gambar tidak dapat dibaca")

        # Run OCR using PaddleOCR 3.x API
        reader = _get_ocr_reader()
        results = reader.predict(image)

        # Parse PaddleOCR 3.x results. We keep each recognized line with its
        # bounding box so we can select the main line (largest height) instead
        # of concatenating a small expiry date line below the plate.
        lines = []
        all_texts = []

        for result in results or []:
            # PaddleOCR 3.x may expose the output through result.json
            if isinstance(result, dict):
                result_data = result
            else:
                result_data = getattr(result, "json", None)

                if callable(result_data):
                    result_data = result_data()

            # Some versions wrap the OCR output inside "res"
            if isinstance(result_data, dict):
                result_data = result_data.get("res", result_data)
            else:
                continue

            rec_texts = result_data.get("rec_texts", [])
            rec_scores = result_data.get("rec_scores", [])
            rec_boxes = result_data.get("rec_boxes", [])
            rec_polys = result_data.get("rec_polys", rec_boxes)

            # Log the raw OCR output for debugging
            print(f"[OCR] keys in result_data: {list(result_data.keys())}")
            print(f"[OCR] rec_texts count: {len(rec_texts)}, rec_polys count: {len(rec_polys)}, rec_boxes count: {len(rec_boxes)}")
            print(f"[OCR] raw rec_texts: {rec_texts}")

            for i, (text, score) in enumerate(zip(rec_texts, rec_scores)):
                if not text or not str(text).strip():
                    continue
                text_clean = str(text).strip()
                all_texts.append(text_clean)
                height = 0.0
                center_y = None
                x_center = None
                poly = rec_polys[i] if i < len(rec_polys) else None
                if isinstance(poly, (list, tuple)) and len(poly) >= 4:
                    try:
                        ys = [float(pt[1]) for pt in poly]
                        xs = [float(pt[0]) for pt in poly]
                        if ys and xs:
                            height = max(ys) - min(ys)
                            center_y = (max(ys) + min(ys)) / 2.0
                            x_center = (max(xs) + min(xs)) / 2.0
                    except (TypeError, ValueError, IndexError):
                        height = 0.0
                lines.append({
                    "text": text_clean,
                    "confidence": float(score),
                    "height": height,
                    "center_y": center_y,
                    "x_center": x_center,
                })

        if not lines and not all_texts:
            # No OCR text found at all.
            timing_ms = int((time.time() - start_time) * 1000)
            return {
                "success": True,
                "source": "ocr",
                "status": "no_text",
                "text": "",
                "raw_text": "",
                "confidence": 0.0,
                "char_count": 0,
                "boxes": [],
                "timing_ms": timing_ms,
                "valid": False,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Collect ALL boxes with conf >= 0.3, sort by x_center (left-to-right)
        high_conf_boxes = [l for l in lines if l.get("confidence", 0) >= 0.3]
        high_conf_boxes.sort(key=lambda l: l.get("x_center", 0) or 0)
        
        # If no high-conf boxes, use all_texts; otherwise use box texts
        if high_conf_boxes:
            box_texts = [l["text"] for l in high_conf_boxes]
            raw_text = " ".join(box_texts)
            boxes = box_texts
            # Confidence = average or max of selected boxes
            confidence = sum(l.get("confidence", 0) for l in high_conf_boxes) / len(high_conf_boxes)
        else:
            raw_text = " ".join(all_texts) if all_texts else ""
            boxes = all_texts if all_texts else []
            confidence = 0.0

        # Extract plate via regex on ALL collected text
        plate = extract_plate(box_texts if high_conf_boxes else all_texts)
        if plate:
            plate_text = plate
            valid = True
        else:
            # Fallback to raw text if regex doesn't match
            plate_text = raw_text
            valid = False

        timing_ms = int((time.time() - start_time) * 1000)
        return {
            "success": True,
            "source": "ocr",
            "text": plate_text,
            "raw_text": raw_text if lines else " ".join(all_texts),
            "confidence": round(confidence, 4),
            "char_count": len(plate_text),
            "valid": _valid_plate_format(plate_text),
            "boxes": boxes,
            "timing_ms": timing_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
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
