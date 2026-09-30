import os
import numpy as np
from PIL import Image

def convert_npy_to_png(patches_dir="data/cvip_output/patches", output_dir="data/cvip_output/patches_png"):
    if not os.path.exists(patches_dir):
        print(f"Error: The directory {patches_dir} does not exist.")
        print("Please run `python gee_extraction.py` first to generate the dataset patches.")
        return

    os.makedirs(output_dir, exist_ok=True)
    
    npy_files = [f for f in os.listdir(patches_dir) if f.endswith(".npy")]
    if not npy_files:
        print(f"No .npy files found in {patches_dir}.")
        print("Please run `python gee_extraction.py` first to generate the dataset patches.")
        return

    print(f"Found {len(npy_files)} patches. Converting to PNG...")
    
    for f in npy_files:
        npy_path = os.path.join(patches_dir, f)
        patch = np.load(npy_path)
        
        # patch has shape (64, 64, 4) with bands [Blue, Green, Red, NIR]
        # Sentinel-2 raw reflectance is typically 0-10000
        # Extract RGB (indices 2, 1, 0)
        rgb_patch = patch[:, :, 2::-1]
        
        # Scale for visualization (clipping at 0.3 reflectance for brightness)
        # The values are already scaled to roughly 0-1 range by GEE collection properties
        rgb_scaled = np.clip(rgb_patch / 0.3, 0, 1) * 255.0
        
        img = Image.fromarray(rgb_scaled.astype(np.uint8))
        
        png_filename = f.replace(".npy", ".png")
        png_path = os.path.join(output_dir, png_filename)
        img.save(png_path)
        
    print(f"Success! {len(npy_files)} images saved to {output_dir}")

if __name__ == "__main__":
    convert_npy_to_png()
