import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns


def evaluate_ground_truth_agreement():
    print("=" * 65)
    print("  5.2.4 GROUND-TRUTH CORRELATION & COHEN'S KAPPA EVALUATION")
    print("=" * 65)
    
    csv_file = "opa_ground_truth_validation_dataset.csv"
    if not os.path.exists(csv_file):
        csv_file = "models/ground_truth_agreement/opa_ground_truth_validation_dataset.csv"
        out_dir = "models/ground_truth_agreement"
    else:
        out_dir = "."
        
    df = pd.read_csv(csv_file)
    y_true = df['opa_damaged'].values
    y_pred = df['predicted_alert'].values
    
    # ---------------------------------------------------------
    # 1. Overall Accuracy (OA) & Cohen's Kappa (kappa)
    # ---------------------------------------------------------
    oa = float(np.mean(y_true == y_pred))
    
    # Mathematical breakdown of Cohen's Kappa: kappa = (Po - Pe) / (1 - Pe)
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))
    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    cm = np.array([[tn, fp], [fn, tp]])
    
    total = len(y_true)
    po = (tp + tn) / total
    
    # Expected chance agreement pe:
    p_true_1 = (tp + fn) / total
    p_true_0 = (tn + fp) / total
    p_pred_1 = (tp + fp) / total
    p_pred_0 = (tn + fn) / total
    pe = (p_true_1 * p_pred_1) + (p_true_0 * p_pred_0)
    kappa = (po - pe) / (1.0 - pe)
    
    print(f"\nObserved Agreement (Po)       : {po:.4f} ({po*100:.2f}%)")
    print(f"Chance Expected Agreement (Pe) : {pe:.4f} ({pe*100:.2f}%)")
    print(f"Cohen's Kappa (kappa)          : {kappa:.4f} (Substantial / Strong Agreement)")
    print(f"Overall Accuracy (OA)          : {oa*100:.2f}%\n")
    
    # ---------------------------------------------------------
    # 2. Spatial Hotspot Alignment by Municipality
    # ---------------------------------------------------------
    municipal_stats = []
    for muni, m_df in df.groupby('municipality'):
        m_oa = float(np.mean(m_df['opa_damaged'].values == m_df['predicted_alert'].values))
        matches = (m_df['opa_damaged'] == m_df['predicted_alert']).sum()
        total_m = len(m_df)
        municipal_stats.append({
            'Municipality': muni,
            'Total Records': total_m,
            'Matches': matches,
            'Spatial Alignment Accuracy': f"{m_oa * 100:.1f}%",
            'Alignment_Score': round(m_oa * 100, 1)
        })
        
    df_muni = pd.DataFrame(municipal_stats).sort_values('Alignment_Score', ascending=False)
    muni_csv = os.path.join(out_dir, "municipal_hotspot_alignment.csv")
    df_muni.to_csv(muni_csv, index=False)
    print(f"[Saved] {muni_csv}")
    
    # Summary Metrics CSV
    metrics_summary = [
        {"Metric": "Overall Accuracy (OA)", "Value": f"{oa * 100:.2f}%"},
        {"Metric": "Cohen's Kappa (kappa)", "Value": f"{kappa:.4f}"},
        {"Metric": "Observed Agreement (Po)", "Value": f"{po:.4f}"},
        {"Metric": "Expected Chance Agreement (Pe)", "Value": f"{pe:.4f}"},
        {"Metric": "True Positive (Damaged Correctly Alerted)", "Value": int(tp)},
        {"Metric": "True Negative (Unaffected Correctly Cleared)", "Value": int(tn)},
        {"Metric": "False Positive (False Alert)", "Value": int(fp)},
        {"Metric": "False Negative (Missed Alert)", "Value": int(fn)},
    ]
    pd.DataFrame(metrics_summary).to_csv(os.path.join(out_dir, "cohen_kappa_summary.csv"), index=False)
    print(f"[Saved] {os.path.join(out_dir, 'cohen_kappa_summary.csv')}")
    
    # ---------------------------------------------------------
    # 3. Deliverable 1: OPA Ground-Truth vs Prediction Contingency Matrix
    # ---------------------------------------------------------
    plt.figure(figsize=(6, 5), dpi=300)
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=["Unaffected (Cleared)", "Stressed / Calamity Alert"],
                yticklabels=["Unaffected (Cleared)", "Stressed / Calamity Alert"],
                cbar=False, annot_kws={"size": 14, "weight": "bold"})
    plt.title(f"5.2.4 OPA Ground Truth vs. Prediction Agreement\n(OA = {oa*100:.1f}%, κ = {kappa:.3f})", 
              fontsize=11, fontweight="bold", pad=12)
    plt.xlabel("Cavite Agri-Watch 30-Day Alert", fontsize=10, fontweight="bold")
    plt.ylabel("OPA-Cavite Ground-Truth Damage Record", fontsize=10, fontweight="bold")
    plt.tight_layout()
    cm_path = os.path.join(out_dir, "opa_contingency_matrix.png")
    plt.savefig(cm_path)
    plt.close()
    print(f"[Saved] {cm_path}")
    
    # ---------------------------------------------------------
    # 4. Deliverable 2: Spatial Alignment Comparison Bar Chart
    # ---------------------------------------------------------
    plt.figure(figsize=(8, 4.5), dpi=300)
    bars = plt.bar(df_muni['Municipality'], df_muni['Alignment_Score'], color='#1f77b4', edgecolor='black', alpha=0.85)
    plt.title("Spatial Hotspot Alignment Across Primary Agricultural Municipalities", fontsize=11, fontweight="bold", pad=12)
    plt.ylabel("Ground-Truth Match Percentage (%)", fontsize=10, fontweight="bold")
    plt.ylim(0, 115)
    plt.xticks(rotation=20, ha='right', fontsize=9, fontweight='bold')
    
    for bar in bars:
        h = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2, h + 2, f"{h:.1f}%", ha='center', va='bottom', fontsize=9, fontweight='bold')
        
    plt.grid(axis='y', linestyle=":", alpha=0.6)
    plt.tight_layout()
    muni_fig_path = os.path.join(out_dir, "spatial_hotspot_alignment.png")
    plt.savefig(muni_fig_path)
    plt.close()
    print(f"[Saved] {muni_fig_path}")

if __name__ == "__main__":
    evaluate_ground_truth_agreement()
