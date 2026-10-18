import os
import pickle
import pandas as pd
import numpy as np

# -------------------------------------------------------------
# Pure NumPy Implementation of Random Forest Regressor & Classifier
# Bypasses Windows Smart App Control binary blocks on sklearn
# -------------------------------------------------------------

class DecisionTreeRegressorPure:
    def __init__(self, max_depth=6, min_samples_split=4, max_features='sqrt'):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.max_features = max_features
        self.tree = None

    def fit(self, X, y, depth=0):
        n_samples, n_features = X.shape
        if depth >= self.max_depth or n_samples < self.min_samples_split or np.var(y) < 1e-7:
            return {'val': float(np.mean(y))}

        k = int(np.sqrt(n_features)) if self.max_features == 'sqrt' else n_features
        feature_indices = np.random.choice(n_features, size=k, replace=False)

        best_feat, best_thresh, best_score = None, None, float('inf')
        total_var = n_samples * np.var(y)

        for feat in feature_indices:
            col_vals = X[:, feat]
            thresholds = np.unique(col_vals)
            if len(thresholds) > 25:
                thresholds = np.percentile(thresholds, np.linspace(5, 95, 25))

            for t in thresholds:
                left_mask = col_vals <= t
                right_mask = ~left_mask
                if not np.any(left_mask) or not np.any(right_mask):
                    continue
                left_y = y[left_mask]
                right_y = y[right_mask]
                score = len(left_y) * np.var(left_y) + len(right_y) * np.var(right_y)
                if score < best_score:
                    best_score = score
                    best_feat = feat
                    best_thresh = t

        if best_feat is None or (total_var - best_score) < 1e-6:
            return {'val': float(np.mean(y))}

        l_mask = X[:, best_feat] <= best_thresh
        return {
            'feat': best_feat,
            'thresh': best_thresh,
            'importance_gain': total_var - best_score,
            'left': self.fit(X[l_mask], y[l_mask], depth + 1),
            'right': self.fit(X[~l_mask], y[~l_mask], depth + 1)
        }

    def _predict_one(self, node, x):
        if 'val' in node:
            return node['val']
        if x[node['feat']] <= node['thresh']:
            return self._predict_one(node['left'], x)
        return self._predict_one(node['right'], x)

    def predict(self, X):
        return np.array([self._predict_one(self.tree, x) for x in X])


class RandomForestRegressorPure:
    def __init__(self, n_estimators=100, max_depth=6, min_samples_split=4, random_state=42):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.random_state = random_state
        self.trees = []
        self.feature_importances_ = None

    def fit(self, X, y):
        np.random.seed(self.random_state)
        n_samples, n_features = X.shape
        self.trees = []
        gains = np.zeros(n_features)

        for _ in range(self.n_estimators):
            sample_idxs = np.random.choice(n_samples, size=n_samples, replace=True)
            X_b, y_b = X[sample_idxs], y[sample_idxs]
            tree = DecisionTreeRegressorPure(max_depth=self.max_depth, min_samples_split=self.min_samples_split)
            tree.tree = tree.fit(X_b, y_b)
            self.trees.append(tree)

            def accumulate_gains(node):
                if node and 'feat' in node:
                    gains[node['feat']] += node.get('importance_gain', 0.0)
                    accumulate_gains(node.get('left'))
                    accumulate_gains(node.get('right'))

            accumulate_gains(tree.tree)

        total_gain = np.sum(gains)
        self.feature_importances_ = gains / total_gain if total_gain > 0 else np.ones(n_features) / n_features
        return self

    def predict(self, X):
        preds = np.array([tree.predict(X) for tree in self.trees])
        return np.mean(preds, axis=0)


class DecisionTreeClassifierPure:
    def __init__(self, max_depth=6, min_samples_split=4, max_features='sqrt'):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.max_features = max_features
        self.tree = None

    def _gini(self, y):
        if len(y) == 0:
            return 0.0
        _, counts = np.unique(y, return_counts=True)
        probs = counts / len(y)
        return 1.0 - np.sum(probs ** 2)

    def fit(self, X, y, depth=0):
        n_samples, n_features = X.shape
        classes, counts = np.unique(y, return_counts=True)
        majority_class = classes[np.argmax(counts)]

        if depth >= self.max_depth or n_samples < self.min_samples_split or len(classes) <= 1:
            return {'val': majority_class}

        k = int(np.sqrt(n_features)) if self.max_features == 'sqrt' else n_features
        feature_indices = np.random.choice(n_features, size=k, replace=False)

        best_feat, best_thresh, best_gini = None, None, float('inf')

        for feat in feature_indices:
            col_vals = X[:, feat]
            thresholds = np.unique(col_vals)
            if len(thresholds) > 25:
                thresholds = np.percentile(thresholds, np.linspace(5, 95, 25))

            for t in thresholds:
                left_mask = col_vals <= t
                right_mask = ~left_mask
                if not np.any(left_mask) or not np.any(right_mask):
                    continue
                left_y = y[left_mask]
                right_y = y[right_mask]
                gini = (len(left_y) * self._gini(left_y) + len(right_y) * self._gini(right_y)) / n_samples
                if gini < best_gini:
                    best_gini = gini
                    best_feat = feat
                    best_thresh = t

        if best_feat is None:
            return {'val': majority_class}

        l_mask = X[:, best_feat] <= best_thresh
        return {
            'feat': best_feat,
            'thresh': best_thresh,
            'left': self.fit(X[l_mask], y[l_mask], depth + 1),
            'right': self.fit(X[~l_mask], y[~l_mask], depth + 1)
        }

    def _predict_one(self, node, x):
        if 'val' in node:
            return node['val']
        if x[node['feat']] <= node['thresh']:
            return self._predict_one(node['left'], x)
        return self._predict_one(node['right'], x)

    def predict(self, X):
        return np.array([self._predict_one(self.tree, x) for x in X])


class RandomForestClassifierPure:
    def __init__(self, n_estimators=100, max_depth=5, min_samples_split=4, random_state=4, class_weight=None):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.random_state = random_state
        self.class_weight = class_weight or {'Optimal': 2.5, 'Mild Stress': 0.8, 'Moderate Stress': 1.8, 'Severe Stress': 0.9}
        self.trees = []
        self._sklearn_model = None

    def fit(self, X, y):
        try:
            from sklearn.ensemble import RandomForestClassifier
            self._sklearn_model = RandomForestClassifier(
                n_estimators=self.n_estimators,
                max_depth=self.max_depth,
                min_samples_split=self.min_samples_split,
                random_state=self.random_state,
                class_weight=self.class_weight
            )
            self._sklearn_model.fit(X, y)
        except Exception:
            self._sklearn_model = None
            np.random.seed(self.random_state)
            n_samples = X.shape[0]
            self.trees = []
            for _ in range(self.n_estimators):
                sample_idxs = np.random.choice(n_samples, size=n_samples, replace=True)
                X_b, y_b = X[sample_idxs], y[sample_idxs]
                tree = DecisionTreeClassifierPure(max_depth=self.max_depth, min_samples_split=self.min_samples_split)
                tree.tree = tree.fit(X_b, y_b)
                self.trees.append(tree)
        return self

    def predict(self, X):
        if self._sklearn_model is not None:
            return self._sklearn_model.predict(X)
        all_preds = np.array([tree.predict(X) for tree in self.trees])
        majority = []
        for i in range(X.shape[0]):
            col = all_preds[:, i]
            vals, counts = np.unique(col, return_counts=True)
            majority.append(vals[np.argmax(counts)])
        return np.array(majority)


def get_train_test_split(df):
    """Stratified 80/20 train/test split balancing rare stress tiers."""
    feature_cols = ['lag_1', 'lag_2', 'lag_3', 'chirps_rainfall_mm', 'baseline_anomaly_delta']
    X = df[feature_cols].values
    y_reg = df['target_30d'].values
    y_clf = df['stress_tier'].values
    try:
        from sklearn.model_selection import train_test_split
        return train_test_split(X, y_reg, y_clf, test_size=0.2, random_state=4, stratify=y_clf)
    except Exception:
        np.random.seed(4)
        train_idx, test_idx = [], []
        for cls in np.unique(y_clf):
            cls_idxs = np.where(y_clf == cls)[0]
            np.random.shuffle(cls_idxs)
            n_test = max(1, int(round(len(cls_idxs) * 0.2)))
            test_idx.extend(cls_idxs[:n_test])
            train_idx.extend(cls_idxs[n_test:])
        train_idx, test_idx = np.array(train_idx), np.array(test_idx)
        return X[train_idx], X[test_idx], y_reg[train_idx], y_reg[test_idx], y_clf[train_idx], y_clf[test_idx]


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
    X_train, X_test, y_reg_train, y_reg_test, y_clf_train, y_clf_test = get_train_test_split(df)
    
    # 1. Train Random Forest Regressor
    print("Training Random Forest Regressor...")
    rf_reg = RandomForestRegressorPure(n_estimators=100, max_depth=7, random_state=42)
    rf_reg.fit(X_train, y_reg_train)
    
    preds_reg = rf_reg.predict(X_test)
    r2 = 1.0 - (np.sum((y_reg_test - preds_reg) ** 2) / np.sum((y_reg_test - np.mean(y_reg_test)) ** 2))
    rmse = np.sqrt(np.mean((y_reg_test - preds_reg) ** 2))
    mae = np.mean(np.abs(y_reg_test - preds_reg))
    mape = np.mean(np.abs((y_reg_test - preds_reg) / y_reg_test)) * 100.0
    
    print(f"Regression Results (T+30 Vigor):")
    print(f"  R^2 Score : {r2:.4f}")
    print(f"  RMSE      : {rmse:.4f}")
    print(f"  MAE       : {mae:.4f}")
    print(f"  MAPE      : {mape:.2f}%")
    
    # 2. Train Random Forest Classifier
    print("\nTraining Random Forest Classifier (Stress Tiers)...")
    rf_clf = RandomForestClassifierPure(n_estimators=100, max_depth=5, random_state=4)
    rf_clf.fit(X_train, y_clf_train)
    
    # Save Trained Models to Disk
    reg_path = os.path.join(out_dir, "rf_vigor_regressor.pkl")
    clf_path = os.path.join(out_dir, "rf_stress_classifier.pkl")
    
    with open(reg_path, 'wb') as f:
        pickle.dump(rf_reg, f)
    with open(clf_path, 'wb') as f:
        pickle.dump(rf_clf, f)
        
    print(f"\n[Saved] Regressor  -> {reg_path}")
    print(f"[Saved] Classifier -> {clf_path}")
    print("=" * 65)

if __name__ == "__main__":
    train_crop_stress_models()
