import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

def evaluate_multispectral_vigor(input_csv="cavite_multispectral_indices_dataset.csv", output_dir="."):
    """
    Computes inter-index correlation matrices (Pearson r and Spearman rho),
    renders publication-grade heatmaps, and outputs statistical distribution tables.
    """
    if not os.path.exists(input_csv):
        input_csv = "models/multispectral_vigor/cavite_multispectral_indices_dataset.csv"
        output_dir = "models/multispectral_vigor"
        
    print(f"Loading multispectral indices from {input_csv}...")
    df = pd.read_csv(input_csv)
    
    indices = ['ndvi', 'evi', 'ndre', 'lswi', 'ndwi']
    labels = ['NDVI (Greenness)', 'EVI (Enhanced)', 'NDRE (Red Edge)', 'LSWI (Moisture)', 'NDWI (Water)']
    
    # -------------------------------------------------------------
    # 1. Pearson Correlation Matrix & Heatmap
    # -------------------------------------------------------------
    corr_pearson = df[indices].corr(method='pearson')
    corr_pearson.columns = labels
    corr_pearson.index = labels
    
    pearson_csv = os.path.join(output_dir, "pearson_correlation_matrix.csv")
    corr_pearson.round(4).to_csv(pearson_csv)
    print(f"[Saved] {pearson_csv}")
    
    plt.figure(figsize=(7, 5.5), dpi=300)
    sns.heatmap(corr_pearson, annot=True, fmt=".3f", cmap="YlGnBu", vmin=-1.0, vmax=1.0,
                cbar_kws={'label': "Pearson Correlation Coefficient (r)"},
                annot_kws={"size": 11, "weight": "bold"})
    plt.title("5.2.2 Multi-Spectral Indices Inter-Correlation Matrix (r)", fontsize=12, fontweight="bold", pad=12)
    plt.tight_layout()
    heatmap_path = os.path.join(output_dir, "correlation_heatmap.png")
    plt.savefig(heatmap_path)
    plt.close()
    print(f"[Saved] {heatmap_path}")
    
    # -------------------------------------------------------------
    # 2. Spearman Rank Correlation Matrix
    # -------------------------------------------------------------
    corr_spearman = df[indices].corr(method='spearman')
    corr_spearman.columns = labels
    corr_spearman.index = labels
    spearman_csv = os.path.join(output_dir, "spearman_correlation_matrix.csv")
    corr_spearman.round(4).to_csv(spearman_csv)
    print(f"[Saved] {spearman_csv}")
    
    # -------------------------------------------------------------
    # 3. Wet vs Dry Seasonal Comparison Figure
    # -------------------------------------------------------------
    plt.figure(figsize=(9, 4.5), dpi=300)
    melted = pd.melt(df, id_vars=['season'], value_vars=['ndvi', 'evi', 'lswi'], 
                     var_name='Index', value_name='Value')
    melted['Index'] = melted['Index'].str.upper()
    
    sns.boxplot(data=melted, x='Index', y='Value', hue='season', palette={'Wet Season': '#2ca02c', 'Dry Season': '#d62728'})
    plt.title("Seasonal Index Distribution across Cavite Agricultural Parcels", fontsize=11, fontweight="bold", pad=10)
    plt.xlabel("Spectral Index", fontsize=10, fontweight="bold")
    plt.ylabel("Index Value", fontsize=10, fontweight="bold")
    plt.grid(True, linestyle=":", alpha=0.5)
    plt.tight_layout()
    seasonal_fig_path = os.path.join(output_dir, "seasonal_index_distribution.png")
    plt.savefig(seasonal_fig_path)
    plt.close()
    print(f"[Saved] {seasonal_fig_path}")

if __name__ == "__main__":
    evaluate_multispectral_vigor()
