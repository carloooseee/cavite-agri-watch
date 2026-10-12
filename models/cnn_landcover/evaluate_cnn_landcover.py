import os
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix, classification_report, accuracy_score

from train_cnn_landcover import SentinelPatchDataset, LandCoverCNN

def evaluate_cnn():
    print("=" * 65)
    print("  5.2.1 CNN LAND-COVER METRICS EVALUATION & FIGURE GENERATOR")
    print("=" * 65)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    csv_file = "labeled_patches_dataset.csv"
    if not os.path.exists(csv_file):
        csv_file = "models/cnn_landcover/labeled_patches_dataset.csv"
        root_dir = "."
        weights_path = "models/cnn_landcover/cnn_landcover_model.pt"
        history_csv = "models/cnn_landcover/training_history.csv"
        out_dir = "models/cnn_landcover"
    else:
        root_dir = "../../"
        weights_path = "cnn_landcover_model.pt"
        history_csv = "training_history.csv"
        out_dir = "."
        
    dataset = SentinelPatchDataset(csv_file=csv_file, root_dir=root_dir)
    
    # Same deterministic split
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    _, val_set = torch.utils.data.random_split(
        dataset, [train_size, val_size], generator=torch.Generator().manual_seed(42)
    )
    
    val_loader = DataLoader(val_set, batch_size=32, shuffle=False)
    
    model = LandCoverCNN(in_channels=4, num_classes=2).to(device)
    if not os.path.exists(weights_path):
        print(f"Weights file '{weights_path}' not found! Please run train_cnn_landcover.py first.")
        return
        
    model.load_state_dict(torch.load(weights_path, map_location=device))
    model.eval()
    
    y_true, y_pred = [], []
    with torch.no_grad():
        for inputs, targets in val_loader:
            inputs = inputs.to(device)
            outputs = model(inputs)
            preds = outputs.argmax(dim=1).cpu().numpy()
            y_pred.extend(preds)
            y_true.extend(targets.numpy())
            
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)
    
    # ---------------------------------------------------------
    # 1. Compute Metrics (OA, Precision, Recall, F1, IoU)
    # ---------------------------------------------------------
    oa = accuracy_score(y_true, y_pred)
    cm = confusion_matrix(y_true, y_pred)
    
    # IoU Calculation per class
    # Class 0: Urban / Built-up
    # Class 1: Vegetated / Cropland
    intersection_0 = np.logical_and(y_true == 0, y_pred == 0).sum()
    union_0 = np.logical_or(y_true == 0, y_pred == 0).sum()
    iou_0 = intersection_0 / (union_0 + 1e-6)
    
    intersection_1 = np.logical_and(y_true == 1, y_pred == 1).sum()
    union_1 = np.logical_or(y_true == 1, y_pred == 1).sum()
    iou_1 = intersection_1 / (union_1 + 1e-6)
    miou = (iou_0 + iou_1) / 2.0
    
    target_names = ["Urban / Built-up / Non-veg", "Vegetated / Cropland"]
    report_dict = classification_report(y_true, y_pred, target_names=target_names, output_dict=True)
    report_text = classification_report(y_true, y_pred, target_names=target_names)
    
    print("\n--- CLASSIFICATION REPORT ---")
    print(report_text)
    print(f"Overall Accuracy (OA): {oa * 100:.2f}%")
    print(f"IoU (Urban / Non-veg) : {iou_0:.4f}")
    print(f"IoU (Vegetation)      : {iou_1:.4f}")
    print(f"Mean IoU (mIoU)       : {miou:.4f}")
    
    # Export Metrics Summary CSV
    metrics_summary = [
        {"Metric": "Overall Accuracy (OA)", "Value": f"{oa * 100:.2f}%"},
        {"Metric": "Mean IoU (mIoU)", "Value": f"{miou:.4f}"},
        {"Metric": "IoU (Vegetated / Cropland)", "Value": f"{iou_1:.4f}"},
        {"Metric": "IoU (Urban / Built-up)", "Value": f"{iou_0:.4f}"},
        {"Metric": "Precision (Cropland)", "Value": f"{report_dict['Vegetated / Cropland']['precision']:.4f}"},
        {"Metric": "Recall (Cropland)", "Value": f"{report_dict['Vegetated / Cropland']['recall']:.4f}"},
        {"Metric": "F1-Score (Cropland)", "Value": f"{report_dict['Vegetated / Cropland']['f1-score']:.4f}"},
        {"Metric": "Precision (Urban)", "Value": f"{report_dict['Urban / Built-up / Non-veg']['precision']:.4f}"},
        {"Metric": "Recall (Urban)", "Value": f"{report_dict['Urban / Built-up / Non-veg']['recall']:.4f}"},
        {"Metric": "F1-Score (Urban)", "Value": f"{report_dict['Urban / Built-up / Non-veg']['f1-score']:.4f}"},
    ]
    pd.DataFrame(metrics_summary).to_csv(os.path.join(out_dir, "metrics_summary.csv"), index=False)
    print(f"[Saved] {os.path.join(out_dir, 'metrics_summary.csv')}")
    
    # ---------------------------------------------------------
    # 2. Deliverable 1: 2x2 Confusion Matrix Figure
    # ---------------------------------------------------------
    plt.figure(figsize=(6, 5), dpi=300)
    sns.heatmap(cm, annot=True, fmt="d", cmap="Greens",
                xticklabels=["Urban / Built-up", "Vegetated / Crop"],
                yticklabels=["Urban / Built-up", "Vegetated / Crop"],
                cbar=False, annot_kws={"size": 14, "weight": "bold"})
    plt.title("5.2.1 CNN Land Cover Confusion Matrix", fontsize=12, fontweight="bold", pad=12)
    plt.xlabel("CNN Predicted Class", fontsize=11, fontweight="bold")
    plt.ylabel("Ground-Truth Class", fontsize=11, fontweight="bold")
    plt.tight_layout()
    cm_fig_path = os.path.join(out_dir, "confusion_matrix.png")
    plt.savefig(cm_fig_path)
    plt.close()
    print(f"[Saved] {cm_fig_path}")
    
    # ---------------------------------------------------------
    # 3. Deliverable 2: Training & Validation Curves Figure
    # ---------------------------------------------------------
    if os.path.exists(history_csv):
        h_df = pd.read_csv(history_csv)
        plt.figure(figsize=(10, 4.5), dpi=300)
        
        plt.subplot(1, 2, 1)
        plt.plot(h_df['epoch'], h_df['train_loss'], 'o-', color='#1f77b4', label='Training Loss', lw=2)
        plt.plot(h_df['epoch'], h_df['val_loss'], 's--', color='#ff7f0e', label='Validation Loss', lw=2)
        plt.title("Loss Curves across Epochs", fontsize=11, fontweight="bold")
        plt.xlabel("Epoch")
        plt.ylabel("Cross-Entropy Loss")
        plt.legend(frameon=True)
        plt.grid(True, linestyle=":", alpha=0.6)
        
        plt.subplot(1, 2, 2)
        plt.plot(h_df['epoch'], h_df['train_accuracy'], 'o-', color='#2ca02c', label='Training Accuracy', lw=2)
        plt.plot(h_df['epoch'], h_df['val_accuracy'], 's--', color='#d62728', label='Validation Accuracy', lw=2)
        plt.title("Accuracy Curves across Epochs", fontsize=11, fontweight="bold")
        plt.xlabel("Epoch")
        plt.ylabel("Accuracy (%)")
        plt.legend(frameon=True)
        plt.grid(True, linestyle=":", alpha=0.6)
        
        plt.tight_layout()
        curve_fig_path = os.path.join(out_dir, "training_validation_curves.png")
        plt.savefig(curve_fig_path)
        plt.close()
        print(f"[Saved] {curve_fig_path}")

if __name__ == "__main__":
    evaluate_cnn()
