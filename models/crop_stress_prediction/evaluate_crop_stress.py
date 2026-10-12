import os
import pickle
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score, classification_report, confusion_matrix

def evaluate_crop_stress():
    print("=" * 65)
    print("  5.2.3 30-DAY CROP STRESS PREDICTION EVALUATION & VISUALS")
    print("=" * 65)
    
    csv_file = "crop_stress_prediction_dataset.csv"
    if not os.path.exists(csv_file):
        csv_file = "models/crop_stress_prediction/crop_stress_prediction_dataset.csv"
        out_dir = "models/crop_stress_prediction"
        reg_model_path = "models/crop_stress_prediction/rf_vigor_regressor.pkl"
        clf_model_path = "models/crop_stress_prediction/rf_stress_classifier.pkl"
    else:
        out_dir = "."
        reg_model_path = "rf_vigor_regressor.pkl"
        clf_model_path = "rf_stress_classifier.pkl"
        
    df = pd.read_csv(csv_file)
    feature_cols = ['lag_1', 'lag_2', 'lag_3', 'chirps_rainfall_mm', 'baseline_anomaly_delta']
    feature_labels = ['Lagged Vigor (T)', 'Lagged Vigor (T-15)', 'Lagged Vigor (T-30)', 'CHIRPS Rainfall (mm)', 'Baseline Anomaly Delta']
    
    X = df[feature_cols]
    y_reg = df['target_30d']
    y_clf = df['stress_tier']
    
    X_train, X_test, y_reg_train, y_reg_test = train_test_split(X, y_reg, test_size=0.2, random_state=42)
    _, _, y_clf_train, y_clf_test = train_test_split(X, y_clf, test_size=0.2, random_state=42)
    
    with open(reg_model_path, 'rb') as f:
        rf_reg = pickle.load(f)
    with open(clf_model_path, 'rb') as f:
        rf_clf = pickle.load(f)
        
    preds_reg = rf_reg.predict(X_test)
    preds_clf = rf_clf.predict(X_test)
    
    # ---------------------------------------------------------
    # 1. Regression Metrics Table
    # ---------------------------------------------------------
    r2 = r2_score(y_reg_test, preds_reg)
    rmse = np.sqrt(mean_squared_error(y_reg_test, preds_reg))
    mae = mean_absolute_error(y_reg_test, preds_reg)
    mape = np.mean(np.abs((y_reg_test - preds_reg) / y_reg_test)) * 100.0
    
    reg_summary = [
        {"Metric": "R2 Score (Coefficient of Determination)", "Value": f"{r2:.4f}"},
        {"Metric": "Root Mean Square Error (RMSE)", "Value": f"{rmse:.4f}"},
        {"Metric": "Mean Absolute Error (MAE)", "Value": f"{mae:.4f}"},
        {"Metric": "Mean Absolute Percentage Error (MAPE)", "Value": f"{mape:.2f}%"}
    ]
    pd.DataFrame(reg_summary).to_csv(os.path.join(out_dir, "regression_metrics.csv"), index=False)
    print(f"[Saved] {os.path.join(out_dir, 'regression_metrics.csv')}")
    
    # ---------------------------------------------------------
    # 2. Multi-class Categorical Stress Classification Report
    # ---------------------------------------------------------
    tiers = ['Optimal', 'Mild Stress', 'Moderate Stress', 'Severe Stress']
    clf_rep_dict = classification_report(y_clf_test, preds_clf, labels=tiers, output_dict=True, zero_division=0)
    clf_rep_df = pd.DataFrame(clf_rep_dict).transpose()
    clf_rep_df.to_csv(os.path.join(out_dir, "stress_classification_report.csv"))
    print(f"[Saved] {os.path.join(out_dir, 'stress_classification_report.csv')}")
    
    # ---------------------------------------------------------
    # 3. Deliverable 1: Actual vs. Predicted Scatter Plot
    # ---------------------------------------------------------
    plt.figure(figsize=(6.5, 5.5), dpi=300)
    plt.scatter(y_reg_test, preds_reg, color='#1f77b4', edgecolors='k', alpha=0.85, s=60, label='Observations')
    
    # 1:1 Regression line
    min_val = min(y_reg_test.min(), preds_reg.min()) - 0.05
    max_val = max(y_reg_test.max(), preds_reg.max()) + 0.05
    plt.plot([min_val, max_val], [min_val, max_val], 'r--', lw=2, label='1:1 Perfect Fit Line')
    
    plt.title(f"Actual vs. Predicted Vegetation Vigor at T+30\n(R² = {r2:.3f}, RMSE = {rmse:.3f})", 
              fontsize=11, fontweight="bold", pad=12)
    plt.xlabel("Actual Ground-Observed NDVI (T+30)", fontsize=10, fontweight="bold")
    plt.ylabel("Random Forest Predicted NDVI (T+30)", fontsize=10, fontweight="bold")
    plt.xlim(min_val, max_val)
    plt.ylim(min_val, max_val)
    plt.legend(frameon=True)
    plt.grid(True, linestyle=":", alpha=0.6)
    plt.tight_layout()
    scatter_path = os.path.join(out_dir, "actual_vs_predicted_scatter.png")
    plt.savefig(scatter_path)
    plt.close()
    print(f"[Saved] {scatter_path}")
    
    # ---------------------------------------------------------
    # 4. Deliverable 2: Feature Importance Horizontal Bar Chart
    # ---------------------------------------------------------
    importances = rf_reg.feature_importances_ * 100.0
    feat_df = pd.DataFrame({
        'Feature': feature_labels,
        'Importance': importances
    }).sort_values('Importance', ascending=True)
    
    feat_df.to_csv(os.path.join(out_dir, "feature_importance_ranking.csv"), index=False)
    
    plt.figure(figsize=(8, 4.5), dpi=300)
    bars = plt.barh(feat_df['Feature'], feat_df['Importance'], color='#2ca02c', edgecolor='black', alpha=0.85)
    plt.title("Random Forest Feature Importance Ranking (MDI / Gini)", fontsize=11, fontweight="bold", pad=12)
    plt.xlabel("Relative Contribution Percentage (%)", fontsize=10, fontweight="bold")
    plt.xlim(0, max(importances) * 1.15)
    
    for bar in bars:
        width = bar.get_width()
        plt.text(width + 0.5, bar.get_y() + bar.get_height()/2, f"{width:.1f}%", 
                 va='center', ha='left', fontsize=9, fontweight='bold')
                 
    plt.grid(axis='x', linestyle=":", alpha=0.6)
    plt.tight_layout()
    feat_path = os.path.join(out_dir, "feature_importance_barchart.png")
    plt.savefig(feat_path)
    plt.close()
    print(f"[Saved] {feat_path}")

if __name__ == "__main__":
    evaluate_crop_stress()
