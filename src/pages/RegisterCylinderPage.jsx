import React, { useState, useEffect, useRef } from 'react';
import {
  PackagePlus,
  Scan,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  MapPin,
  Tag,
  Boxes,
  Zap,
  ListPlus,
  Info,
  Clock,
  Volume2
} from 'lucide-react';
import { playBeep, playSuccess, playError } from '../utils/sound';

export default function RegisterCylinderPage({ settings, onCylinderRegistered }) {
  const [registerMode, setRegisterMode] = useState('QUICK'); // 'QUICK' or 'DETAILED'

  // Quick-Scan Default Specifications
  const [quickGasTypeId, setQuickGasTypeId] = useState(settings?.gasTypes?.[0]?.id || '');
  const [quickVolumeId, setQuickVolumeId] = useState(settings?.gasVolumes?.[0]?.id || '');
  const [quickValveId, setQuickValveId] = useState(settings?.valveTypes?.[0]?.id || '');
  const [quickStatusId, setQuickStatusId] = useState('');
  const [quickLocationId, setQuickLocationId] = useState('');
  const [quickBatch, setQuickBatch] = useState('');

  // Scanner Input & State
  const [scanInput, setScanInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Detailed Form States
  const [detailGasId, setDetailGasId] = useState('');
  const [detailGasTypeId, setDetailGasTypeId] = useState(settings?.gasTypes?.[0]?.id || '');
  const [detailVolumeId, setDetailVolumeId] = useState(settings?.gasVolumes?.[0]?.id || '');
  const [detailValveId, setDetailValveId] = useState(settings?.valveTypes?.[0]?.id || '');
  const [detailStatusId, setDetailStatusId] = useState('');
  const [detailLocationId, setDetailLocationId] = useState('');
  const [detailBatch, setDetailBatch] = useState('');
  const [detailExpiry, setDetailExpiry] = useState('');
  const [detailNotes, setDetailNotes] = useState('');

  // Running log of newly registered cylinders in current session
  const [registeredSessionList, setRegisteredSessionList] = useState([]);

  const inputRef = useRef(null);
  const isScanningRef = useRef(false);

  // Initialize default location (Main Store) and default status (FULL)
  useEffect(() => {
    if (settings) {
      if (!quickGasTypeId && settings.gasTypes?.length > 0) setQuickGasTypeId(settings.gasTypes[0].id);
      if (!quickVolumeId && settings.gasVolumes?.length > 0) setQuickVolumeId(settings.gasVolumes[0].id);
      if (!quickValveId && settings.valveTypes?.length > 0) setQuickValveId(settings.valveTypes[0].id);

      const mainStore = settings.locations?.find(l => l.is_central_store || l.type === 'logistic');
      const storeId = mainStore?.id || settings.locations?.[0]?.id || '';
      if (!quickLocationId) setQuickLocationId(storeId);
      if (!detailLocationId) setDetailLocationId(storeId);

      const fullStatus = settings.statuses?.find(s => s.code === 'FULL');
      const statusId = fullStatus?.id || settings.statuses?.[0]?.id || '';
      if (!quickStatusId) setQuickStatusId(statusId);
      if (!detailStatusId) setDetailStatusId(statusId);
    }
  }, [settings]);

  // Keep scanner input focused in Quick mode
  useEffect(() => {
    if (registerMode === 'QUICK' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [registerMode]);

  // Smart barcode prefix auto-detection
  const detectSpecsFromBarcode = (barcode) => {
    if (!barcode || !settings) return null;
    const clean = barcode.trim().toLowerCase();

    // Search matching gas type
    let matchedGasType = settings.gasTypes?.find(gt => clean.startsWith(gt.code.toLowerCase()));

    // Search matching volume
    let matchedVolume = null;
    if (settings.gasVolumes) {
      // Sort by volume_value length descending to match 0.50 before 0.5
      const sortedVols = [...settings.gasVolumes].sort((a, b) => String(b.volume_value).length - String(a.volume_value).length);
      matchedVolume = sortedVols.find(gv => clean.includes(String(gv.volume_value).toLowerCase()));
    }

    // Search matching valve type
    let matchedValve = settings.valveTypes?.find(vt => clean.includes(vt.code.toLowerCase()));

    return {
      gasTypeId: matchedGasType?.id || null,
      volumeId: matchedVolume?.id || null,
      valveTypeId: matchedValve?.id || null,
    };
  };

  // Quick auto-detect when typing detailed barcode
  useEffect(() => {
    if (detailGasId.trim().length >= 3) {
      const detected = detectSpecsFromBarcode(detailGasId.trim());
      if (detected) {
        if (detected.gasTypeId) setDetailGasTypeId(detected.gasTypeId);
        if (detected.volumeId) setDetailVolumeId(detected.volumeId);
        if (detected.valveTypeId) setDetailValveId(detected.valveTypeId);
      }
    }
  }, [detailGasId]);

  // Handle Quick Scan Barcode Registration
  const handleProcessScan = async (rawCode) => {
    if (!rawCode) return;
    const cleanCode = rawCode.trim();
    if (cleanCode.length < 3) return;

    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setScanInput('');

    try {
      // 1. Check if cylinder is ALREADY registered
      const lookupRes = await fetch(`/api/cylinders/lookup/${encodeURIComponent(cleanCode)}`);
      if (lookupRes.ok) {
        const existing = await lookupRes.json();
        playError();
        setErrorMessage(
          `Cylinder "${cleanCode}" is ALREADY registered in the system (Status: ${existing.status_name}, Location: ${existing.location_name})!`
        );
        return;
      }

      // 2. Auto-detect specs from barcode prefix if possible, fallback to quick defaults
      const detected = detectSpecsFromBarcode(cleanCode);
      const targetGasTypeId = detected?.gasTypeId || quickGasTypeId;
      const targetVolumeId = detected?.volumeId || quickVolumeId;
      const targetValveId = detected?.valveTypeId || quickValveId;

      if (!targetGasTypeId || !targetVolumeId || !targetValveId) {
        playError();
        setErrorMessage(`Please select specifications for cylinder registration.`);
        return;
      }

      // 3. Register cylinder into database
      const regRes = await fetch('/api/cylinders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gas_id: cleanCode,
          gas_type_id: targetGasTypeId,
          gas_volume_id: targetVolumeId,
          valve_type_id: targetValveId,
          status_id: quickStatusId,
          current_location_id: quickLocationId,
          batch_number: quickBatch || '',
          notes: '',
        }),
      });

      const registered = await regRes.json();
      if (!regRes.ok) {
        throw new Error(registered.error || 'Failed to register cylinder');
      }

      playSuccess();
      setSuccessMessage(`Successfully registered ${registered.gas_id} (${registered.name})!`);
      setRegisteredSessionList(prev => [
        {
          ...registered,
          registeredAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);

      if (onCylinderRegistered) onCylinderRegistered();
    } catch (err) {
      playError();
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
      isScanningRef.current = false;
      if (inputRef.current) inputRef.current.focus();
    }
  };

  // Debounced auto-submit for scanner in Quick mode
  useEffect(() => {
    if (registerMode !== 'QUICK' || !scanInput || scanInput.trim().length < 3) return;

    const timer = setTimeout(() => {
      if (scanInput.trim().length >= 3 && !isScanningRef.current) {
        handleProcessScan(scanInput.trim());
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [scanInput, registerMode]);

  // Submit Detailed Form Registration
  const handleDetailSubmit = async (e) => {
    e.preventDefault();
    if (!detailGasId.trim()) {
      setErrorMessage('Please scan or enter a Gas ID / Barcode');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const regRes = await fetch('/api/cylinders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gas_id: detailGasId.trim(),
          gas_type_id: detailGasTypeId,
          gas_volume_id: detailVolumeId,
          valve_type_id: detailValveId,
          status_id: detailStatusId,
          current_location_id: detailLocationId,
          batch_number: detailBatch || null,
          expiry_date: detailExpiry || null,
          notes: detailNotes || null,
        }),
      });

      const registered = await regRes.json();
      if (!regRes.ok) {
        throw new Error(registered.error || 'Failed to register cylinder');
      }

      playSuccess();
      setSuccessMessage(`Successfully registered ${registered.gas_id} (${registered.name})!`);
      setRegisteredSessionList(prev => [
        {
          ...registered,
          registeredAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);

      setDetailGasId('');
      setDetailBatch('');
      setDetailExpiry('');
      setDetailNotes('');
      if (onCylinderRegistered) onCylinderRegistered();
    } catch (err) {
      playError();
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (code, name) => {
    switch (code) {
      case 'FULL': return <span className="badge badge-emerald">{name || 'Full'}</span>;
      case 'ISSUED': return <span className="badge badge-blue">{name || 'In-Use'}</span>;
      case 'EMPTY': return <span className="badge badge-amber">{name || 'Empty'}</span>;
      default: return <span className="badge badge-gray">{name || code}</span>;
    }
  };

  return (
    <div>
      {/* Header Context Banner */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <PackagePlus size={26} strokeWidth={2.2} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Register New Gas Cylinders</h2>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Affix pre-printed barcode labels from your drawer, then scan them here to officially enter cylinders into inventory.
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="nav-tabs" style={{ display: 'inline-flex' }}>
          <button
            type="button"
            className={`nav-tab-btn ${registerMode === 'QUICK' ? 'active' : ''}`}
            onClick={() => setRegisterMode('QUICK')}
          >
            <Zap size={16} />
            <span>⚡ Rapid Scan Register</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${registerMode === 'DETAILED' ? 'active' : ''}`}
            onClick={() => setRegisterMode('DETAILED')}
          >
            <ListPlus size={16} />
            <span>Detailed Register</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flash-message success" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem' }}>
          <CheckCircle2 size={20} color="#059669" />
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{successMessage}</div>
        </div>
      )}

      {errorMessage && (
        <div className="flash-message error" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.25rem' }}>
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{errorMessage}</div>
        </div>
      )}

      {/* Mode 1: RAPID QUICK-SCAN REGISTER */}
      {registerMode === 'QUICK' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Default Preset Specs Box */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ fontSize: '1rem' }}>
                <Boxes size={18} color="var(--primary)" /> Batch Preset Specifications
              </h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Select default specifications for the batch of cylinders you are currently unboxing/stickering.
            </p>

            <div className="form-group">
              <label className="form-label">Gas Type</label>
              <select
                className="form-select"
                value={quickGasTypeId}
                onChange={(e) => setQuickGasTypeId(e.target.value)}
              >
                {settings?.gasTypes?.map(gt => (
                  <option key={gt.id} value={gt.id}>
                    {gt.name} ({gt.code})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Volume Size</label>
                <select
                  className="form-select"
                  value={quickVolumeId}
                  onChange={(e) => setQuickVolumeId(e.target.value)}
                >
                  {settings?.gasVolumes?.map(gv => (
                    <option key={gv.id} value={gv.id}>
                      {gv.display_label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Valve Connection</label>
                <select
                  className="form-select"
                  value={quickValveId}
                  onChange={(e) => setQuickValveId(e.target.value)}
                >
                  {settings?.valveTypes?.map(vt => (
                    <option key={vt.id} value={vt.id}>
                      {vt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Location</label>
                <select
                  className="form-select"
                  value={quickLocationId}
                  onChange={(e) => setQuickLocationId(e.target.value)}
                >
                  {settings?.locations?.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.is_central_store ? '(Stor Utama)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={quickStatusId}
                  onChange={(e) => setQuickStatusId(e.target.value)}
                >
                  {settings?.statuses?.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Batch / Refill Lot (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder=""
                value={quickBatch}
                onChange={(e) => setQuickBatch(e.target.value)}
              />
            </div>
          </div>

          {/* Quick Scanner Box */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(16,185,129,0.06))',
              border: '2px dashed var(--primary)',
              borderRadius: 'var(--radius-lg)',
              padding: '2.5rem 2rem',
              textAlign: 'center'
            }}>
              <Scan size={52} color="var(--primary)" style={{ margin: '0 auto 1rem', strokeWidth: 1.6 }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.4rem' }}>
                Scan Cylinder Barcode Sticker
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 1.5rem' }}>
                Aim your wireless 2D scanner at the barcode sticker on the cylinder. The system will register it instantly into inventory.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (scanInput.trim()) handleProcessScan(scanInput.trim());
                }}
                style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', gap: '0.5rem' }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  className="form-input"
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'center',
                    padding: '0.75rem 1rem',
                    letterSpacing: '1px'
                  }}
                  placeholder="Scan or enter barcode..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  disabled={isProcessing}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '0 1.5rem', fontWeight: 700 }}
                  disabled={isProcessing || !scanInput.trim()}
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={18} /> : 'Register'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.25rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>⚡ <strong>Continuous Mode:</strong> Auto-submits on scanner pause</span>
                <span>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Volume2 size={13} /> Chime enabled</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: DETAILED FORM REGISTER */}
      {registerMode === 'DETAILED' && (
        <div className="card" style={{ maxWidth: '780px', margin: '0 auto 1.5rem' }}>
          <div className="card-header">
            <h3 className="card-title">
              <ListPlus size={20} color="var(--primary)" /> Single Cylinder Registration Form
            </h3>
          </div>

          <form onSubmit={handleDetailSubmit} style={{ padding: '0.5rem 0' }}>
            <div className="form-group">
              <label className="form-label">
                Gas ID / Barcode *
              </label>
              <input
                type="text"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem' }}
                placeholder="e.g. ox0.50pi1 or scan sticker"
                value={detailGasId}
                onChange={(e) => setDetailGasId(e.target.value)}
                required
                autoFocus
              />
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                💡 Tip: Scanning standard prefixes (e.g. ox, no, co) automatically populates Gas Type, Volume, and Valve Type below.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Gas Type *</label>
                <select
                  className="form-select"
                  value={detailGasTypeId}
                  onChange={(e) => setDetailGasTypeId(e.target.value)}
                  required
                >
                  {settings?.gasTypes?.map(gt => (
                    <option key={gt.id} value={gt.id}>{gt.name} ({gt.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Volume Size *</label>
                <select
                  className="form-select"
                  value={detailVolumeId}
                  onChange={(e) => setDetailVolumeId(e.target.value)}
                  required
                >
                  {settings?.gasVolumes?.map(gv => (
                    <option key={gv.id} value={gv.id}>{gv.display_label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Valve Connection *</label>
                <select
                  className="form-select"
                  value={detailValveId}
                  onChange={(e) => setDetailValveId(e.target.value)}
                  required
                >
                  {settings?.valveTypes?.map(vt => (
                    <option key={vt.id} value={vt.id}>{vt.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Current Physical Location *</label>
                <select
                  className="form-select"
                  value={detailLocationId}
                  onChange={(e) => setDetailLocationId(e.target.value)}
                  required
                >
                  {settings?.locations?.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.is_central_store ? '(Main Store)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Cylinder Status *</label>
                <select
                  className="form-select"
                  value={detailStatusId}
                  onChange={(e) => setDetailStatusId(e.target.value)}
                  required
                >
                  {settings?.statuses?.map(st => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Supplier Batch Number (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. GPT-2026-OX"
                  value={detailBatch}
                  onChange={(e) => setDetailBatch(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Gas Expiry Date (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  value={detailExpiry}
                  onChange={(e) => setDetailExpiry(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Registration Notes (Optional)</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Inspection notes, delivery consignment details, etc."
                value={detailNotes}
                onChange={(e) => setDetailNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '0.65rem 1.75rem', fontWeight: 700 }}
                disabled={isProcessing}
              >
                {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <PackagePlus size={16} />}
                Register Cylinder into Inventory
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SESSION LOG: Newly Registered Cylinders Table */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h3 className="card-title">
              Recently Registered in this Session
            </h3>
            <span className="badge badge-emerald">
              {registeredSessionList.length} cylinders added
            </span>
          </div>

          {registeredSessionList.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              onClick={() => setRegisteredSessionList([])}
            >
              Clear Session Log
            </button>
          )}
        </div>

        {registeredSessionList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <Clock size={40} strokeWidth={1.5} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No Cylinders Registered in this Session Yet</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Scan or enter a cylinder barcode above to register new stock into the hospital.
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Gas ID / Barcode</th>
                  <th>Cylinder Description</th>
                  <th>Gas Type</th>
                  <th>Volume</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Batch</th>
                  <th>Registered At</th>
                </tr>
              </thead>
              <tbody>
                {registeredSessionList.map((item, index) => (
                  <tr key={`${item.gas_id}-${index}`}>
                    <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
                      {registeredSessionList.length - index}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
                        {item.gas_id}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: item.gas_type_color || '#3b82f6',
                          marginRight: '6px'
                        }}
                      />
                      {item.gas_type_name}
                    </td>
                    <td>{item.volume_label || item.display_label || '-'}</td>
                    <td>{getStatusBadge(item.status_code, item.status_name)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <MapPin size={13} color="var(--primary)" />
                        <span>{item.location_name || 'Main Store'}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {item.batch_number || '-'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {item.registeredAt || 'Just now'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
