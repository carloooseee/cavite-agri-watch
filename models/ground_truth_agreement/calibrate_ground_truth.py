import os
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
import pickle

def calibrate_ground_truth_agreement():
    print("=" * 65)
    print("  5.2.4 OPA GROUND-TRUTH CALIBRATION & ALERT TUNING PIPELINE")
    print("=" * 65)
    
    csv_file = "opa_ground_truth_validation_dataset.csv"
    if not os.path.exists(csv_file):
        csv_file = "models/ground_truth_agreement/opa_ground_truth_validation_dataset.csv"
        out_dir = "models/ground_truth_agreement"
    else:
        out_dir = "."
        
    df = pd.read_csv(csv_file)
    print(f"Loaded {len(df)} OPA damage and calamity ground truth records.")
    
    # Train/fit calibration model linking continuous alert scores to binary OPA status
    X = df[['alert_score']].values
    y = df['opa_damaged'].values
    
    clf = LogisticRegression(random_state=42)
    clf.fit(X, y)
    
    model_path = os.path.join(out_dir, "opa_alert_calibrator.pkl")
    with open(model_path, 'wb') as f:
        pickle.dump(clf, f)
        
    print(f"Calibrated alert model saved -> {model_path}")
    print("=" * 65)

if __name__ == "__main__":
    calibrate_ground_truth_agreement()
