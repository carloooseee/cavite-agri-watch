import os
import pickle
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

def train_crop_stress_models():
    print("=" * 65)
    print("  5.2.3 RANDOM FOREST 30-DAY CROP STRESS PREDICTION TRAINING")
    print("=" * 65)
    
    csv_file = "crop_stress_prediction_dataset.csv"
    if not os.path.exists(csv_file):
        csv_file = "models/crop_stress_prediction/crop_stress_prediction_dataset.csv"
        out_dir = "models/crop_stress_prediction"
    else:
        out_dir = "."
        
    df = pd.read_csv(csv_file)
    
    # Feature columns as specified in manuscript Section 5.2.3:
    # 1. Lagged spectral values (lag_1, lag_2, lag_3)
    # 2. Cumulative rainfall from CHIRPS precipitation records
    # 3. Historical baseline anomaly deltas
    feature_cols = ['lag_1', 'lag_2', 'lag_3', 'chirps_rainfall_mm', 'baseline_anomaly_delta']
    X = df[feature_cols]
    y_reg = df['target_30d']
    y_clf = df['stress_tier']
    
    # 80/20 train/test split (chronological or random with fixed seed)
    X_train, X_test, y_reg_train, y_reg_test = train_test_split(X, y_reg, test_size=0.2, random_state=42)
    _, _, y_clf_train, y_clf_test = train_test_split(X, y_clf, test_size=0.2, random_state=42)
    
    # ---------------------------------------------------------
    # 1. Train Random Forest Regressor (Forecasting T+30 Vigor)
    # ---------------------------------------------------------
    rf_reg = RandomForestRegressor(n_estimators=150, max_depth=8, random_state=42)
    rf_reg.fit(X_train, y_reg_train)
    
    preds_reg = rf_reg.predict(X_test)
    r2 = r2_score(y_reg_test, preds_reg)
    rmse = np.sqrt(mean_squared_error(y_reg_test, preds_reg))
    mae = mean_absolute_error(y_reg_test, preds_reg)
    mape = np.mean(np.abs((y_reg_test - preds_reg) / y_reg_test)) * 100.0
    
    print(f"Regression Results (T+30 Vigor):")
    print(f"  R^2 Score : {r2:.4f}")
    print(f"  RMSE      : {rmse:.4f}")
    print(f"  MAE       : {mae:.4f}")
    print(f"  MAPE      : {mape:.2f}%")
    
    # ---------------------------------------------------------
    # 2. Train Random Forest Classifier (4 Stress Tiers)
    # ---------------------------------------------------------
    rf_clf = RandomForestClassifier(n_estimators=150, max_depth=8, random_state=42)
    rf_clf.fit(X_train, y_clf_train)
    
    # Save Trained Models to Disk
    reg_model_path = os.path.join(out_dir, "rf_vigor_regressor.pkl")
    clf_model_path = os.path.join(out_dir, "rf_stress_classifier.pkl")
    
    with open(reg_model_path, 'wb') as f:
        pickle.dump(rf_reg, f)
    with open(clf_model_path, 'wb') as f:
        pickle.dump(rf_clf, f)
        
    print("-" * 65)
    print(f"Saved Regressor Model   -> {reg_model_path}")
    print(f"Saved Classifier Model  -> {clf_model_path}")
    print("=" * 65)

if __name__ == "__main__":
    train_crop_stress_models()
