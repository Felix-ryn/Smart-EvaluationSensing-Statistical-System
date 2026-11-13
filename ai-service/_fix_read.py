#!/usr/bin/env python3
"""Fix /license-plate/read endpoint to use ALL boxes with conf >= 0.3"""

path = r"C:\Users\LENOVO\Smart-EvaluationSensing-Statistical-System\ai-service\main.py"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find the line with "# Step 3: OCR on crop" in /license-plate/read
ocr_start_idx = None
for i, line in enumerate(lines):
    if "# Step 3: OCR on crop" in line and ocr_start_idx is None:
        ocr_start_idx = i
        # Verify this is in /license-plate/read by looking backwards for the endpoint
        for j in range(max(0, i-200), i):
            if '@app.post("/license-plate/read")' in lines[j]:
                break
        else:
            # Not in /license-plate/read, continue searching
            ocr_start_idx = None

if ocr_start_idx is None:
    print("ERROR: Could not find OCR section in /license-plate/read")
    exit(1)

print(f"Found OCR section at line {ocr_start_idx}")

# Find the next @app.post which marks the end
next_endpoint_idx = None
for i in range(ocr_start_idx + 1, len(lines)):
    if "@app.post" in lines[i]:
        next_endpoint_idx = i
        break

if next_endpoint_idx is None:
    next_endpoint_idx = len(lines)

print(f"Endpoint ends at line {next_endpoint_idx}")

# Extract the section and make a new one
old_section = "".join(lines[ocr_start_idx:next_endpoint_idx])

new_section = """        # Step 3: OCR on crop
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

"""

modified = "".join(lines[:ocr_start_idx]) + new_section + "".join(lines[next_endpoint_idx:])

with open(path, "w", encoding="utf-8") as f:
    f.write(modified)

print("Fixed /license-plate/read endpoint")
