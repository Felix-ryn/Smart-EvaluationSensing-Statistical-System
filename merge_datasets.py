#!/usr/bin/env python3
"""
YOLO8 Dataset Merger - Binary Classification (parking_violation vs parking_normal)
Merges 4 parking detection datasets into single unified dataset
"""

import os
import shutil
import json
from pathlib import Path
from collections import defaultdict
import random
from datetime import datetime

# Configuration
SOURCE_DATASETS = {
    "improperparking.v3i.yolov8": {
        "path": r"C:\Smart-EvaluationSensing-Statistical-System\dataset\improperparking.v3i.yolov8",
        "class_map": {0: 0, 1: 1}  # improper -> violation, proper -> normal
    },
    "Wrong Parking.v3i.yolov8": {
        "path": r"C:\Smart-EvaluationSensing-Statistical-System\dataset\Wrong Parking.v3i.yolov8",
        "class_map": {0: 0}  # wrong_parked -> violation (single class)
    },
    "car parking violation detection.v1i.yolov8": {
        "path": r"C:\Smart-EvaluationSensing-Statistical-System\dataset\car parking violation detection.v1i.yolov8",
        "class_map": {0: 0, 1: 0, 2: 0, 3: 0, 4: 1}  # violations -> 0, valid -> 1
    },
    "Illegal Parking.v5i.yolov8": {
        "path": r"C:\Smart-EvaluationSensing-Statistical-System\dataset\Illegal Parking.v5i.yolov8",
        "class_map": {0: 0, 1: 1, 2: 1}  # illegal -> 0, empty/occupied -> 1
    }
}

OUTPUT_DIR = Path(r"C:\Smart-EvaluationSensing-Statistical-System\dataset_merged")
SPLIT_RATIO = {"train": 0.70, "val": 0.15, "test": 0.15}

class DatasetMerger:
    def __init__(self):
        self.log = []
        self.stats = {
            "total_images": 0,
            "total_labels": 0,
            "class_distribution": {0: 0, 1: 0},
            "images_per_dataset": defaultdict(int),
            "errors": []
        }
        self.all_images = []  # List of image data dicts
        
    def log_msg(self, msg):
        """Append message to log"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_line = f"[{timestamp}] {msg}"
        self.log.append(log_line)
        print(log_line)
    
    def create_folder_structure(self):
        """Create output directory structure"""
        self.log_msg("Creating merged dataset folder structure...")
        
        try:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            for split in ["train", "val", "test"]:
                (OUTPUT_DIR / split / "images").mkdir(parents=True, exist_ok=True)
                (OUTPUT_DIR / split / "labels").mkdir(parents=True, exist_ok=True)
            
            self.log_msg(f"[OK] Folder structure created at {OUTPUT_DIR}")
            return True
        except Exception as e:
            self.log_msg(f"[ERROR] Error creating folders: {e}")
            self.stats["errors"].append(str(e))
            return False
    
    def process_dataset(self, dataset_name, config):
        """Process single source dataset"""
        self.log_msg(f"\nProcessing dataset: {dataset_name}")
        
        source_path = Path(config["path"])
        class_map = config["class_map"]
        
        if not source_path.exists():
            self.log_msg(f"[ERROR] Dataset path not found: {source_path}")
            self.stats["errors"].append(f"Missing path: {source_path}")
            return
        
        # Process train/val/test splits
        for split in ["train", "valid", "test"]:
            split_output = "test" if split == "test" else split
            images_dir = source_path / split / "images"
            labels_dir = source_path / split / "labels"
            
            if not images_dir.exists():
                self.log_msg(f"  Skipping {split} (not found)")
                continue
            
            # Get all image files
            image_files = sorted([f for f in images_dir.iterdir() 
                                 if f.suffix.lower() in ['.jpg', '.jpeg', '.png']])
            
            self.log_msg(f"  Found {len(image_files)} images in {split}")
            
            for img_file in image_files:
                label_file = labels_dir / f"{img_file.stem}.txt"
                
                if not label_file.exists():
                    self.log_msg(f"    [WARN] Missing label: {label_file.name}")
                    self.stats["errors"].append(f"Missing label: {label_file}")
                    continue
                
                # Store for later processing
                self.all_images.append({
                    "image": img_file,
                    "label": label_file,
                    "dataset": dataset_name,
                    "class_map": class_map,
                    "split": split_output
                })
                
                self.stats["images_per_dataset"][dataset_name] += 1
        
        self.log_msg(f"[OK] Processed {self.stats['images_per_dataset'][dataset_name]} images from {dataset_name}")
    
    def remap_label(self, label_path, class_map):
        """Remap class indices in label file"""
        try:
            with open(label_path, 'r') as f:
                lines = f.readlines()
            
            remapped_lines = []
            for line in lines:
                parts = line.strip().split()
                if len(parts) < 5:
                    continue
                
                class_id = int(parts[0])
                
                # Check if class_id exists in mapping
                if class_id not in class_map:
                    return None  # Skip this annotation
                
                new_class_id = class_map[class_id]
                parts[0] = str(new_class_id)
                remapped_lines.append(' '.join(parts) + '\n')
            
            return remapped_lines
        except Exception as e:
            return None
    
    def copy_and_remap(self):
        """Copy images and remap labels to merged dataset"""
        self.log_msg("\nCopying and remapping dataset...")
        
        # Separate images by original split
        split_images = defaultdict(list)
        for img_data in self.all_images:
            original_split = img_data["split"]
            split_images[original_split].append(img_data)
        
        # Re-split: mix all data and resplit by ratio
        all_images_flat = []
        for img_data in self.all_images:
            all_images_flat.append(img_data)
        
        random.shuffle(all_images_flat)
        
        total = len(all_images_flat)
        train_count = int(total * SPLIT_RATIO["train"])
        val_count = int(total * SPLIT_RATIO["val"])
        
        splits_assignment = []
        for i, img_data in enumerate(all_images_flat):
            if i < train_count:
                splits_assignment.append(("train", img_data))
            elif i < train_count + val_count:
                splits_assignment.append(("val", img_data))
            else:
                splits_assignment.append(("test", img_data))
        
        # Copy files
        copied = 0
        for split, img_data in splits_assignment:
            try:
                # Copy image
                src_img = img_data["image"]
                dst_img = OUTPUT_DIR / split / "images" / src_img.name
                shutil.copy2(src_img, dst_img)
                
                # Remap and save label
                remapped_lines = self.remap_label(img_data["label"], img_data["class_map"])
                
                if remapped_lines is None:
                    self.log_msg(f"  [WARN] Could not remap: {img_data['label'].name}")
                    continue
                
                dst_label = OUTPUT_DIR / split / "labels" / f"{src_img.stem}.txt"
                with open(dst_label, 'w') as f:
                    f.writelines(remapped_lines)
                
                # Update stats
                for line in remapped_lines:
                    class_id = int(line.split()[0])
                    self.stats["class_distribution"][class_id] += 1
                
                copied += 1
                
            except Exception as e:
                self.log_msg(f"  [ERROR] Error copying {src_img.name}: {e}")
                self.stats["errors"].append(str(e))
        
        self.stats["total_images"] = copied
        self.log_msg(f"[OK] Copied and remapped {copied} images")
    
    def validate_dataset(self):
        """Validate merged dataset integrity"""
        self.log_msg("\nValidating merged dataset...")
        
        validation_errors = []
        
        for split in ["train", "val", "test"]:
            images_dir = OUTPUT_DIR / split / "images"
            labels_dir = OUTPUT_DIR / split / "labels"
            
            image_files = set([f.stem for f in images_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png']])
            label_files = set([f.stem for f in labels_dir.iterdir() if f.suffix == '.txt'])
            
            # Check for mismatches
            missing_labels = image_files - label_files
            extra_labels = label_files - image_files
            
            if missing_labels:
                for fname in missing_labels:
                    validation_errors.append(f"{split}: Missing label for {fname}")
            
            if extra_labels:
                for fname in extra_labels:
                    validation_errors.append(f"{split}: Extra label {fname}")
        
        if validation_errors:
            self.log_msg(f"[ERROR] Found {len(validation_errors)} validation errors:")
            for error in validation_errors[:10]:  # Show first 10
                self.log_msg(f"  - {error}")
            self.stats["errors"].extend(validation_errors)
        else:
            self.log_msg("[OK] All validation checks passed!")
        
        return len(validation_errors) == 0
    
    def create_data_yaml(self):
        """Create unified data.yaml for YOLO8"""
        self.log_msg("\nCreating data.yaml...")
        
        yaml_content = f"""path: {OUTPUT_DIR}
train: train/images
val: val/images
test: test/images

nc: 2
names: ['parking_violation', 'parking_normal']
"""
        
        try:
            yaml_path = OUTPUT_DIR / "data.yaml"
            with open(yaml_path, 'w') as f:
                f.write(yaml_content)
            self.log_msg(f"[OK] Created data.yaml")
            return True
        except Exception as e:
            self.log_msg(f"[ERROR] Error creating data.yaml: {e}")
            self.stats["errors"].append(str(e))
            return False
    
    def generate_statistics(self):
        """Generate and save dataset statistics"""
        self.log_msg("\nGenerating statistics...")
        
        # Count files per split
        split_counts = {}
        for split in ["train", "val", "test"]:
            images = len(list((OUTPUT_DIR / split / "images").glob("*.*")))
            labels = len(list((OUTPUT_DIR / split / "labels").glob("*.txt")))
            split_counts[split] = {"images": images, "labels": labels}
        
        total_images = sum(v["images"] for v in split_counts.values())
        
        stats_report = {
            "merge_datetime": datetime.now().isoformat(),
            "source_datasets": list(SOURCE_DATASETS.keys()),
            "total_images": total_images,
            "split_distribution": {
                "train": {
                    "count": split_counts["train"]["images"],
                    "percentage": f"{(split_counts['train']['images']/total_images*100):.1f}%"
                },
                "val": {
                    "count": split_counts["val"]["images"],
                    "percentage": f"{(split_counts['val']['images']/total_images*100):.1f}%"
                },
                "test": {
                    "count": split_counts["test"]["images"],
                    "percentage": f"{(split_counts['test']['images']/total_images*100):.1f}%"
                }
            },
            "class_distribution": {
                "0_parking_violation": self.stats["class_distribution"][0],
                "1_parking_normal": self.stats["class_distribution"][1]
            },
            "images_per_source_dataset": dict(self.stats["images_per_dataset"]),
            "validation_errors": len(self.stats["errors"]),
            "error_details": self.stats["errors"][:20]  # First 20 errors
        }
        
        # Save JSON stats
        stats_path = OUTPUT_DIR / "MERGE_STATS.json"
        with open(stats_path, 'w') as f:
            json.dump(stats_report, f, indent=2)
        
        self.log_msg("\n" + "="*60)
        self.log_msg("DATASET MERGE STATISTICS")
        self.log_msg("="*60)
        self.log_msg(f"Total images: {total_images}")
        self.log_msg(f"  Train: {split_counts['train']['images']} ({split_counts['train']['images']/total_images*100:.1f}%)")
        self.log_msg(f"  Valid: {split_counts['val']['images']} ({split_counts['val']['images']/total_images*100:.1f}%)")
        self.log_msg(f"  Test:  {split_counts['test']['images']} ({split_counts['test']['images']/total_images*100:.1f}%)")
        self.log_msg(f"\nClass distribution:")
        self.log_msg(f"  parking_violation (class 0): {self.stats['class_distribution'][0]} instances")
        self.log_msg(f"  parking_normal (class 1):     {self.stats['class_distribution'][1]} instances")
        self.log_msg(f"\nImages per source dataset:")
        for dataset, count in self.stats["images_per_dataset"].items():
            self.log_msg(f"  {dataset}: {count}")
        
        if self.stats["errors"]:
            self.log_msg(f"\n[WARN] Total errors: {len(self.stats['errors'])}")
        else:
            self.log_msg(f"\n[OK] No errors found!")
        
        self.log_msg("="*60)
        
        return stats_path
    
    def save_log(self):
        """Save merge log to file"""
        log_path = OUTPUT_DIR / "MERGE_LOG.txt"
        with open(log_path, 'w') as f:
            f.write('\n'.join(self.log))
        self.log_msg(f"\nMerge log saved to: {log_path}")
    
    def run(self):
        """Execute full merge pipeline"""
        self.log_msg("="*60)
        self.log_msg("YOLO8 DATASET MERGER - START")
        self.log_msg("="*60)
        
        # Step 1: Create structure
        if not self.create_folder_structure():
            self.log_msg("[ERROR] Failed to create folder structure. Aborting.")
            return False
        
        # Step 2: Process all datasets
        for dataset_name, config in SOURCE_DATASETS.items():
            self.process_dataset(dataset_name, config)
        
        if not self.all_images:
            self.log_msg("[ERROR] No images found. Aborting.")
            return False
        
        self.log_msg(f"\n[OK] Total images to process: {len(self.all_images)}")
        
        # Step 3: Copy and remap
        self.copy_and_remap()
        
        # Step 4: Validate
        if not self.validate_dataset():
            self.log_msg("[WARN] Validation found issues but continuing...")
        
        # Step 5: Create data.yaml
        self.create_data_yaml()
        
        # Step 6: Generate statistics
        self.generate_statistics()
        
        # Step 7: Save log
        self.save_log()
        
        self.log_msg("\n" + "="*60)
        self.log_msg("[OK] MERGE COMPLETED SUCCESSFULLY!")
        self.log_msg("="*60)
        self.log_msg(f"\nMerged dataset ready at: {OUTPUT_DIR}")
        self.log_msg("Ready for YOLO8 training!")
        
        return True

if __name__ == "__main__":
    merger = DatasetMerger()
    merger.run()
