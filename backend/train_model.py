import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import pickle
import os

def train_agri_model():
    print("--- Phase 3: Model Training Initiated ---")
    
    # 1. Load Data
    csv_path = 'data/cavite_history.csv'
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found!")
        return

    df = pd.read_csv(csv_path)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date')

    # 2. Feature Engineering (Lag Features for Time-Series)
    df['lag_1'] = df['ndvi'].shift(1)
    df['lag_2'] = df['ndvi'].shift(2)
    df['lag_3'] = df['ndvi'].shift(3)
    df = df.dropna()

    X = df[['lag_1', 'lag_2', 'lag_3']]
    y = df['ndvi']

    # 3. Split Data (80% Train, 20% Test)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

    # 4. Train Random Forest (Benchmark: Pattern Recognition)
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # 5. Accuracy Analysis
    predictions = model.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    print(f"Model Training Complete! MAE: {mae:.4f}")

    # 6. FIXED SAVE LOGIC (Benchmark: Model Persistence)
    model_path = 'data/agri_model.pkl'
    print("Saving model to disk...")
    
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)  # <--- THIS IS THE FIX. 'dump', not 'pickle'.

    # Final Verification
    size = os.path.getsize(model_path)
    if size > 0:
        print(f"SUCCESS! Model saved. File size: {size / 1024:.2f} KB")
    else:
        print("CRITICAL ERROR: File is still 0KB. Check your disk space/permissions.")

    return mae

if __name__ == "__main__":
    train_agri_model()