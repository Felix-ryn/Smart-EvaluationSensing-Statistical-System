"""Automated review pass over the auto-labeled Dataset B staging.

No human in the loop. Re-runs best.pt and rewrites labels applying quality
rules that cut cross-domain false positives (best.pt is trained on CCTV lots;
Dataset B are ground-level meme photos, so low-conf boxes are unreliable):

  1. keep only class illegal-parking (id 2)
  2. keep only high-confidence boxes (CONF_KEEP) -- raises precision
  3. keep at most MAX_BOXES per image, the highest-confidence ones
     (meme photos usually feature 1-2 offending cars; many boxes = FPs)
  4. drop degenerate/near-full-frame boxes
  5. images left with zero boxes -> empty label + listed in needs_review.txt

Usage:  python scripts/autoreview_dataset_b.py
Effect: overwrites labels in dataset/_parkingB_autolabeled/ in place.
"""
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "dataset" / "Parking Violation.v2i.folder"
OUT = ROOT / "dataset" / "_parkingB_autolabeled"
MODEL_PATH = ROOT / "models" / "best.pt"

ILLEGAL_ID = 2
CONF_KEEP = 0.50      # precision-first: median conf was ~0.61, p25 ~0.40
MAX_BOXES = 3         # cap FPs from normally-parked background cars
MAX_AREA = 0.85       # drop near-full-frame boxes (uninformative)
SPLITS = ("train", "valid", "test")
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main():
    model = YOLO(str(MODEL_PATH))
    assert model.names[ILLEGAL_ID] == "illegal-parking"

    review = []
    stats = {}
    for split in SPLITS:
        inv_dir = SRC / split / "Invalid"
        if not inv_dir.exists():
            continue
        imgs = [p for p in inv_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT]
        stats[split] = [0, 0, 0]

        for img in imgs:
            stats[split][0] += 1
            new_stem = f"Invalid_{img.stem}"
            res = model.predict(str(img), conf=CONF_KEEP, verbose=False)[0]

            cand = []  # (conf, line)
            for box in res.boxes:
                if int(box.cls) != ILLEGAL_ID:
                    continue
                conf = float(box.conf)
                cx, cy, w, h = (float(v) for v in box.xywhn[0])
                if w <= 0 or h <= 0 or (w * h) > MAX_AREA:
                    continue
                cand.append((conf, f"{ILLEGAL_ID} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"))

            cand.sort(key=lambda t: t[0], reverse=True)
            lines = [ln for _, ln in cand[:MAX_BOXES]]

            if lines:
                stats[split][1] += 1
                stats[split][2] += len(lines)
            else:
                review.append(f"{split}/{new_stem}{img.suffix}")

            text = "\n".join(lines) + ("\n" if lines else "")
            (OUT / split / "labels" / f"{new_stem}.txt").write_text(text, encoding="utf-8")

    (OUT / "needs_review.txt").write_text(
        "# Images with NO high-confidence illegal-parking box after auto-review.\n"
        "# These carry an EMPTY label (treated as background).\n"
        + "\n".join(review) + ("\n" if review else ""),
        encoding="utf-8",
    )

    # self-check
    for lbl in OUT.rglob("labels/*.txt"):
        for ln in lbl.read_text(encoding="utf-8").splitlines():
            p = ln.split()
            assert len(p) == 5 and p[0] == str(ILLEGAL_ID), f"bad label {lbl}: {ln!r}"
            assert all(0.0 <= float(v) <= 1.0 for v in p[1:]), f"coord range {lbl}: {ln!r}"

    print(f"\n=== AUTO-REVIEW DONE (conf>={CONF_KEEP}, max {MAX_BOXES} boxes/img) ===")
    ti = tb_i = tb = 0
    for split in SPLITS:
        if split not in stats:
            continue
        n, nb, b = stats[split]
        ti += n; tb_i += nb; tb += b
        print(f"  {split:6} images={n:4}  with_box={nb:4}  boxes={b:4}  empty={n - nb}")
    print(f"  TOTAL  images={ti}  with_box={tb_i}  boxes={tb}  empty(needs_review)={ti - tb_i}")


if __name__ == "__main__":
    main()
