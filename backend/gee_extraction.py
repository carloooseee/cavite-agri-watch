"""
================================================================================
 gee_extraction.py
 Cavite Agri-Watch — CVIP Laboratory Assessment: Primary Evidence Script
 Role: Geospatial Lead (@carlos)

 Purpose: This script is the core geospatial pipeline. It orchestrates all
          preprocessing and data reduction techniques to produce:
          1. "Before" and "After" visual evidence images for the CVIP Lab PDF.
          2. A set of 64x64 pixel image patches ready for model ingestion.

 Evidence covered in this script:
          - [PREPROCESSING]   Bitwise Cloud Masking (QA60 band)
          - [PREPROCESSING]   Administrative Boundary Clipping (Cavite FAO)
          - [DATA REDUCTION]  Temporal Reduction   (.median() composite)
          - [DATA REDUCTION]  Spectral Selection   (12 bands → 4 bands)
          - [DATA REDUCTION]  Spatial Patching     (Full scene → 64x64 tiles)
================================================================================
"""

import ee
import os
from datetime import datetime, timedelta

from preprocessing_utils import (
    get_cavite_boundary,
    mask_s2_clouds,
    clip_to_boundary,
    select_spectral_bands,
    download_image_as_png,
    extract_and_save_patches,
)

# ============================================================
#  STEP 0: GEE AUTHENTICATION
# ============================================================

SERVICE_ACCOUNT = 'cavite-agri-watch-7717292883ca.json'
EE_USER = "carlo10lg3@gmail.com"

try:
    credentials = ee.ServiceAccountCredentials(EE_USER, SERVICE_ACCOUNT)
    ee.Initialize(credentials)
    print("=" * 60)
    print("  GEE Initialized — CVIP Pipeline Ready")
    print("=" * 60)
except Exception as e:
    print(f"[AUTH FAILED] {e}")
    exit()


# ============================================================
#  STEP 1: BOUNDARY SETUP
# ============================================================

def run_cvip_pipeline(
    days_window: int = 30,
    patch_size: int = 64,
    output_dir: str = 'data/cvip_output'
):
    """
    Runs the complete CVIP preprocessing and data reduction pipeline.

    Args:
        days_window (int): Number of days for the temporal composite window.
        patch_size (int): Pixel size of each extracted spatial patch.
        output_dir (str): Root directory for all output files.
    """

    # Define the temporal window (last N days from today)
    end_date   = datetime.now()
    start_date = end_date - timedelta(days=days_window)
    end_str    = end_date.strftime('%Y-%m-%d')
    start_str  = start_date.strftime('%Y-%m-%d')

    print(f"\n[CONFIG] Temporal Window : {start_str} → {end_str} ({days_window} days)")
    print(f"[CONFIG] Patch Size      : {patch_size} x {patch_size} px")
    print(f"[CONFIG] Output Dir      : {output_dir}/\n")

    # --------------------------------------------------------
    #  BOUNDARY — Get administrative boundary for Cavite
    # --------------------------------------------------------
    print("[STEP 1/6] Loading Cavite administrative boundary...")
    cavite_fc     = get_cavite_boundary()
    cavite_geom   = cavite_fc.geometry()
    print("           Boundary loaded from FAO/GAUL/2015/level2.\n")

    # --------------------------------------------------------
    #  STEP 2: LOAD RAW IMAGE COLLECTION (No Processing)
    #  This collection represents BEFORE preprocessing.
    # --------------------------------------------------------
    print("[STEP 2/6] Loading RAW Sentinel-2 collection (BEFORE)...")
    raw_collection = (
        ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(cavite_fc)
        .filterDate(start_str, end_str)
        # Broad metadata filter to allow images with ANY cloud coverage
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 90))
    )
    print(f"           Collection size: {raw_collection.size().getInfo()} images\n")

    # --------------------------------------------------------
    #  DATA REDUCTION 1: TEMPORAL — Median Composite (BEFORE)
    #  A .median() reducer collapses the time dimension by
    #  selecting the statistical median pixel value at each
    #  location, producing one single representative image.
    # --------------------------------------------------------
    print("[STEP 3/6] [DATA REDUCTION — Temporal] Applying .median() reducer...")
    raw_composite = raw_collection.median()

    # Scale the raw composite to [0–1] for consistent visualization
    # (No cloud masking yet — this is the "BEFORE" state)
    raw_composite_scaled = raw_composite.divide(10000)
    print("           Temporal composite (unmasked/raw) created.\n")

    # --------------------------------------------------------
    #  PREPROCESSING 1 — Bitwise Cloud Masking (QA60)
    #  PREPROCESSING 2 — Administrative Boundary Clipping
    #  DATA REDUCTION 2 — Spectral Band Selection (12 → 4 bands)
    # --------------------------------------------------------
    print("[STEP 4/6] [PREPROCESSING] Applying cloud masking + boundary clipping...")

    processed_collection = (
        ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(cavite_fc)
        .filterDate(start_str, end_str)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 90))
        # [PREPROCESSING 1] Pixel-level bitwise cloud mask via QA60
        .map(mask_s2_clouds)
        # [PREPROCESSING 2] Clip each image to Cavite's exact boundaries
        .map(lambda img: clip_to_boundary(img, cavite_fc))
    )

    # [DATA REDUCTION 1] Temporal reduction on the CLEANED collection
    print("           [DATA REDUCTION — Temporal] .median() on preprocessed collection...")
    processed_composite = processed_collection.median()

    # [DATA REDUCTION 2] Spectral selection: 12 bands → 4 bands [B, G, R, NIR]
    print("           [DATA REDUCTION — Spectral] Selecting 4 bands: Blue, Green, Red, NIR...")
    final_composite = select_spectral_bands(processed_composite)

    print("           Full preprocessing pipeline applied (AFTER state).\n")

    # --------------------------------------------------------
    #  STEP 5: SAVE BEFORE/AFTER VISUAL EVIDENCE (PNG)
    #  These images are the primary visual proof for the CVIP lab PDF.
    # --------------------------------------------------------
    print("[STEP 5/6] Saving BEFORE / AFTER visual evidence images...")

    before_dir = os.path.join(output_dir, 'before_after')

    # --- BEFORE image: Raw, unmasked, unclipped composite (RGB only) ---
    raw_for_viz = raw_composite_scaled.select(['B4', 'B3', 'B2']).rename(['Red', 'Green', 'Blue'])
    download_image_as_png(
        ee_image   = raw_for_viz,
        region     = cavite_geom,
        filename   = 'BEFORE_raw_unmasked.png',
        bands      = ['Red', 'Green', 'Blue'],
        dimensions = 512,
        output_dir = before_dir
    )

    # --- AFTER image: Cloud-masked, clipped, 4-band composite (RGB channels) ---
    download_image_as_png(
        ee_image   = final_composite,
        region     = cavite_geom,
        filename   = 'AFTER_masked_clipped.png',
        bands      = ['Red', 'Green', 'Blue'],
        dimensions = 512,
        output_dir = before_dir
    )

    # --- AFTER image: NIR channel visualization ---
    download_image_as_png(
        ee_image   = final_composite,
        region     = cavite_geom,
        filename   = 'AFTER_NIR_channel.png',
        bands      = ['NIR', 'Red', 'Green'],
        dimensions = 512,
        output_dir = before_dir
    )

    print()

    # --------------------------------------------------------
    #  STEP 6: SPATIAL PATCHING — Extract 64x64 Image Patches
    #  [DATA REDUCTION 3] — Spatial Reduction
    #  Chops the full Cavite composite into fixed-size tiles.
    # --------------------------------------------------------
    print("[STEP 6/6] [DATA REDUCTION — Spatial Patching] Extracting 64x64 patches...")
    patch_dir   = os.path.join(output_dir, 'patches')
    patch_count = extract_and_save_patches(
        ee_image       = final_composite,
        cavite_geometry = cavite_geom,
        patch_size     = patch_size,
        output_dir     = patch_dir
    )

    # --------------------------------------------------------
    #  PIPELINE COMPLETE — Summary
    # --------------------------------------------------------
    print("\n" + "=" * 60)
    print("  CVIP PIPELINE COMPLETE — Summary")
    print("=" * 60)
    print(f"  Temporal Window   : {start_str} → {end_str}")
    print(f"  Reduction Method  : .median() composite ({days_window}-day window)")
    print(f"  Spectral Bands    : 12 → 4 [Blue, Green, Red, NIR]")
    print(f"  Patch Size        : {patch_size} x {patch_size} px")
    print(f"  Total Patches     : {patch_count}")
    print(f"  Before/After PNGs : {before_dir}/")
    print(f"  Patch Files (.npy): {patch_dir}/")
    print("=" * 60)


if __name__ == "__main__":
    run_cvip_pipeline(
        days_window = 30,
        patch_size  = 64,
        output_dir  = 'data/cvip_output'
    )
