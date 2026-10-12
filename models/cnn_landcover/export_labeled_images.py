import os
import pandas as pd
import numpy as np
from PIL import Image

def generate_labeled_images():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(base_dir, "../../"))
    csv_path = os.path.join(base_dir, "labeled_patches_dataset.csv")
    
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return
        
    df = pd.read_csv(csv_path)
    output_root = os.path.join(base_dir, "labeled_images_dataset")
    
    # Target directory structure:
    # models/cnn_landcover/labeled_images_dataset/
    # ├── urban_builtup/
    # └── vegetated_cropland/
    urban_dir = os.path.join(output_root, "urban_builtup")
    crop_dir = os.path.join(output_root, "vegetated_cropland")
    os.makedirs(urban_dir, exist_ok=True)
    os.makedirs(crop_dir, exist_ok=True)
    
    print(f"Generating labeled image dataset with {len(df)} samples...")
    
    saved_count = 0
    missing_count = 0
    
    for idx, row in df.iterrows():
        npy_rel_path = row['relative_patch_path']
        npy_full_path = os.path.join(project_root, npy_rel_path)
        
        if not os.path.exists(npy_full_path):
            missing_count += 1
            continue
            
        # Load (64, 64, 4) array: [Blue, Green, Red, NIR]
        patch = np.load(npy_full_path).astype(np.float32)
        
        # Extract RGB bands (Red=band 2, Green=band 1, Blue=band 0)
        rgb = patch[:, :, [2, 1, 0]]
        
        # Contrast stretch/normalize to [0, 255] uint8 for clear visual inspection
        # Clip max around 0.35 to 0.40 reflectance for vivid natural RGB colors
        rgb_norm = np.clip(rgb / 0.35, 0.0, 1.0)
        rgb_uint8 = (rgb_norm * 255).astype(np.uint8)
        
        # Name format: {month}_{patch_id}.png
        month = row['month_folder']
        patch_id = row['patch_id']
        file_name = f"{month}_{patch_id}.png"
        
        target_class = int(row['target_class'])
        if target_class == 1:
            dest_path = os.path.join(crop_dir, file_name)
        else:
            dest_path = os.path.join(urban_dir, file_name)
            
        img = Image.fromarray(rgb_uint8, mode="RGB")
        img.save(dest_path)
        saved_count += 1

    print(f"Done! Successfully generated {saved_count} labeled RGB images.")
    print(f"  - Urban / Built-up: {len(os.listdir(urban_dir))} images in {urban_dir}")
    print(f"  - Vegetated / Cropland: {len(os.listdir(crop_dir))} images in {crop_dir}")
    if missing_count > 0:
        print(f"  - Missing .npy source files: {missing_count}")

if __name__ == "__main__":
    generate_labeled_images()
