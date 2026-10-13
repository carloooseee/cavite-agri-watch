import { useState } from 'react';
import { AgriApi } from '../services/api';

type Row = Record<string, string | number>;

interface Evidence {
  models_loaded: Record<string, boolean>;
  cnn_landcover: { metrics: Row[]; confusion_matrix: string | null };
  multispectral_vigor: { correlation_heatmap: string | null };
  crop_stress_prediction: { regression_metrics: Row[]; scatter: string | null; feature_importance_chart: string | null };
  ground_truth_agreement: { kappa_summary: Row[]; contingency_matrix: string | null };
}

const img = (b64: string | null, alt: string) =>
  b64 ? <img src={`data:image/png;base64,${b64}`} alt={alt} style={{ width: '100%', borderRadius: '4px', marginTop: '4px' }} /> : null;

const table = (rows: Row[]) => (
  <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
    <tbody>
      {rows.map((r, i) => {
        const [k, v] = Object.values(r);
        return (
          <tr key={i} style={{ borderBottom: '1px solid #EDF2F7' }}>
            <td style={{ padding: '2px 4px' }}>{String(k)}</td>
            <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: 'bold' }}>{String(v)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

export default function ValidationEvidence() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState('');

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      try {
        setData(await AgriApi.getValidationEvidence());
      } catch {
        setError('Could not load validation evidence.');
      }
    }
  };

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontWeight: 'bold', fontSize: '0.75rem', color: '#2D3748' }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div id="validation-evidence" style={{ marginTop: '12px', borderTop: '1px solid #CBD5E0', paddingTop: '8px' }}>
      <button
        id="toggle-validation-evidence"
        onClick={toggle}
        style={{ background: 'none', border: 'none', color: '#2B6CB0', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem', padding: 0 }}
      >
        {open ? 'Hide Model Validation Evidence' : 'Show Model Validation Evidence'}
      </button>
      {open && error && <p style={{ color: '#b22222', fontSize: '0.75rem' }}>{error}</p>}
      {open && !data && !error && <p style={{ fontSize: '0.75rem' }}>Loading...</p>}
      {open && data && (
        <div>
          {section('5.2.1 CNN Land-Cover', <>{table(data.cnn_landcover.metrics.slice(0, 4))}{img(data.cnn_landcover.confusion_matrix, 'CNN confusion matrix')}</>)}
          {section('5.2.2 Multispectral Vigor Indices', img(data.multispectral_vigor.correlation_heatmap, 'Index correlation heatmap'))}
          {section('5.2.3 Random Forest 30-Day Stress Prediction', <>{table(data.crop_stress_prediction.regression_metrics)}{img(data.crop_stress_prediction.scatter, 'Actual vs predicted')}{img(data.crop_stress_prediction.feature_importance_chart, 'Feature importance')}</>)}
          {section('5.2.4 OPA Ground-Truth Agreement', <>{table(data.ground_truth_agreement.kappa_summary.slice(0, 3))}{img(data.ground_truth_agreement.contingency_matrix, 'OPA contingency matrix')}</>)}
        </div>
      )}
    </div>
  );
}
