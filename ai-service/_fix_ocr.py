#!/usr/bin/env python3
"""Fix /license-plate/ocr endpoint to use ALL boxes with conf >= 0.3"""

path = r"C:\Users\LENOVO\Smart-EvaluationSensing-Statistical-System\ai-service\main.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Find and replace the plate text selection logic
old_selection = """        if not lines:
            # Fallback to concatenated rec_texts (no geometry available).
            if all_texts:
                raw_text = " ".join(all_texts)
            else:
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

            plate_text = clean_plate_text(raw_text)
            boxes = []
            confidence = 0.0
        else:
            # Main row = boxes vertically aligned with the tallest box (>= 60%
            # of its height), so a split plate is re-joined but the small expiry
            # date box below is discarded. Falls back to first box if no geometry.
            if any(l["height"] > 0 for l in lines):
                raw_text = select_main_plate_line(lines)
            else:
                raw_text = lines[0]["text"]

            # Confidence: avoid calling max() on empty sequence.
            boxes_with_height = [l for l in lines if l["height"] > 0]
            if boxes_with_height:
                confidence = max(l["confidence"] for l in boxes_with_height)
            else:
                confidence = lines[0]["confidence"] if lines else 0.0

            plate_text = clean_plate_text(raw_text)
            boxes = [l["text"] for l in lines]"""

new_selection = """        if not lines and not all_texts:
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
            valid = False"""

if old_selection not in content:
    print("ERROR: old selection logic not found")
    print("Looking for the pattern...")
    if "if not lines:" in content and "select_main_plate_line" in content:
        print("Found 'if not lines:' and 'select_main_plate_line' in file")
    exit(1)

modified = content.replace(old_selection, new_selection)

with open(path, "w", encoding="utf-8") as f:
    f.write(modified)

print("OCR endpoint fixed: now uses ALL boxes with conf >= 0.3")
