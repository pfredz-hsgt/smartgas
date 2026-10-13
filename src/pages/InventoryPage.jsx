import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Boxes,
  Search,
  Filter,
  Printer,
  RefreshCw,
  FileSpreadsheet,
  MapPin,
  Tag,
  CheckCircle2,
  Building,
  QrCode,
  Edit3,
  Trash2,
  X,
  AlertCircle
} from 'lucide-react';
import { API_BASE } from '../utils/api';

export default function InventoryPage({ settings, onSelectPrintLabel, onCylinderUpdated }) {
  const [cylinders, setCylinders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedGasTypeId, setSelectedGasTypeId] = useState('');
  const [selectedStatusId, setSelectedStatusId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [viewScope, setViewScope] = useState('ALL_HOSPITAL'); // 'ALL_HOSPITAL', 'STORE_ONLY', 'VENDOR_ONLY'
  const searchRequestIdRef = useRef(0);

  // Edit Cylinder States
  const [editingCylinder, setEditingCylinder] = useState(null);
  const [editStatusId, setEditStatusId] = useState('');
  const [editLocationId, setEditLocationId] = useState('');
  const [editBatch, setEditBatch] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editGasTypeId, setEditGasTypeId] = useState('');
  const [editGasVolumeId, setEditGasVolumeId] = useState('');
  const [editValveTypeId, setEditValveTypeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  // Delete Cylinder States
  const [cylinderToDelete, setCylinderToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState(null);
  const [successFlash, setSuccessFlash] = useState(null);

  const openEditModal = (cyl) => {
    setEditingCylinder(cyl);
    setEditStatusId(cyl.status_id || '');
    setEditLocationId(cyl.location_id || '');
    setEditBatch(cyl.batch_number || '');
    setEditExpiry(cyl.expiry_date ? String(cyl.expiry_date).slice(0, 10) : '');
    setEditNotes(cyl.notes || '');
    setEditGasTypeId(cyl.gas_type_id || '');
    setEditGasVolumeId(cyl.gas_volume_id || '');
    setEditValveTypeId(cyl.valve_type_id || '');
    setEditError(null);
  };

  const handleSaveCylinder = async (e) => {
    e.preventDefault();
    if (!editingCylinder) return;

    setSaving(true);
    setEditError(null);

    try {
      const res = await fetch(`${API_BASE}/cylinders/${editingCylinder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_id: editStatusId,
          current_location_id: editLocationId,
          batch_number: editBatch,
          expiry_date: editExpiry || null,
          notes: editNotes,
          gas_type_id: editGasTypeId,
          gas_volume_id: editGasVolumeId,
          valve_type_id: editValveTypeId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update cylinder');

      // Update state locally
      setCylinders(prev => prev.map(c => c.id === data.id ? data : c));
      setSuccessFlash(`Cylinder ${data.gas_id} updated successfully!`);
      setEditingCylinder(null);
      if (onCylinderUpdated) onCylinderUpdated();
      setTimeout(() => setSuccessFlash(null), 4000);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!cylinderToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/cylinders/${cylinderToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove cylinder');

      setDeleteMessage(data.message || `Cylinder ${cylinderToDelete.gas_id} removed from inventory.`);
      setCylinderToDelete(null);
      fetchCylinders();
      if (onCylinderUpdated) onCylinderUpdated();
      setTimeout(() => setDeleteMessage(null), 4000);
    } catch (err) {
      alert(`Error removing cylinder: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Debounce typed search input by 350ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCylinders = useCallback(async (searchQuery = debouncedSearchTerm) => {
    const requestId = ++searchRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const activeSearch = searchQuery !== undefined ? searchQuery : debouncedSearchTerm;
      let url = `${API_BASE}/cylinders?limit=500`;
      if (selectedLocationId) url += `&location_id=${selectedLocationId}`;
      if (selectedGasTypeId) url += `&gas_type_id=${selectedGasTypeId}`;
      if (selectedStatusId) url += `&status_id=${selectedStatusId}`;
      if (activeSearch && activeSearch.trim()) url += `&search=${encodeURIComponent(activeSearch.trim())}`;

      if (viewScope === 'ALL_HOSPITAL') {
        url += `&is_in_hospital=true`;
      } else if (viewScope === 'VENDOR_ONLY') {
        url += `&is_in_hospital=false`;
      } else if (viewScope === 'STORE_ONLY') {
        const store = settings?.locations?.find(l => l.is_central_store);
        if (store) url += `&location_id=${store.id}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load cylinders');
      const data = await res.json();
      if (requestId === searchRequestIdRef.current) {
        setCylinders(data);
      }
    } catch (err) {
      if (requestId === searchRequestIdRef.current) {
        setError(err.message);
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedSearchTerm, selectedLocationId, selectedGasTypeId, selectedStatusId, viewScope, settings]);

  useEffect(() => {
    fetchCylinders();
  }, [fetchCylinders]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (debouncedSearchTerm !== searchTerm) {
      setDebouncedSearchTerm(searchTerm);
    } else {
      fetchCylinders(searchTerm);
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedLocationId('');
    setSelectedGasTypeId('');
    setSelectedStatusId('');
  };

  // Export to CSV (Excel compatible)
  const exportToCSV = () => {
    if (cylinders.length === 0) return;

    const headers = [
      'Gas ID / Barcode',
      'Cylinder Name',
      'Gas Type',
      'Volume',
      'Valve Type',
      'Status',
      'Current Location',
      'Batch Number',
      'Date Registered',
      'Last Modified',
    ];

    const rows = cylinders.map(c => [
      `"${c.gas_id}"`,
      `"${c.name}"`,
      `"${c.gas_type_name}"`,
      `"${c.volume_label}"`,
      `"${c.valve_type_name}"`,
      `"${c.status_name}"`,
      `"${c.location_name}"`,
      `"${c.batch_number || ''}"`,
      `"${new Date(c.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}"`,
      `"${new Date(c.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartgas_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isFull = (c) => ['FULL', 'FLL'].includes(c.status_code?.toUpperCase()) || c.status_name?.toLowerCase().includes('full');
  const isIssued = (c) => ['ISSUED', 'USE', 'IN_USE'].includes(c.status_code?.toUpperCase()) || c.status_name?.toLowerCase().includes('use') || c.status_name?.toLowerCase().includes('issue');
  const isEmpty = (c) => ['EMPTY', 'MPT'].includes(c.status_code?.toUpperCase()) || c.status_name?.toLowerCase().includes('empty');
  const isAtVendor = (c) => !c.is_in_hospital || ['RETURNED_TO_VENDOR', 'GPT'].includes(c.status_code?.toUpperCase()) || c.status_name?.toLowerCase().includes('gpt') || c.status_name?.toLowerCase().includes('vendor');

  // Count summaries
  const totalCount = cylinders.length;
  const fullCount = cylinders.filter(isFull).length;
  const issuedCount = cylinders.filter(isIssued).length;
  const emptyCount = cylinders.filter(isEmpty).length;
  const atVendorCount = cylinders.filter(isAtVendor).length;

  const getStatusBadge = (code, name, badgeColor) => {
    if (badgeColor) return <span className={`badge badge-${badgeColor}`}>{name || code}</span>;
    const s = String(code || '').toUpperCase();
    if (['FULL', 'FLL'].includes(s)) return <span className="badge badge-emerald">{name || 'Full'}</span>;
    if (['ISSUED', 'USE', 'IN_USE'].includes(s)) return <span className="badge badge-blue">{name || 'In-Use'}</span>;
    if (['EMPTY', 'MPT'].includes(s)) return <span className="badge badge-amber">{name || 'Empty'}</span>;
    if (['RETURNED_TO_VENDOR', 'GPT'].includes(s)) return <span className="badge badge-orange">{name || 'With GPT'}</span>;
    if (['EXPIRED', 'EXP'].includes(s)) return <span className="badge badge-red">{name || 'Expired'}</span>;
    if (['DAMAGED', 'DMG'].includes(s)) return <span className="badge badge-rose">{name || 'Damaged'}</span>;
    if (['MAINTENANCE', 'MTN'].includes(s)) return <span className="badge badge-purple">{name || 'Maintenance'}</span>;
    return <span className="badge badge-gray">{name || code}</span>;
  };

  return (
    <div>
      {successFlash && (
        <div className="flash-message success" style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
          <CheckCircle2 size={18} color="#059669" />
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{successFlash}</div>
        </div>
      )}

      {deleteMessage && (
        <div className="flash-message success" style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem', background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
          <Trash2 size={18} color="#dc2626" />
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{deleteMessage}</div>
        </div>
      )}

      {error && (
        <div className="flash-message error" style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
          <AlertCircle size={18} color="#dc2626" />
          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{error}</div>
        </div>
      )}

      {/* Top Inventory Scope Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="nav-tabs" style={{ display: 'inline-flex' }}>
          <button
            type="button"
            className={`nav-tab-btn ${viewScope === 'ALL_HOSPITAL' ? 'active' : ''}`}
            onClick={() => { setViewScope('ALL_HOSPITAL'); setSelectedLocationId(''); }}
          >
            <Building size={16} /> All Units ({viewScope === 'ALL_HOSPITAL' ? totalCount : 'All'})
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${viewScope === 'STORE_ONLY' ? 'active' : ''}`}
            onClick={() => { setViewScope('STORE_ONLY'); }}
          >
            <Boxes size={16} /> Logistic Pharmacy Store
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${viewScope === 'VENDOR_ONLY' ? 'active' : ''}`}
            onClick={() => { setViewScope('VENDOR_ONLY'); setSelectedLocationId(''); }}
          >
            <Tag size={16} /> With Vendor (GPT Refilling)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportToCSV}
            disabled={cylinders.length === 0}
            title="Download CSV for Microsoft Excel"
          >
            <FileSpreadsheet size={16} color="#059669" />
            Export Excel/CSV
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.print()}
            title="Print inventory sheet"
          >
            <Printer size={16} />
            Print List
          </button>
        </div>
      </div>

      {/* KPI Stats Mini Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Displayed</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem' }}>{totalCount}</div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>Full / Available</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.2rem' }}>{fullCount}</div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>Issued in Wards</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.2rem' }}>{issuedCount}</div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>Empty (In Hospital)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--warning)', marginTop: '0.2rem' }}>{emptyCount}</div>
        </div>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#ea580c', fontWeight: 600 }}>Offsite at GPT (Refill)</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ea580c', marginTop: '0.2rem' }}>{atVendorCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{
                paddingLeft: '2rem',
                paddingRight: searchTerm ? (searchTerm !== debouncedSearchTerm ? '3.8rem' : '2.2rem') : '0.75rem',
                width: '100%'
              }}
              placeholder="Search barcode, name, batch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {searchTerm !== debouncedSearchTerm && (
                <RefreshCw
                  className="animate-spin"
                  size={13}
                  style={{ color: 'var(--primary)' }}
                  title="Searching..."
                />
              )}
              {searchTerm && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                    borderRadius: '4px'
                  }}
                  title="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {viewScope === 'ALL_HOSPITAL' && (
            <select
              className="form-select"
              style={{ flex: '1 1 180px' }}
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
            >
              <option value="">All Hospital Wards/Units</option>
              {settings?.locations?.filter(l => l.is_in_hospital).map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}

          <select
            className="form-select"
            style={{ flex: '1 1 150px' }}
            value={selectedGasTypeId}
            onChange={(e) => setSelectedGasTypeId(e.target.value)}
          >
            <option value="">All Gas Types</option>
            {settings?.gasTypes?.map(gt => (
              <option key={gt.id} value={gt.id}>{gt.name}</option>
            ))}
          </select>

          <select
            className="form-select"
            style={{ flex: '1 1 150px' }}
            value={selectedStatusId}
            onChange={(e) => setSelectedStatusId(e.target.value)}
          >
            <option value="">All Statuses</option>
            {settings?.statuses?.map(st => (
              <option key={st.id} value={st.id}>{st.name}</option>
            ))}
          </select>

          <button type="submit" className="btn btn-primary" style={{ padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={15} />
            Filter
          </button>

          {(searchTerm || debouncedSearchTerm || selectedLocationId || selectedGasTypeId || selectedStatusId) && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.65rem 0.85rem' }}
              onClick={handleResetFilters}
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {/* Main Inventory Table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 0.75rem' }} />
            <div>Loading live cylinder inventory...</div>
          </div>
        ) : cylinders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Boxes size={44} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
            <div style={{ fontWeight: 600 }}>No cylinders found matching criteria</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Try adjusting your filter settings or register new cylinders in the Label tab.
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gas ID / Barcode</th>
                  <th>Cylinder Description</th>
                  <th>Gas Type</th>
                  <th>Volume</th>
                  <th>Valve</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Batch</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cylinders.map(cyl => (
                  <tr key={cyl.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.05em' }}>
                        {cyl.gas_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{cyl.name}</div>
                      {/* Main Inventory Table 
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Registered: {new Date(cyl.created_at).toLocaleDateString()}
                      </div>*/}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: cyl.gas_type_color || '#3b82f6',
                          marginRight: '6px'
                        }}
                      />
                      {cyl.gas_type_name}
                    </td>
                    <td>{cyl.volume_label}</td>
                    <td>{cyl.valve_type_name}</td>
                    <td>{getStatusBadge(cyl.status_code, cyl.status_name, cyl.status_badge_color)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                        <MapPin size={14} color={cyl.is_central_store ? 'var(--primary)' : 'var(--text-muted)'} />
                        <span>{cyl.location_name}</span>
                      </div>
                      {!cyl.is_in_hospital && (
                        <div style={{ fontSize: '0.7rem', color: '#ea580c', fontWeight: 700 }}>
                          Offsite with GPT Plant
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {cyl.batch_number || '-'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => openEditModal(cyl)}
                          title="Edit cylinder status, location and details"
                        >
                          <Edit3 size={14} color="var(--primary)" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => onSelectPrintLabel(cyl)}
                          title="Generate/Print Zebra PET Label"
                        >
                          <QrCode size={14} /> Label
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => setCylinderToDelete(cyl)}
                          title="Remove cylinder from inventory"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Cylinder Modal */}
      {editingCylinder && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="card-header">
              <h3 className="card-title">
                <Edit3 size={18} color="var(--primary)" />
                Edit Cylinder: <span style={{ fontFamily: 'var(--font-mono)' }}>{editingCylinder.gas_id}</span>
              </h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setEditingCylinder(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCylinder}>
              {editError && (
                <div className="flash-message error" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <AlertCircle size={18} color="#dc2626" />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{editError}</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Cylinder Status *</label>
                  <select
                    className="form-select"
                    value={editStatusId}
                    onChange={(e) => setEditStatusId(e.target.value)}
                    required
                  >
                    {settings?.statuses?.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Physical Location *</label>
                  <select
                    className="form-select"
                    value={editLocationId}
                    onChange={(e) => setEditLocationId(e.target.value)}
                    required
                  >
                    {settings?.locations?.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {!loc.is_in_hospital ? '(Vendor Plant)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Refill Batch Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. GPT-2026-OX"
                    value={editBatch}
                    onChange={(e) => setEditBatch(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Expiry Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editExpiry}
                    onChange={(e) => setEditExpiry(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Gas Type</label>
                  <select
                    className="form-select"
                    value={editGasTypeId}
                    onChange={(e) => setEditGasTypeId(e.target.value)}
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
                    value={editGasVolumeId}
                    onChange={(e) => setEditGasVolumeId(e.target.value)}
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
                    value={editValveTypeId}
                    onChange={(e) => setEditValveTypeId(e.target.value)}
                  >
                    {settings?.valveTypes?.map(vt => (
                      <option key={vt.id} value={vt.id}>{vt.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Maintenance / Administrative Notes</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Notes on cylinder condition, inspections, or location adjustments..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingCylinder(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? <RefreshCw className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Remove Cylinder Confirmation Modal */}
      {cylinderToDelete && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div className="card-header">
              <h3 className="card-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trash2 size={18} /> Confirm Remove Cylinder
              </h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setCylinderToDelete(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                Are you sure you want to permanently remove cylinder <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{cylinderToDelete.gas_id}</strong> ({cylinderToDelete.name}) from inventory?
              </p>
              <div style={{ fontSize: '0.8rem', color: '#991b1b', background: '#fef2f2', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid #fecaca' }}>
                ⚠️ <strong>Warning:</strong> This cylinder and its historical records will be deleted from the system.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCylinderToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? <RefreshCw className="animate-spin" size={14} /> : <Trash2 size={14} />} Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
