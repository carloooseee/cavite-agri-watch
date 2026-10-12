import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import pandas as pd
import numpy as np

# -------------------------------------------------------------
# 1. Dataset Loader for Sentinel-2 64x64 4-Band Patches
# -------------------------------------------------------------
class SentinelPatchDataset(Dataset):
    def __init__(self, csv_file, root_dir="../../"):
        self.df = pd.read_csv(csv_file)
        self.root_dir = root_dir
        
    def __len__(self):
        return len(self.df)
        
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        patch_path = os.path.join(self.root_dir, row['relative_patch_path'])
        
        # Load .npy patch: shape (64, 64, 4) -> [Blue, Green, Red, NIR]
        patch = np.load(patch_path).astype(np.float32)
        
        # Transpose to PyTorch standard: (Channels, Height, Width) = (4, 64, 64)
        patch = np.transpose(patch, (2, 0, 1))
        
        # Normalize/clip values
        patch = np.clip(patch / 0.5, 0.0, 1.0)
        
        label = int(row['target_class'])
        return torch.tensor(patch, dtype=torch.float32), torch.tensor(label, dtype=torch.long)

# -------------------------------------------------------------
# 2. CNN Architecture for Land-Cover Spatial Masking
# -------------------------------------------------------------
class LandCoverCNN(nn.Module):
    def __init__(self, in_channels=4, num_classes=2):
        super(LandCoverCNN, self).__init__()
        # Conv Block 1: 4 -> 32
        self.conv1 = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2) # 64 -> 32
        )
        # Conv Block 2: 32 -> 64
        self.conv2 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2) # 32 -> 16
        )
        # Conv Block 3: 64 -> 128
        self.conv3 = nn.Sequential(
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2) # 16 -> 8
        )
        # Global Avg Pooling & Classifier
        self.gap = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(128, 64),
            nn.ReLU(inplace=True),
            nn.Linear(64, num_classes)
        )
        
    def forward(self, x):
        x = self.conv1(x)
        x = self.conv2(x)
        x = self.conv3(x)
        x = self.gap(x)
        return self.classifier(x)

# -------------------------------------------------------------
# 3. Training Loop
# -------------------------------------------------------------
def train_model(epochs=15, batch_size=32, lr=0.001):
    print("=" * 65)
    print("  5.2.1 CNN LAND-COVER MODEL TRAINING PIPELINE")
    print("=" * 65)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")
    
    csv_file = "labeled_patches_dataset.csv"
    if not os.path.exists(csv_file):
        # Allow running from project root or inside folder
        csv_file = "models/cnn_landcover/labeled_patches_dataset.csv"
        root_dir = "."
    else:
        root_dir = "../../"
        
    dataset = SentinelPatchDataset(csv_file=csv_file, root_dir=root_dir)
    
    # 80/20 Train/Val Split
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_set, val_set = torch.utils.data.random_split(
        dataset, [train_size, val_size], generator=torch.Generator().manual_seed(42)
    )
    
    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False)
    
    print(f"Total labeled patches: {len(dataset)} | Train: {train_size} | Val: {val_size}")
    
    model = LandCoverCNN(in_channels=4, num_classes=2).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    
    history = []
    
    for epoch in range(1, epochs + 1):
        # Training Phase
        model.train()
        train_loss, train_correct = 0.0, 0
        for inputs, targets in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item() * inputs.size(0)
            preds = outputs.argmax(dim=1)
            train_correct += (preds == targets).sum().item()
            
        epoch_train_loss = train_loss / train_size
        epoch_train_acc = (train_correct / train_size) * 100.0
        
        # Validation Phase
        model.eval()
        val_loss, val_correct = 0.0, 0
        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                loss = criterion(outputs, targets)
                val_loss += loss.item() * inputs.size(0)
                preds = outputs.argmax(dim=1)
                val_correct += (preds == targets).sum().item()
                
        epoch_val_loss = val_loss / val_size
        epoch_val_acc = (val_correct / val_size) * 100.0
        
        print(f"Epoch [{epoch:02d}/{epochs:02d}] "
              f"Train Loss: {epoch_train_loss:.4f} | Train Acc: {epoch_train_acc:.2f}% | "
              f"Val Loss: {epoch_val_loss:.4f} | Val Acc: {epoch_val_acc:.2f}%")
        
        history.append({
            'epoch': epoch,
            'train_loss': round(epoch_train_loss, 4),
            'train_accuracy': round(epoch_train_acc, 2),
            'val_loss': round(epoch_val_loss, 4),
            'val_accuracy': round(epoch_val_acc, 2)
        })
        
    # Save Model Weights and Training History
    save_dir = os.path.dirname(csv_file) if "/" in csv_file else "."
    weights_path = os.path.join(save_dir, "cnn_landcover_model.pt")
    history_path = os.path.join(save_dir, "training_history.csv")
    
    torch.save(model.state_dict(), weights_path)
    pd.DataFrame(history).to_csv(history_path, index=False)
    
    print("-" * 65)
    print(f"Model checkpoint saved -> {weights_path}")
    print(f"Epoch logs saved       -> {history_path}")
    print("=" * 65)

if __name__ == "__main__":
    train_model(epochs=15, batch_size=32, lr=0.001)
