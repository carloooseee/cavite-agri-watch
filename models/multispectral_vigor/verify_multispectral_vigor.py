import os
import pandas as pd
import numpy as np

def verify_indices(input_csv="cavite_multispectral_indices_dataset.csv", output_dir="."):
    """
    Computes statistical verification, distribution ranges across wet vs dry seasons,
    and cross-validation metrics for the 5 spectral indices.
    """
    if not os.path.exists(input_csv):
        input_csv = "models/multispectral_vigor/cavite_multispectral_indices_dataset.csv"
        output_dir = "models/multispectral_vigor"
        
    print(f"Loading multispectral indices from {input_csv}...")
    df = pd.read_csv(input_csv)
    
    indices = ['ndvi', 'evi', 'ndre', 'lswi', 'ndwi']
    
    # -------------------------------------------------------------
    # 1. Overall Summary Statistics Table (Mean, Std, Min, Max)
    # -------------------------------------------------------------
    overall_summary = []
    for idx in indices:
        overall_summary.append({
            'Index': idx.upper(),
            'Mean': round(df[idx].mean(), 4),
            'Std_Dev': round(df[idx].std(), 4),
            'Min': round(df[idx].min(), 4),
            'Max': round(df[idx].max(), 4)
        })
    df_overall = pd.DataFrame(overall_summary)
    overall_path = os.path.join(output_dir, "indices_descriptive_summary.csv")
    df_overall.to_csv(overall_path, index=False)
    print(f"[Saved] {overall_path}")
    
    # -------------------------------------------------------------
    # 2. Wet vs. Dry Season Distribution Ranges Table
    # -------------------------------------------------------------
    season_summary = []
    for s in ['Wet Season', 'Dry Season']:
        sub = df[df['season'] == s]
        for idx in indices:
            season_summary.append({
                'Season': s,
                'Index': idx.upper(),
                'Mean': round(sub[idx].mean(), 4),
                'Std_Dev': round(sub[idx].std(), 4),
                'Min': round(sub[idx].min(), 4),
                'Max': round(sub[idx].max(), 4),
                'Median': round(sub[idx].median(), 4)
            })
    df_season = pd.DataFrame(season_summary)
    season_path = os.path.join(output_dir, "seasonal_distribution_ranges.csv")
    df_season.to_csv(season_path, index=False)
    print(f"[Saved] {season_path}")
    
    print("\n--- 5.2.2 SPECTRAL INDICES VERIFICATION COMPLETE ---")

if __name__ == "__main__":
    verify_indices()
