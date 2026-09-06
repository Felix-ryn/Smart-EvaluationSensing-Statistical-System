"""Merge multiple Roboflow YOLOv8 datasets into one, remapping classes to a unified schema.

Reads each source dataset's data.yaml to map ITS local class_id -> class NAME,
then rewrites every label .txt with the unified class_id below.
Filenames are prefixed per-source to avoid collisions.

Usage:  python scripts/merge_yolo_datasets.py
Output: dataset_merged/{train,valid,test}/{images,labels} + data.yaml
"""
from pathlib import Path
import shutil
import re

ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = ROOT / "dataset"
OUT = ROOT / "dataset_merged"

# Unified schema (order = final class id). license-plate dropped: separate OCR domain, too few samples.
UNIFIED = ["space-empty", "space-occupied", "illegal-parking"]
UNIFIED_ID = {name: i for i, name in enumerate(UNIFIED)}

# Map every possible source class NAME (lowercased) -> unified name.
# Names not listed here (e.g. license-plate) are dropped.
ALIAS = {
    "empty": "space-empty", "slot-empty": "space-empty", "space-empty": "space-empty",
    "occupied": "space-occupied", "slot-occupied": "space-occupied", "space-occupied": "space-occupied",
    "illegal": "illegal-parking", "illegal-parking": "illegal-parking",
}

SOURCES = [
    ("carpark", "Carpark and License Plate with Illegal parking.v4i.yolov8"),
    ("illegal", "Illegal Parking.v4i.yolov8"),
    ("spots",   "Parking Spots.v3i.yolov8"),
]


def parse_names(data_yaml: Path):
    """Minimal parser for the `names: [...]` line (avoids needing PyYAML)."""
    text = data_yaml.read_text(encoding="utf-8")
    m = re.search(r"names:\s*\[(.*?)\]", text, re.S)
    if not m:
        raise ValueError(f"names list not found in {data_yaml}")
    items = re.findall(r"'([^']*)'|\"([^\"]*)\"", m.group(1))
    return [a or b for a, b in items]


def remap_label(line: str, id2unified: dict) -> str | None:
    """Remap class id and normalize to detection bbox (5 cols).

    Handles both YOLO detect (class cx cy w h) and YOLO segment
    (class x1 y1 x2 y2 ...) by converting polygons to their bounding box.
    """
    parts = line.split()
    if not parts:
        return None
    old = int(parts[0])
    if old not in id2unified:  # class dropped/unknown -> skip annotation
        return None
    coords = [float(v) for v in parts[1:]]
    if len(coords) == 4:  # already bbox
        cx, cy, w, h = coords
    elif len(coords) >= 6 and len(coords) % 2 == 0:  # polygon -> bbox
        xs, ys = coords[0::2], coords[1::2]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    else:
        return None  # malformed
    if w <= 0 or h <= 0:  # degenerate box
        return None
    return f"{id2unified[old]} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    for split in ("train", "valid", "test"):
        (OUT / split / "images").mkdir(parents=True)
        (OUT / split / "labels").mkdir(parents=True)

    stats = {}
    for prefix, folder in SOURCES:
        src = DATASET_DIR / folder
        if not src.exists():
            print(f"  [WARN] source folder missing, skipped: {folder}")
            continue
        names = parse_names(src / "data.yaml")
        # local id -> unified id (None if class dropped)
        id2unified = {}
        for local_id, nm in enumerate(names):
            key = nm.lower().replace(" ", "-")  # "slot empty" -> "slot-empty" to match ALIAS
            uni = ALIAS.get(nm.lower()) or ALIAS.get(key)
            if uni is None:
                print(f"  [WARN] {folder}: class '{nm}' has no mapping -> dropped")
                continue
            id2unified[local_id] = UNIFIED_ID[uni]

        for split in ("train", "valid", "test"):
            img_dir = src / split / "images"
            lbl_dir = src / split / "labels"
            if not img_dir.exists():
                continue
            for img in img_dir.iterdir():
                if not img.is_file():
                    continue
                new_name = f"{prefix}_{img.name}"
                shutil.copy2(img, OUT / split / "images" / new_name)
                lbl = lbl_dir / (img.stem + ".txt")
                out_lines = []
                if lbl.exists():
                    for ln in lbl.read_text(encoding="utf-8").splitlines():
                        r = remap_label(ln, id2unified)
                        if r is not None:
                            out_lines.append(r)
                # write label (may be empty = background image, which is valid)
                text = "\n".join(out_lines) + ("\n" if out_lines else "")
                (OUT / split / "labels" / f"{prefix}_{img.stem}.txt").write_text(
                    text, encoding="utf-8"
                )
                stats[(prefix, split)] = stats.get((prefix, split), 0) + 1

    # unified data.yaml
    names_str = ", ".join(f"'{n}'" for n in UNIFIED)
    (OUT / "data.yaml").write_text(
        f"train: ../dataset_merged/train/images\n"
        f"val: ../dataset_merged/valid/images\n"
        f"test: ../dataset_merged/test/images\n\n"
        f"nc: {len(UNIFIED)}\n"
        f"names: [{names_str}]\n",
        encoding="utf-8",
    )

    print("\n=== MERGE DONE ===")
    for (prefix, split), n in sorted(stats.items()):
        print(f"  {prefix:8} {split:6} {n} images")
    print(f"\nOutput: {OUT}")
    print(f"Classes: {UNIFIED}")


if __name__ == "__main__":
    main()
