import { useState, useEffect } from 'react';
import {
  Printer,
  PlusCircle,
  QrCode,
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Flame
} from 'lucide-react';
import BarcodeRenderer from '../components/BarcodeRenderer';

const formatDateDDMMYYYY = (val) => {
  if (!val) val = new Date();
  if (typeof val === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
    return val;
  }
  const d = typeof val === 'string' || typeof val === 'number' ? new Date(val) : val;
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export default function LabelRegistrationPage({ settings, onCylinderCreated, initialCylinderForPrint }) {
  const [mode, setMode] = useState('SINGLE'); // 'BULK' or 'SINGLE'

  // Single Cylinder Registration States
  const [singleGasId, setSingleGasId] = useState('');
  const [singleGasTypeId, setSingleGasTypeId] = useState(settings?.gasTypes?.[0]?.id || '');
  const [singleVolumeId, setSingleVolumeId] = useState(settings?.gasVolumes?.[0]?.id || '');
  const [singleValveId, setSingleValveId] = useState(settings?.valveTypes?.[0]?.id || '');
  const [singleBatch, setSingleBatch] = useState('');
  const [singleExpiry, setSingleExpiry] = useState('');

  // Bulk Standby Barcode Generator States (Option 2 from specs)
  const [bulkGasTypeId, setBulkGasTypeId] = useState(settings?.gasTypes?.[0]?.id || '');
  const [bulkVolumeId, setBulkVolumeId] = useState(settings?.gasVolumes?.[0]?.id || '');
  const [bulkValveId, setBulkValveId] = useState(settings?.valveTypes?.[0]?.id || '');
  const [bulkQuantity, setBulkQuantity] = useState(4);
  const [bulkBatch, setBulkBatch] = useState('');

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [previewLabels, setPreviewLabels] = useState(
    initialCylinderForPrint ? [{
      ...initialCylinderForPrint,
      date: formatDateDDMMYYYY(initialCylinderForPrint.date || initialCylinderForPrint.created_at || new Date())
    }] : []
  );

  useEffect(() => {
    if (initialCylinderForPrint) {
      setPreviewLabels([{
        ...initialCylinderForPrint,
        date: formatDateDDMMYYYY(initialCylinderForPrint.date || initialCylinderForPrint.created_at || new Date())
      }]);
    }
  }, [initialCylinderForPrint]);

  // Auto-generate sequential running ID (checks previous instance of same type and +1)
  const generateSuggestedId = async () => {
    if (!singleGasTypeId || !singleVolumeId || !singleValveId) return;

    try {
      const res = await fetch(
        `/api/cylinders/next-id?gas_type_id=${singleGasTypeId}&gas_volume_id=${singleVolumeId}&valve_type_id=${singleValveId}`
      );
      if (res.ok) {
        const data = await res.json();
        setSingleGasId(data.next_id);
      }
    } catch (err) {
      console.error('Failed to get next sequential ID:', err);
    }
  };

  // Automatically refresh suggested sequential ID whenever specifications change
  useEffect(() => {
    if (mode === 'SINGLE' && singleGasTypeId && singleVolumeId && singleValveId) {
      generateSuggestedId();
    }
  }, [mode, singleGasTypeId, singleVolumeId, singleValveId]);

  const handleRegisterSingle = (e) => {
    e.preventDefault();
    if (!singleGasId.trim()) {
      setErrorMessage('Please enter or generate a Gas ID / Barcode');
      return;
    }

    const gt = settings?.gasTypes?.find(g => g.id === singleGasTypeId);
    const gv = settings?.gasVolumes?.find(g => g.id === singleVolumeId);
    const vt = settings?.valveTypes?.find(v => v.id === singleValveId);

    const singleLabel = {
      gas_id: singleGasId.trim(),
      name: `${gt?.name || 'Gas'} ${gv?.display_label || ''} ${vt?.name || ''}`.trim(),
      gas_type_name: gt?.name,
      gas_type_color: gt?.color_code,
      volume_label: gv?.display_label,
      display_label: gv?.display_label,
      valve_type_name: vt?.name,
      batch_number: singleBatch || '',
      date: formatDateDDMMYYYY(new Date()),
    };

    setPreviewLabels([singleLabel]);
    setSuccessMessage(`Prepared label for ${singleGasId.trim()}! Ready for thermal printing.`);
  };

  const handleGenerateBulk = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/labels/preview-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gas_type_id: bulkGasTypeId,
          gas_volume_id: bulkVolumeId,
          valve_type_id: bulkValveId,
          quantity: bulkQuantity,
          batch_number: bulkBatch,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate bulk labels');

      setSuccessMessage(`Generated ${data.count} standby labels for printing! Numbered from registered sequence (${data.labels[0]?.gas_id} - ${data.labels[data.labels.length - 1]?.gas_id}).`);
      setPreviewLabels(data.labels);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLabels = () => {
    if (!previewLabels || previewLabels.length === 0) return;

    const printableArea = document.querySelector('.printable-label-area');
    if (!printableArea) {
      window.print();
      return;
    }

    // Remove any previously appended iframe
    const existingFrame = document.getElementById('thermal-print-frame');
    if (existingFrame) existingFrame.remove();

    // Create an isolated iframe for clean Zebra thermal label printing (90mm x 60mm)
    const iframe = document.createElement('iframe');
    iframe.id = 'thermal-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Medical Gas Thermal Labels</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            @page {
              size: 90mm 60mm;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .printable-label-area {
              margin: 0 !important;
              padding: 0 !important;
              display: block !important;
            }
            .print-label-page {
              width: 90mm !important;
              height: 60mm !important;
              min-width: 90mm !important;
              min-height: 60mm !important;
              max-width: 90mm !important;
              max-height: 60mm !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              opacity: 1 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              box-sizing: border-box !important;
              background: #ffffff !important;
            }
            .print-label-page:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            .label-preview-card {
              width: 86mm !important;
              height: 56mm !important;
              min-width: 86mm !important;
              min-height: 56mm !important;
              max-width: 86mm !important;
              max-height: 56mm !important;
              border: 2px solid #000000 !important;
              border-radius: 0 !important;
              padding: 2.5mm 3.5mm !important;
              background: #ffffff !important;
              color: #000000 !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              box-sizing: border-box !important;
              box-shadow: none !important;
              text-shadow: none !important;
              opacity: 1 !important;
              filter: none !important;
            }
            .label-preview-card,
            .label-preview-card * {
              color: #000000 !important;
              border-color: #000000 !important;
              opacity: 1 !important;
              box-shadow: none !important;
              text-shadow: none !important;
              filter: none !important;
            }
            .label-header {
              border-bottom: 2px solid #000000 !important;
              padding-bottom: 1.5mm !important;
              margin-bottom: 1.5mm !important;
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              color: #000000 !important;
            }
            .label-barcode-box {
              margin: 1.2mm 0 !important;
              background: #ffffff !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              display: flex !important;
              justify-content: center !important;
              align-items: center !important;
              overflow: hidden !important;
              padding: 1mm 0 !important;
            }
            .label-barcode-box svg {
              max-width: 100% !important;
              height: auto !important;
              display: block !important;
              shape-rendering: crispEdges !important;
            }
            .label-footer {
              border-top: 1.5px solid #000000 !important;
              color: #000000 !important;
              background: #ffffff !important;
            }
          </style>
        </head>
        <body>
          <div class="printable-label-area">
            ${printableArea.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  };

  return (
    <div className="label-registration-page">
      <div className="label-registration-grid">

        {/* Left Form: Registration Controls */}
        <div className="label-form-column no-print">
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">
                <QrCode size={20} color="var(--primary)" />
                Label & Barcode Generator
              </h3>
            </div>

            {/* Mode Tabs */}
            <div className="nav-tabs" style={{ display: 'flex', width: '100%', marginBottom: '1.25rem' }}>
              <button
                type="button"
                className={`nav-tab-btn ${mode === 'BULK' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setMode('BULK')}
              >
                <Layers size={16} /> Bulk Standby Labels
              </button>
              <button
                type="button"
                className={`nav-tab-btn ${mode === 'SINGLE' ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setMode('SINGLE')}
              >
                <PlusCircle size={16} /> Custom Single Label
              </button>
            </div>

            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              lineHeight: 1.45
            }}>
              💡 <strong>Standby Drawer Labels:</strong> Labels generated here are print-ready stickers for your drawer. Numbering counts <em>registered</em> cylinders only. When stickers are attached to incoming cylinders, register them on the <strong>Register Cylinder</strong> page.
            </div>

            {successMessage && (
              <div className="flash-message success" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                <CheckCircle2 size={20} color="#059669" />
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{successMessage}</div>
              </div>
            )}

            {errorMessage && (
              <div className="flash-message error" style={{ padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                <AlertCircle size={20} color="#dc2626" />
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{errorMessage}</div>
              </div>
            )}

            {mode === 'BULK' ? (
              /* Bulk Standby Generation Form (Option 2 from specs) */
              <form onSubmit={handleGenerateBulk}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                  📄 <strong>Workflow</strong>: Pre-print label sticker in batches to keep them on standby in the store and paste directly on tanks received from vendor.
                </div>

                <div className="form-group">
                  <label className="form-label">Gas Type</label>
                  <select
                    className="form-select"
                    value={bulkGasTypeId}
                    onChange={(e) => setBulkGasTypeId(e.target.value)}
                  >
                    {settings?.gasTypes?.map(gt => (
                      <option key={gt.id} value={gt.id}>{gt.name} ({gt.code})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Gas Volume</label>
                  <select
                    className="form-select"
                    value={bulkVolumeId}
                    onChange={(e) => setBulkVolumeId(e.target.value)}
                  >
                    {settings?.gasVolumes?.map(gv => (
                      <option key={gv.id} value={gv.id}>{gv.display_label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Valve Type</label>
                  <select
                    className="form-select"
                    value={bulkValveId}
                    onChange={(e) => setBulkValveId(e.target.value)}
                  >
                    {settings?.valveTypes?.map(vt => (
                      <option key={vt.id} value={vt.id}>{vt.name} ({vt.code})</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Quantity to Generate</label>
                    <select
                      className="form-select"
                      value={bulkQuantity}
                      onChange={(e) => setBulkQuantity(Number(e.target.value))}
                    >
                      <option value={2}>2 Stickers</option>
                      <option value={4}>4 Stickers</option>
                      <option value={8}>8 Stickers</option>
                      <option value={12}>12 Stickers</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Batch Label</label>
                    <input
                      type="text"
                      className="form-input"
                      value={bulkBatch}
                      onChange={(e) => setBulkBatch(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.75rem' }}
                  disabled={loading}
                >
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <Layers size={16} />}
                  Generate {bulkQuantity} Standby Labels
                </button>
              </form>
            ) : (
              /* Single Cylinder Register Form */
              <form onSubmit={handleRegisterSingle}>
                <div className="form-group">
                  <label className="form-label">Gas ID / Scannable Barcode *</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                      placeholder="e.g. ox0.5pi99 or scan existing"
                      value={singleGasId}
                      onChange={(e) => setSingleGasId(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={generateSuggestedId}
                      title="Generate suggested format ID"
                    >
                      Auto-ID
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Gas Type</label>
                  <select
                    className="form-select"
                    value={singleGasTypeId}
                    onChange={(e) => setSingleGasTypeId(e.target.value)}
                  >
                    {settings?.gasTypes?.map(gt => (
                      <option key={gt.id} value={gt.id}>{gt.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Volume</label>
                  <select
                    className="form-select"
                    value={singleVolumeId}
                    onChange={(e) => setSingleVolumeId(e.target.value)}
                  >
                    {settings?.gasVolumes?.map(gv => (
                      <option key={gv.id} value={gv.id}>{gv.display_label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Valve Type</label>
                  <select
                    className="form-select"
                    value={singleValveId}
                    onChange={(e) => setSingleValveId(e.target.value)}
                  >
                    {settings?.valveTypes?.map(vt => (
                      <option key={vt.id} value={vt.id}>{vt.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Refill Batch</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. GPT-2026-OX"
                      value={singleBatch}
                      onChange={(e) => setSingleBatch(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Expiry Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={singleExpiry}
                      onChange={(e) => setSingleExpiry(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.75rem' }}
                  disabled={loading}
                >
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <PlusCircle size={16} />}
                  Generate Single Standby Label
                </button>
              </form>
            )}
          </div>

          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Printer Specifications (Zebra ZD420 / Toshiba)
            </div>
            <ul style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
              <li><strong>Label Stock:</strong> Polyester (PET) peel-and-stick labels.</li>
              <li><strong>Ribbon:</strong> High chemical and scratch resistant Resin Ribbon.</li>
              <li><strong>Protection:</strong> Overlaminate clear protector / heavy-duty packing tape.</li>
              <li>Withstands pressure washing and medical steam disinfection.</li>
            </ul>
          </div>
        </div>

        {/* Right: Printable Label Preview Area */}
        <div className="card label-preview-card-container">
          <div className="card-header no-print">
            <div>
              <h3 className="card-title">
                <Printer size={20} color="var(--primary)" />
                Thermal Label Preview
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Polyester (PET) Peel-and-Stick Layout (90mm W × 60mm H — Zebra ZD420)
              </div>
            </div>

            {previewLabels.length > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrintLabels}
              >
                <Printer size={16} /> Print {previewLabels.length} Label(s)
              </button>
            )}
          </div>

          {previewLabels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
              <QrCode size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              <div style={{ fontWeight: 600 }}>No Labels In Preview Queue</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                Generate standby labels on the left or click "Print Label" on any cylinder in the Inventory page.
              </div>
            </div>
          ) : (
            <div
              className="printable-label-area"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                alignItems: 'center',
                padding: '1rem',
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              {previewLabels.map((lbl, idx) => (
                <div key={`${lbl.gas_id}-${idx}`} className="print-label-page">
                  <div className="label-preview-card">
                    {/* Label Header */}
                    <div className="label-header">
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          HOSPITAL SEGAMAT
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#000000', fontWeight: 600 }}>
                          UNIT FARMASI LOGISTIK
                        </div>
                      </div>
                      <Flame size={16} color="#000000" />
                    </div>

                    {/* Gas Details */}
                    <div style={{ textAlign: 'left', marginBottom: '1.5mm' }}>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, textTransform: 'uppercase', color: '#000000' }}>
                        {lbl.gas_type_name || lbl.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#000000' }}>
                        Volume: {lbl.volume_label || lbl.display_label || '-'} - {lbl.valve_type_name || '-'}
                      </div>
                    </div>

                    {/* Real Scannable Barcode with Gas ID Text Below */}
                    <div className="label-barcode-box">
                      <BarcodeRenderer value={lbl.gas_id} height={36} width={1.5} fontSize={11} displayValue={true} />
                    </div>

                    {/* Label Footer */}
                    <div className="label-footer" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#000000', borderTop: '1.5px solid #000000', paddingTop: '1.5mm', fontWeight: 700 }}>
                      <div><strong>Batch:</strong> {lbl.batch_number || ' '}</div>
                      <div><strong>Date:</strong> {formatDateDDMMYYYY(lbl.date || lbl.created_at || new Date())}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
