import React from 'react';
import { Scan, Sparkles } from 'lucide-react';

export default function DemoBarcodeBar({ onSimulateScan }) {
  const sampleBarcodes = [
    'ox0.50pi1',
    'ox0.50pi2',
    'ox1.40bn1',
    'ox1.40bn2',
    'ox1.40bn3',
  ];

  return (
    <div className="demo-helper-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
        <Sparkles size={14} color="#f59e0b" />
        <span>Quick Scan Demo:</span>
      </div>
      {sampleBarcodes.map((code) => (
        <button
          key={code}
          type="button"
          className="demo-chip"
          onClick={() => onSimulateScan(code)}
          title={`Click to simulate scanning ${code}`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
