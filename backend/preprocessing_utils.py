"""
================================================================================
 preprocessing_utils.py
 Cavite Agri-Watch — CVIP Laboratory Evidence Module
 Role: Geospatial Lead (@carlos)
 Purpose: Reusable preprocessing and reduction utility functions used by the
          GEE extraction pipeline. This module is the primary evidence for the
          PREPROCESSING & DATA REDUCTION sections of the CVIP Lab Assessment.
================================================================================
"""

import ee
import os
import io
import requests
import numpy as np
from PIL import Image


# ============================================================
#  SECTION 1: BOUNDARY SETUP
# ============================================================

def get_cavite_boundary():
    """
    Fetches the official FAO/GAUL administrative boundary for Cavite, Philippines.
    This geometry is used as the master clipping mask for all imagery.

    Returns:
        ee.FeatureCollection: The Cavite province boundary.
    """
    countries = ee.FeatureCollection("FAO/GAUL/2015/level2")
    return countries.filter(ee.Filter.eq('ADM2_NAME', 'Cavite'))


# ============================================================
#  SECTION 2: PREPROCESSING — CLOUD MASKING
# ============================================================

def mask_s2_clouds(image):
    """
    [PREPROCESSING TECHNIQUE 1 — Bitwise Cloud Masking]

    Applies pixel-level cloud masking on a Sentinel-2 Surface Reflectance image
    using the QA60 quality assessment band.

    Mechanism:
        - Bit 10 of QA60 = Opaque Cloud (1 = cloud present)
        - Bit 11 of QA60 = Cirrus Cloud (1 = cirrus present)
        - A bitwise AND operation isolates these specific bits.
        - Pixels where BOTH bits are 0 (clear sky) are retained.
        - All other pixels are masked (set to null/transparent).

    This removes atmospheric noise caused by cloud cover, ensuring that only
    clear-sky pixels contribute to the vegetation index or composite image.

    Args:
        image (ee.Image): A raw Sentinel-2 SR image.

    Returns:
        ee.Image: Cloud-masked image, scaled to [0.0, 1.0] reflectance range.
    """
    qa = image.select('QA60')

    # Isolate Bit 10 (Opaque Clouds) and Bit 11 (Cirrus)
    cloud_bit_mask = 1 << 10
    cirrus_bit_mask = 1 << 11

    # Create a binary mask: 0 = cloudy/cirrus, 1 = clear sky
    mask = (
        qa.bitwiseAnd(cloud_bit_mask).eq(0)
        .And(qa.bitwiseAnd(cirrus_bit_mask).eq(0))
    )

    # Apply the mask and scale from DN (0–10000) to reflectance (0.0–1.0)
    # copyProperties preserves system:time_start for temporal operations
    return (
        image
        .updateMask(mask)
        .divide(10000)
        .copyProperties(image, ["system:time_start"])
    )


# ============================================================
#  SECTION 3: PREPROCESSING — ADMINISTRATIVE BOUNDARY CLIPPING
# ============================================================

def clip_to_boundary(image, boundary):
    """
    [PREPROCESSING TECHNIQUE 2 — Administrative Boundary Clipping]

    Clips a satellite image strictly to the geographic boundary of Cavite.
    All pixels outside the provincial boundary are removed, restricting the
    model's vision exclusively to the region of interest.

    This is a critical preprocessing step to:
        1. Eliminate irrelevant data from neighboring provinces (e.g., Laguna, Batangas).
        2. Reduce computational cost by reducing image extent.
        3. Improve model accuracy by preventing out-of-region noise.

    Args:
        image (ee.Image): The input satellite image.
        boundary (ee.FeatureCollection | ee.Geometry): The clipping geometry.

    Returns:
        ee.Image: An image spatially constrained to the boundary.
    """
    return image.clip(boundary).copyProperties(image, ["system:time_start"])


# ============================================================
#  SECTION 4: DATA REDUCTION — SPECTRAL BAND SELECTION
# ============================================================

def select_spectral_bands(image):
    """
    [DATA REDUCTION TECHNIQUE 1 — Spectral Band Selection]

    Reduces the Sentinel-2 image from its full 12-band spectrum to only
    the 4 bands required for visual assessment and analysis:
        - B2  →  Blue  (490 nm)
        - B3  →  Green (560 nm)
        - B4  →  Red   (665 nm)
        - B8  →  NIR   (842 nm) — Near-Infrared, critical for vegetation

    This reduces data dimensionality from 12 to 4 bands (~67% reduction),
    significantly cutting memory, download size, and processing time.

    Args:
        image (ee.Image): A Sentinel-2 SR image.

    Returns:
        ee.Image: A 4-band image [Blue, Green, Red, NIR].
    """
    return image.select(['B2', 'B3', 'B4', 'B8']).rename(['Blue', 'Green', 'Red', 'NIR'])


# ============================================================
#  SECTION 5: LOCAL IMAGE SAVING UTILITIES
# ============================================================

def download_image_as_png(ee_image, region, filename, bands=['Red', 'Green', 'Blue'],
                           dimensions=512, output_dir='data/patches'):
    """
    Downloads a GEE image thumbnail as a PNG to local storage.
    Used to produce "Before" and "After" visual evidence for the lab PDF.

    Args:
        ee_image (ee.Image): The image to download.
        region (ee.Geometry): The area to render.
        filename (str): Output filename (e.g., 'before_raw.png').
        bands (list): Bands to visualize. Defaults to RGB.
        dimensions (int): Pixel dimension of the output square image.
        output_dir (str): Local directory to save the image.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Build the thumbnail request parameters
    viz_params = {
        'bands': bands,
        'min': 0.0,
        'max': 0.3,
        'dimensions': dimensions,
        'region': region,
        'format': 'png'
    }

    url = ee_image.getThumbURL(viz_params)
    print(f"  [Downloading] {filename} ...")
    response = requests.get(url, timeout=120)
    response.raise_for_status()

    out_path = os.path.join(output_dir, filename)
    with open(out_path, 'wb') as f:
        f.write(response.content)
    print(f"  [Saved] {out_path}")


def extract_and_save_patches(ee_image, cavite_geometry, patch_size=64,
                              output_dir='data/patches'):
    """
    [DATA REDUCTION TECHNIQUE 2 — Spatial Patching]

    Divides the large Cavite satellite image into a grid of 64x64 pixel patches.
    Each patch is a small, fixed-size tile of the landscape that can be
    directly fed into a Computer Vision model (e.g., CNN).

    Mechanism:
        1. Computes the bounding box of the Cavite region.
        2. Samples a rectangular array of pixel values from GEE.
        3. Splits the full array into non-overlapping 64x64 patches.
        4. Saves each patch as a .npy (NumPy) file for model training.

    Args:
        ee_image (ee.Image): The preprocessed, 4-band composite image.
        cavite_geometry (ee.Geometry): The bounding geometry for sampling.
        patch_size (int): Pixel dimension of each patch. Default is 64.
        output_dir (str): Directory to save patch .npy files.

    Returns:
        int: Total number of patches extracted.
    """
    os.makedirs(output_dir, exist_ok=True)
    print(f"\n[Spatial Patching] Extracting {patch_size}x{patch_size} patches...")

    # Sample the entire bounded region as a pixel rectangle from GEE
    # defaultValue=0 fills any masked (cloud/boundary) pixels with 0
    pixel_data = (
        ee_image
        .sampleRectangle(region=cavite_geometry, defaultValue=0)
        .getInfo()
    )

    # Parse GEE's response into a (H, W, 4) numpy array
    blue  = np.array(pixel_data['properties']['Blue'],  dtype=np.float32)
    green = np.array(pixel_data['properties']['Green'], dtype=np.float32)
    red   = np.array(pixel_data['properties']['Red'],   dtype=np.float32)
    nir   = np.array(pixel_data['properties']['NIR'],   dtype=np.float32)

    # Stack bands into (H, W, 4) format: [B, G, R, NIR]
    full_array = np.stack([blue, green, red, nir], axis=-1)
    H, W, C = full_array.shape
    print(f"  [Sampled Region] Full array shape: {H} x {W} x {C} (H x W x Bands)")

    # Slice the full image into non-overlapping 64x64 patches
    patch_count = 0
    for row_start in range(0, H - patch_size + 1, patch_size):
        for col_start in range(0, W - patch_size + 1, patch_size):
            patch = full_array[
                row_start : row_start + patch_size,
                col_start : col_start + patch_size,
                :
            ]
            patch_filename = os.path.join(
                output_dir, f"patch_r{row_start:04d}_c{col_start:04d}.npy"
            )
            np.save(patch_filename, patch)
            patch_count += 1

    print(f"  [Done] {patch_count} patches of {patch_size}x{patch_size}x{C} saved to '{output_dir}/'")
    return patch_count
