import pytest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import paper_models

def test_paper_models_status():
    """Verify paper_models status dictionary contains all 4 models."""
    status = paper_models.status()
    assert isinstance(status, dict)
    assert "rf_regressor" in status
    assert "rf_classifier" in status
    assert "cnn_landcover" in status
    assert "opa_calibrator" in status

def test_tier_mappings():
    """Verify all 4 tiers are mapped accurately to dashboard vocabulary."""
    assert paper_models.TIER_TO_DASHBOARD["Optimal"] == "No Stress"
    assert paper_models.TIER_TO_DASHBOARD["Mild Stress"] == "Mild Stress"
    assert paper_models.TIER_TO_DASHBOARD["Moderate Stress"] == "Moderate Stress"
    assert paper_models.TIER_TO_DASHBOARD["Severe Stress"] == "Severe Stress"

def test_tier_text_advice():
    """Verify expert advice texts exist for every dashboard tier."""
    for tier in ["No Stress", "Mild Stress", "Moderate Stress", "Severe Stress"]:
        assert tier in paper_models.TIER_TEXT
        meaning, advice = paper_models.TIER_TEXT[tier]
        assert len(meaning) > 0
        assert len(advice) > 0

def test_validation_evidence():
    """Verify validation_evidence outputs valid dictionary with figures/tables."""
    evidence = paper_models.validation_evidence()
    assert isinstance(evidence, dict)
    assert "models_loaded" in evidence
    assert "cnn_landcover" in evidence
    assert "multispectral_vigor" in evidence
    assert "crop_stress_prediction" in evidence
    assert "ground_truth_agreement" in evidence
