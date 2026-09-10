"""Auto-label Dataset B (Parking Violation.v2i.folder) into YOLOv8 detection format.

Dataset B is a CLASSIFICATION dataset (Valid/Invalid folders, no bounding boxes).
We only use the `Invalid` folder (parking violations) as candidates for the
`illegal-parking` class. models/best.pt predicts boxes; we keep ONLY class 2
(illegal-parking). Images the model doesn't detect go to needs_review.txt with an
EMPTY label (never a fake full-frame box, which would poison training).

Output is a STAGING dataset that MUST be manually reviewed before merging.

Usage:  python scripts/autolabel_dataset_b.py
Output: dataset/_parkingB_autolabeled/{train,valid,test}/{images,labels}
        + data.yaml + needs_review.txt
Next:   review boxes, then add ("parkingB", "_parkingB_autolabeled") to
        scripts/merge_yolo_datasets.py SOURCES and run the merge.
"""
from pathlib import Path
import shutil

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dataset" / "Parking Violation.v2i.folder"
OUT = ROOT / "dataset" / "_parkingB_autolabeled"
MODEL_PATH = ROOT / "models" / "best.pt"

CONF = 0.25
ILLEGAL_ID = 2  # illegal-parking in the unified schema (== best.pt names)
UNIFIED = ["space-empty", "space-occupied", "illegal-parking"]
SPLITS = ("train", "valid", "test")
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main():
    model = YOLO(str(MODEL_PATH))
    assert model.names[ILLEGAL_ID] == "illegal-parking", (
        f"model class {ILLEGAL_ID} is {model.names[ILLEGAL_ID]!r}, expected 'illegal-parking'"
    )

    if OUT.exists():
        shutil.rmtree(OUT)
    for split in SPLITS:
        (OUT / split / "images").mkdir(parents=True)
        (OUT / split / "labels").mkdir(parents=True)

    review = []          # (split, filename) with no illegal-parking detection
    stats = {}           # split -> [images, images_with_box, total_boxes]

    for split in SPLITS:
        inv_dir = SRC / split / "Invalid"
        if not inv_dir.exists():
            print(f"  [WARN] missing: {inv_dir}")
            continue
        imgs = [p for p in inv_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT]
        stats[split] = [0, 0, 0]

        for img in imgs:
            stats[split][0] += 1
            new_stem = f"Invalid_{img.stem}"
            shutil.copy2(img, OUT / split / "images" / f"{new_stem}{img.suffix}")

            res = model.predict(str(img), conf=CONF, verbose=False)[0]
            lines = []
            for box in res.boxes:
                if int(box.cls) != ILLEGAL_ID:
                    continue
                cx, cy, w, h = (float(v) for v in box.xywhn[0])  # normalized
                if w <= 0 or h <= 0:
                    continue
                lines.append(f"{ILLEGAL_ID} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

            if lines:
                stats[split][1] += 1
                stats[split][2] += len(lines)
            else:
                review.append(f"{split}/{new_stem}{img.suffix}")

            # empty label = background image (valid); flagged in needs_review.txt
            text = "\n".join(lines) + ("\n" if lines else "")
            (OUT / split / "labels" / f"{new_stem}.txt").write_text(text, encoding="utf-8")

    # unified data.yaml (matches dataset_merged schema)
    names_str = ", ".join(f"'{n}'" for n in UNIFIED)
    (OUT / "data.yaml").write_text(
        "train: ../_parkingB_autolabeled/train/images\n"
        "val: ../_parkingB_autolabeled/valid/images\n"
        "test: ../_parkingB_autolabeled/test/images\n\n"
        f"nc: {len(UNIFIED)}\n"
        f"names: [{names_str}]\n",
        encoding="utf-8",
    )
    (OUT / "needs_review.txt").write_text(
        "# Images with NO illegal-parking auto-detection (empty label).\n"
        "# Annotate these manually, and verify/correct the others too.\n"
        + "\n".join(review) + ("\n" if review else ""),
        encoding="utf-8",
    )

    # self-check: every label line is exactly '2 cx cy w h' with 0<v<=1 coords
    for lbl in (OUT).rglob("*.txt"):
        if lbl.name == "needs_review.txt":
            continue
        for ln in lbl.read_text(encoding="utf-8").splitlines():
            p = ln.split()
            assert len(p) == 5 and p[0] == str(ILLEGAL_ID), f"bad label in {lbl}: {ln!r}"
            assert all(0.0 <= float(v) <= 1.0 for v in p[1:]), f"coord out of range in {lbl}: {ln!r}"

    print("\n=== AUTO-LABEL DONE (Dataset B / Invalid only) ===")
    tot_img = tot_box_img = tot_box = 0
    for split in SPLITS:
        if split not in stats:
            continue
        n, nb, b = stats[split]
        tot_img += n; tot_box_img += nb; tot_box += b
        print(f"  {split:6} images={n:4}  with_box={nb:4}  boxes={b:4}  no_detect={n - nb}")
    print(f"  TOTAL  images={tot_img}  with_box={tot_box_img}  boxes={tot_box}  needs_review={tot_img - tot_box_img}")
    print(f"\nStaging: {OUT}")
    print(f"Review list: {OUT / 'needs_review.txt'}")
    print("Next: review boxes, then add ('parkingB', '_parkingB_autolabeled') to merge SOURCES.")


if __name__ == "__main__":
    main()
