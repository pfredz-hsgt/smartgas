import { useState } from 'react';
import {
  Flame,
  Disc,
  Tag,
  MapPin,
  Truck,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit3,
  X,
  BookmarkCheck,
  ChevronUp,
  ChevronDown,
  GripVertical
} from 'lucide-react';
import { API_BASE } from '../utils/api';

export default function SettingsPage({ settings, onSettingsUpdated }) {
  const [subTab, setSubTab] = useState('GAS_TYPES'); // 'GAS_TYPES', 'VOLUMES', 'VALVES', 'STATUSES', 'LOCATIONS', 'VENDORS'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Custom Sort Order States
  const [localItems, setLocalItems] = useState(null);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [reordering, setReordering] = useState(false);

  const getSourceList = () => {
    switch (subTab) {
      case 'GAS_TYPES': return settings?.gasTypes || [];
      case 'VOLUMES': return settings?.gasVolumes || [];
      case 'VALVES': return settings?.valveTypes || [];
      case 'STATUSES': return settings?.statuses || [];
      case 'LOCATIONS': return settings?.locations || [];
      case 'VENDORS': return settings?.vendors || [];
      default: return [];
    }
  };

  const currentList = localItems !== null ? localItems : getSourceList();

  const handleTabChange = (tab) => {
    setSubTab(tab);
    setLocalItems(null);
    setMessage(null);
    setErrorMessage(null);
  };

  const saveReorder = async (list) => {
    setReordering(true);
    try {
      const ordered_ids = list.map(item => item.id);
      const res = await fetch(`${API_BASE}/settings/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: subTab,
          ordered_ids,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save new sort order');
      }

      setMessage(`Sort order updated! Dropdown options across all pages will now follow this order.`);
      if (onSettingsUpdated) await onSettingsUpdated();
      setTimeout(() => setMessage(null), 3500);
    } catch (err) {
      setErrorMessage(err.message);
      setLocalItems(null);
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setReordering(false);
    }
  };

  const handleMoveItem = async (idx, direction) => {
    const list = [...currentList];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const [moved] = list.splice(idx, 1);
    list.splice(targetIdx, 0, moved);

    setLocalItems(list);
    await saveReorder(list);
  };

  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragOverIdx !== idx) {
      setDragOverIdx(idx);
    }
  };

  const handleDrop = async (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }

    const list = [...currentList];
    const [moved] = list.splice(draggedIdx, 1);
    list.splice(targetIdx, 0, moved);

    setDraggedIdx(null);
    setDragOverIdx(null);
    setLocalItems(list);
    await saveReorder(list);
  };

  const renderOrderCell = (idx) => (
    <td style={{ width: '85px', padding: '0.35rem 0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            width: '20px',
            textAlign: 'center'
          }}
        >
          {idx + 1}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleMoveItem(idx, -1); }}
            disabled={idx === 0 || reordering}
            style={{
              background: 'none',
              border: 'none',
              cursor: idx === 0 ? 'not-allowed' : 'pointer',
              padding: '1px',
              opacity: idx === 0 ? 0.2 : 0.8,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-main)',
              borderRadius: '2px'
            }}
            title="Move up"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleMoveItem(idx, 1); }}
            disabled={idx === currentList.length - 1 || reordering}
            style={{
              background: 'none',
              border: 'none',
              cursor: idx === currentList.length - 1 ? 'not-allowed' : 'pointer',
              padding: '1px',
              opacity: idx === currentList.length - 1 ? 0.2 : 0.8,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-main)',
              borderRadius: '2px'
            }}
            title="Move down"
          >
            <ChevronDown size={13} />
          </button>
        </div>
        <div
          style={{
            cursor: 'grab',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            padding: '2px'
          }}
          title="Drag row to reorder"
        >
          <GripVertical size={13} />
        </div>
      </div>
    </td>
  );

  // New Gas Type State
  const [newTypeCode, setNewTypeCode] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#1E88E5');
  const [newTypeDesc, setNewTypeDesc] = useState('');

  // New Volume State
  const [newVolumeValue, setNewVolumeValue] = useState('');
  const [newVolumeUnit, setNewVolumeUnit] = useState('m3');
  const [newVolumeLabel, setNewVolumeLabel] = useState('');

  // New Valve State
  const [newValveCode, setNewValveCode] = useState('');
  const [newValveName, setNewValveName] = useState('');
  const [newValveDesc, setNewValveDesc] = useState('');

  // New Status State
  const [newStatusCode, setNewStatusCode] = useState('');
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusBadgeColor, setNewStatusBadgeColor] = useState('emerald');
  const [newStatusDesc, setNewStatusDesc] = useState('');

  // New Location State
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocType, setNewLocType] = useState('ward');
  const [newLocInHospital, setNewLocInHospital] = useState(true);
  const [newLocCentralStore, setNewLocCentralStore] = useState(false);
  const [newLocContact, setNewLocContact] = useState('');
  const [newLocPhone, setNewLocPhone] = useState('');

  // New Vendor State
  const [newVendorCode, setNewVendorCode] = useState('');
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorShort, setNewVendorShort] = useState('');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorAddress, setNewVendorAddress] = useState('');

  // Edit Modal State
  const [editingItem, setEditingItem] = useState(null);
  const [editTab, setEditTab] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  const openEditModal = (item, tab) => {
    setEditingItem(item);
    setEditTab(tab);
    setEditError(null);
    setEditFormData({ ...item });
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditTab(null);
    setEditFormData({});
    setEditError(null);
  };

  const handleEditChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem || !editTab) return;

    setEditLoading(true);
    setEditError(null);

    let endpoint = '';
    let payload = {};

    if (editTab === 'GAS_TYPES') {
      endpoint = `${API_BASE}/gas-types/${editingItem.id}`;
      payload = {
        code: editFormData.code,
        name: editFormData.name,
        color_code: editFormData.color_code,
        description: editFormData.description,
      };
    } else if (editTab === 'VOLUMES') {
      endpoint = `${API_BASE}/gas-volumes/${editingItem.id}`;
      payload = {
        volume_value: parseFloat(editFormData.volume_value),
        unit: editFormData.unit,
        display_label: editFormData.display_label || `${editFormData.volume_value} ${editFormData.unit}`,
      };
    } else if (editTab === 'VALVES') {
      endpoint = `${API_BASE}/valve-types/${editingItem.id}`;
      payload = {
        code: editFormData.code,
        name: editFormData.name,
        description: editFormData.description,
      };
    } else if (editTab === 'STATUSES') {
      endpoint = `${API_BASE}/statuses/${editingItem.id}`;
      payload = {
        code: editFormData.code,
        name: editFormData.name,
        badge_color: editFormData.badge_color,
        description: editFormData.description,
      };
    } else if (editTab === 'LOCATIONS') {
      endpoint = `${API_BASE}/locations/${editingItem.id}`;
      payload = {
        code: editFormData.code,
        name: editFormData.name,
        type: editFormData.type,
        is_central_store: !!editFormData.is_central_store,
        is_in_hospital: !!editFormData.is_in_hospital,
        contact_person: editFormData.contact_person,
        contact_phone: editFormData.contact_phone,
      };
    } else if (editTab === 'VENDORS') {
      endpoint = `${API_BASE}/vendors/${editingItem.id}`;
      payload = {
        code: editFormData.code,
        name: editFormData.name,
        short_name: editFormData.short_name,
        contact_person: editFormData.contact_person,
        contact_phone: editFormData.contact_phone,
        email: editFormData.email,
        address: editFormData.address,
      };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update record');
      }

      setMessage(`Updated ${editFormData.name || editFormData.code || 'record'} successfully!`);
      closeEditModal();
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleAddGasType = async (e) => {
    e.preventDefault();
    if (!newTypeCode || !newTypeName) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/gas-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newTypeCode.trim(),
          name: newTypeName.trim(),
          color_code: newTypeColor,
          description: newTypeDesc.trim() || null
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add gas type');
      }
      setMessage(`Gas type "${newTypeName}" added successfully!`);
      setNewTypeCode('');
      setNewTypeName('');
      setNewTypeDesc('');
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVolume = async (e) => {
    e.preventDefault();
    if (!newVolumeValue) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/gas-volumes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volume_value: parseFloat(newVolumeValue),
          unit: newVolumeUnit,
          display_label: newVolumeLabel || `${newVolumeValue} ${newVolumeUnit}`,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add volume');
      }
      setMessage(`Volume option "${newVolumeLabel || newVolumeValue}" added successfully!`);
      setNewVolumeValue('');
      setNewVolumeLabel('');
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddValve = async (e) => {
    e.preventDefault();
    if (!newValveCode || !newValveName) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/valve-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newValveCode.trim(),
          name: newValveName.trim(),
          description: newValveDesc.trim() || null
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add valve type');
      }
      setMessage(`Valve connection "${newValveName}" added successfully!`);
      setNewValveCode('');
      setNewValveName('');
      setNewValveDesc('');
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStatus = async (e) => {
    e.preventDefault();
    if (!newStatusCode || !newStatusName) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/statuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newStatusCode.trim(),
          name: newStatusName.trim(),
          badge_color: newStatusBadgeColor,
          description: newStatusDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add status');
      }
      setMessage(`Cylinder status "${newStatusName}" added successfully!`);
      setNewStatusCode('');
      setNewStatusName('');
      setNewStatusDesc('');
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocCode || !newLocName) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newLocCode.trim(),
          name: newLocName.trim(),
          type: newLocType,
          is_central_store: newLocCentralStore,
          is_in_hospital: newLocInHospital,
          contact_person: newLocContact.trim() || null,
          contact_phone: newLocPhone.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add hospital unit');
      }
      setMessage(`Hospital unit "${newLocName}" added successfully!`);
      setNewLocCode('');
      setNewLocName('');
      setNewLocContact('');
      setNewLocPhone('');
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (!newVendorCode || !newVendorName) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newVendorCode.trim(),
          name: newVendorName.trim(),
          short_name: newVendorShort.trim() || newVendorCode.trim(),
          contact_person: newVendorContact.trim() || null,
          contact_phone: newVendorPhone.trim() || null,
          email: newVendorEmail.trim() || null,
          address: newVendorAddress.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to add vendor');
      }
      setMessage(`Vendor "${newVendorName}" added successfully!`);
      setNewVendorCode('');
      setNewVendorName('');
      setNewVendorShort('');
      setNewVendorContact('');
      setNewVendorPhone('');
      setNewVendorEmail('');
      setNewVendorAddress('');
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (badgeColor, name) => {
    const colorClass = badgeColor ? `badge-${badgeColor}` : 'badge-gray';
    return <span className={`badge ${colorClass}`}>{name}</span>;
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>System Configuration & Reference Data</h2>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Manage medical gas types, volumes, valves, cylinder statuses, hospital locations, and concessionaires.
        </div>
      </div>

      {message && (
        <div className="flash-message success" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          <CheckCircle2 size={18} color="#059669" />
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{message}</div>
        </div>
      )}

      {errorMessage && (
        <div className="flash-message error" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          <AlertCircle size={18} color="#dc2626" />
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{errorMessage}</div>
        </div>
      )}

      {/* Sub tabs */}
      <div className="nav-tabs" style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '1.5rem', width: 'fit-content' }}>
        <button
          type="button"
          className={`nav-tab-btn ${subTab === 'GAS_TYPES' ? 'active' : ''}`}
          onClick={() => handleTabChange('GAS_TYPES')}
        >
          <Flame size={16} /> Gas Types ({settings?.gasTypes?.length || 0})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${subTab === 'VOLUMES' ? 'active' : ''}`}
          onClick={() => handleTabChange('VOLUMES')}
        >
          <Disc size={16} /> Volumes ({settings?.gasVolumes?.length || 0})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${subTab === 'VALVES' ? 'active' : ''}`}
          onClick={() => handleTabChange('VALVES')}
        >
          <Tag size={16} /> Valve Types ({settings?.valveTypes?.length || 0})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${subTab === 'STATUSES' ? 'active' : ''}`}
          onClick={() => handleTabChange('STATUSES')}
        >
          <BookmarkCheck size={16} /> Cylinder Statuses ({settings?.statuses?.length || 0})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${subTab === 'LOCATIONS' ? 'active' : ''}`}
          onClick={() => handleTabChange('LOCATIONS')}
        >
          <MapPin size={16} /> Hospital Wards/Units ({settings?.locations?.length || 0})
        </button>
        {/* Vendor Tab - KIV 
        <button
          type="button"
          className={`nav-tab-btn ${subTab === 'VENDORS' ? 'active' : ''}`}
          onClick={() => handleTabChange('VENDORS')}
        >
          <Truck size={16} /> Vendors ({settings?.vendors?.length || 0})
        </button>*/}
      </div>

      {/* Content based on sub-tab */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>

        {/* Left: Table of Current Records */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 className="card-title">
                Configured {subTab.replace('_', ' ')}
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Use ▲ ▼ buttons or drag rows to custom sort. All dropdown options across the app follow this custom order.
              </div>
            </div>
            {reordering && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                <RefreshCw size={13} className="animate-spin" /> Saving sort order...
              </div>
            )}
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              {subTab === 'GAS_TYPES' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: '85px' }}>Order</th>
                      <th>Code</th>
                      <th>Gas Name</th>
                      <th>Color Code</th>
                      <th>Description</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.map((gt, idx) => (
                      <tr
                        key={gt.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          opacity: draggedIdx === idx ? 0.35 : 1,
                          backgroundColor: dragOverIdx === idx && draggedIdx !== idx ? 'var(--bg-subtle)' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {renderOrderCell(idx)}
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{gt.code}</td>
                        <td style={{ fontWeight: 600 }}>{gt.name}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: gt.color_code || '#ccc', border: '1px solid #999' }} />
                            <code style={{ fontSize: '0.75rem' }}>{gt.color_code}</code>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{gt.description || '-'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => openEditModal(gt, 'GAS_TYPES')}
                          >
                            <Edit3 size={13} color="var(--primary)" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {subTab === 'VOLUMES' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: '85px' }}>Order</th>
                      <th>Value</th>
                      <th>Unit</th>
                      <th>Display Label</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.map((gv, idx) => (
                      <tr
                        key={gv.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          opacity: draggedIdx === idx ? 0.35 : 1,
                          backgroundColor: dragOverIdx === idx && draggedIdx !== idx ? 'var(--bg-subtle)' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {renderOrderCell(idx)}
                        <td style={{ fontWeight: 700 }}>{gv.volume_value}</td>
                        <td>{gv.unit}</td>
                        <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{gv.display_label}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => openEditModal(gv, 'VOLUMES')}
                          >
                            <Edit3 size={13} color="var(--primary)" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {subTab === 'VALVES' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: '85px' }}>Order</th>
                      <th>Code</th>
                      <th>Valve Connection Type</th>
                      <th>Description</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.map((vt, idx) => (
                      <tr
                        key={vt.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          opacity: draggedIdx === idx ? 0.35 : 1,
                          backgroundColor: dragOverIdx === idx && draggedIdx !== idx ? 'var(--bg-subtle)' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {renderOrderCell(idx)}
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{vt.code}</td>
                        <td style={{ fontWeight: 600 }}>{vt.name}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vt.description || '-'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => openEditModal(vt, 'VALVES')}
                          >
                            <Edit3 size={13} color="var(--primary)" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {subTab === 'STATUSES' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: '85px' }}>Order</th>
                      <th>Code</th>
                      <th>Status Name</th>
                      <th>Badge Preview</th>
                      <th>Description</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.map((st, idx) => (
                      <tr
                        key={st.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          opacity: draggedIdx === idx ? 0.35 : 1,
                          backgroundColor: dragOverIdx === idx && draggedIdx !== idx ? 'var(--bg-subtle)' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {renderOrderCell(idx)}
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{st.code}</td>
                        <td style={{ fontWeight: 600 }}>{st.name}</td>
                        <td>
                          {getStatusBadge(st.badge_color, st.name)}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{st.description || '-'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => openEditModal(st, 'STATUSES')}
                          >
                            <Edit3 size={13} color="var(--primary)" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {subTab === 'LOCATIONS' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: '85px' }}>Order</th>
                      <th>Code</th>
                      <th>Klinik / Wad / Unit</th>
                      <th>Jenis</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.map((loc, idx) => (
                      <tr
                        key={loc.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          opacity: draggedIdx === idx ? 0.35 : 1,
                          backgroundColor: dragOverIdx === idx && draggedIdx !== idx ? 'var(--bg-subtle)' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {renderOrderCell(idx)}
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{loc.code}</td>
                        <td style={{ fontWeight: 600 }}>
                          {loc.name}
                          {loc.is_central_store && (
                            <span className="badge badge-blue" style={{ marginLeft: '6px' }}>Main Store</span>
                          )}
                        </td>
                        <td>
                          {loc.is_in_hospital ? (
                            <span className="badge badge-emerald">Dalaman</span>
                          ) : (
                            <span className="badge badge-orange">Luaran</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => openEditModal(loc, 'LOCATIONS')}
                          >
                            <Edit3 size={13} color="var(--primary)" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {/* Vendor Tab - KIV
              {subTab === 'VENDORS' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: '85px' }}>Order</th>
                      <th>Code</th>
                      <th>Concessionaire Vendor Name</th>
                      <th>Contact Info</th>
                      <th>Email / Address</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentList.map((v, idx) => (
                      <tr
                        key={v.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                        style={{
                          opacity: draggedIdx === idx ? 0.35 : 1,
                          backgroundColor: dragOverIdx === idx && draggedIdx !== idx ? 'var(--bg-subtle)' : undefined,
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {renderOrderCell(idx)}
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{v.code}</td>
                        <td style={{ fontWeight: 600 }}>{v.name}</td>
                        <td style={{ fontSize: '0.8rem' }}>{v.contact_person || 'N/A'} ({v.contact_phone || 'N/A'})</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.email || v.address || '-'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => openEditModal(v, 'VENDORS')}
                          >
                            <Edit3 size={13} color="var(--primary)" /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
                       */}
            </table>
          </div>
        </div>

        {/* Right: Quick Add Form */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Plus size={18} color="var(--primary)" />
              Add New {
                subTab === 'GAS_TYPES' ? 'Gas' :
                  subTab === 'VOLUMES' ? 'Volume' :
                    subTab === 'VALVES' ? 'Valve' :
                      subTab === 'STATUSES' ? 'Status' :
                        subTab === 'LOCATIONS' ? 'Location' : 'Vendor'
              }
            </h3>
          </div>

          {subTab === 'GAS_TYPES' && (
            <form onSubmit={handleAddGasType}>
              <div className="form-group">
                <label className="form-label">Gas Code (e.g. HE, XE, NO)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. HE"
                  value={newTypeCode}
                  onChange={(e) => setNewTypeCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Gas Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Helium"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Shoulder Color (Hex)</label>
                <input
                  type="color"
                  className="form-input"
                  style={{ height: '42px', padding: '2px' }}
                  value={newTypeColor}
                  onChange={(e) => setNewTypeColor(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Medical grade pure helium"
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Plus size={15} />}
                Save Gas Type
              </button>
            </form>
          )}

          {subTab === 'VOLUMES' && (
            <form onSubmit={handleAddVolume}>
              <div className="form-group">
                <label className="form-label">Numeric Value (e.g. 10.0)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="10.0"
                  value={newVolumeValue}
                  onChange={(e) => setNewVolumeValue(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select
                  className="form-select"
                  value={newVolumeUnit}
                  onChange={(e) => setNewVolumeUnit(e.target.value)}
                >
                  <option value="m3">m³ (Cubic Metres)</option>
                  <option value="kg">KG (Kilograms)</option>
                  <option value="L">L (Litres)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Display Label (e.g. 10.0 m³)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="10.0 m³"
                  value={newVolumeLabel}
                  onChange={(e) => setNewVolumeLabel(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Plus size={15} />}
                Save Volume
              </button>
            </form>
          )}

          {subTab === 'VALVES' && (
            <form onSubmit={handleAddValve}>
              <div className="form-group">
                <label className="form-label">Valve Code (e.g. CGA, DIN)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. DIN"
                  value={newValveCode}
                  onChange={(e) => setNewValveCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Valve Connection Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. DIN 477 Valve"
                  value={newValveName}
                  onChange={(e) => setNewValveName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Threaded German standard"
                  value={newValveDesc}
                  onChange={(e) => setNewValveDesc(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Plus size={15} />}
                Save Valve Type
              </button>
            </form>
          )}

          {subTab === 'STATUSES' && (
            <form onSubmit={handleAddStatus}>
              <div className="form-group">
                <label className="form-label">Status Code (e.g. INSPECTION, QUARANTINE)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. INSPECTION"
                  value={newStatusCode}
                  onChange={(e) => setNewStatusCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Under Inspection"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Badge Color Styling</label>
                <select
                  className="form-select"
                  value={newStatusBadgeColor}
                  onChange={(e) => setNewStatusBadgeColor(e.target.value)}
                >
                  <option value="emerald">Emerald (Green - Ready/Full)</option>
                  <option value="blue">Blue (Issued/Active)</option>
                  <option value="amber">Amber (Yellow - Empty/Warning)</option>
                  <option value="orange">Orange (Offsite/Vendor)</option>
                  <option value="red">Red (Critical/Expired)</option>
                  <option value="rose">Rose (Pink - Damaged/Defect)</option>
                  <option value="purple">Purple (Special Condition)</option>
                  <option value="gray">Gray (Neutral/Inactive)</option>
                </select>
                <div style={{ marginTop: '0.5rem' }}>
                  Preview: {getStatusBadge(newStatusBadgeColor, newStatusName || 'Status Preview')}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Temporary holding for QA safety check"
                  value={newStatusDesc}
                  onChange={(e) => setNewStatusDesc(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Plus size={15} />}
                Save Cylinder Status
              </button>
            </form>
          )}

          {subTab === 'LOCATIONS' && (
            <form onSubmit={handleAddLocation}>
              <div className="form-group">
                <label className="form-label">Location Code (e.g. NICU, CCU)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. NICU"
                  value={newLocCode}
                  onChange={(e) => setNewLocCode(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Location Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Neonatal ICU"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Location Type</label>
                <select
                  className="form-select"
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value)}
                >
                  <option value="unit">Klinik/Wad/Unit</option>
                  <option value="logistic">Stor Utama</option>
                  <option value="pkd">PKD Segamat</option>
                  <option value="vendor">Gas Pantai Timur</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newLocInHospital}
                    onChange={(e) => setNewLocInHospital(e.target.checked)}
                  />
                  In-Hospital Location
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newLocCentralStore}
                    onChange={(e) => setNewLocCentralStore(e.target.checked)}
                  />
                  Main Pharmacy Store
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Sister / Staff"
                    value={newLocContact}
                    onChange={(e) => setNewLocContact(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone / Ext</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ext 1234"
                    value={newLocPhone}
                    onChange={(e) => setNewLocPhone(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Plus size={15} />}
                Save Hospital Unit
              </button>
            </form>
          )}

          {subTab === 'VENDORS' && (
            <form onSubmit={handleAddVendor}>
              <div className="form-group">
                <label className="form-label">Vendor Code (e.g. GPT, LINDE, AIRL)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. LINDE"
                  value={newVendorCode}
                  onChange={(e) => setNewVendorCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Linde Gas Malaysia Sdn Bhd"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Short Name / Brand</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Linde"
                  value={newVendorShort}
                  onChange={(e) => setNewVendorShort(e.target.value)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Sales Rep / Driver"
                    value={newVendorContact}
                    onChange={(e) => setNewVendorContact(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="012-3456789"
                    value={newVendorPhone}
                    onChange={(e) => setNewVendorPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="sales@vendor.com"
                  value={newVendorEmail}
                  onChange={(e) => setNewVendorEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Plant Address (Optional)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Plant / Depot address"
                  value={newVendorAddress}
                  onChange={(e) => setNewVendorAddress(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? <RefreshCw className="animate-spin" size={15} /> : <Plus size={15} />}
                Save Vendor
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Edit Modal (Universal for all tabs) */}
      {editingItem && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="card-header">
              <h3 className="card-title">
                <Edit3 size={18} color="var(--primary)" />
                Edit {editTab.replace('_', ' ')}: <span style={{ fontFamily: 'var(--font-mono)' }}>{editingItem.code || editingItem.name || editingItem.display_label}</span>
              </h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={closeEditModal}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              {editError && (
                <div className="flash-message error" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <AlertCircle size={18} color="#dc2626" />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{editError}</div>
                </div>
              )}

              {/* GAS_TYPES Edit Form */}
              {editTab === 'GAS_TYPES' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Gas Code *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.code || ''}
                        onChange={(e) => handleEditChange('code', e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gas Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.name || ''}
                        onChange={(e) => handleEditChange('name', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shoulder Color (Hex)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="color"
                        className="form-input"
                        style={{ width: '60px', height: '40px', padding: '2px' }}
                        value={editFormData.color_code || '#1E88E5'}
                        onChange={(e) => handleEditChange('color_code', e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input"
                        style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                        value={editFormData.color_code || '#1E88E5'}
                        onChange={(e) => handleEditChange('color_code', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={editFormData.description || ''}
                      onChange={(e) => handleEditChange('description', e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* VOLUMES Edit Form */}
              {editTab === 'VOLUMES' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Numeric Value *</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        value={editFormData.volume_value ?? ''}
                        onChange={(e) => handleEditChange('volume_value', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Unit *</label>
                      <select
                        className="form-select"
                        value={editFormData.unit || 'm3'}
                        onChange={(e) => handleEditChange('unit', e.target.value)}
                      >
                        <option value="m3">m³ (Cubic Metres)</option>
                        <option value="kg">KG (Kilograms)</option>
                        <option value="L">L (Litres)</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Display Label (e.g. 0.5 m³)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editFormData.display_label || ''}
                      onChange={(e) => handleEditChange('display_label', e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* VALVES Edit Form */}
              {editTab === 'VALVES' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Valve Code *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.code || ''}
                        onChange={(e) => handleEditChange('code', e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Valve Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.name || ''}
                        onChange={(e) => handleEditChange('name', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={editFormData.description || ''}
                      onChange={(e) => handleEditChange('description', e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* STATUSES Edit Form */}
              {editTab === 'STATUSES' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Status Code *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.code || ''}
                        onChange={(e) => handleEditChange('code', e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Display Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.name || ''}
                        onChange={(e) => handleEditChange('name', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Badge Color Styling</label>
                    <select
                      className="form-select"
                      value={editFormData.badge_color || 'gray'}
                      onChange={(e) => handleEditChange('badge_color', e.target.value)}
                    >
                      <option value="emerald">Emerald (Green - Ready/Full)</option>
                      <option value="blue">Blue (Issued/Active)</option>
                      <option value="amber">Amber (Yellow - Empty/Warning)</option>
                      <option value="orange">Orange (Offsite/Vendor)</option>
                      <option value="red">Red (Critical/Expired)</option>
                      <option value="rose">Rose (Pink - Damaged/Defect)</option>
                      <option value="purple">Purple (Special Condition)</option>
                      <option value="gray">Gray (Neutral/Inactive)</option>
                    </select>
                    <div style={{ marginTop: '0.5rem' }}>
                      Preview: {getStatusBadge(editFormData.badge_color, editFormData.name || 'Preview')}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={editFormData.description || ''}
                      onChange={(e) => handleEditChange('description', e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* LOCATIONS Edit Form */}
              {editTab === 'LOCATIONS' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Location Code *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.code || ''}
                        onChange={(e) => handleEditChange('code', e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Location Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.name || ''}
                        onChange={(e) => handleEditChange('name', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select
                      className="form-select"
                      value={editFormData.type || 'ward'}
                      onChange={(e) => handleEditChange('type', e.target.value)}
                    >
                      <option value="unit">Klinik/Wad/Unit</option>
                      <option value="logistic">Stor Utama</option>
                      <option value="pkd">KK/PKD Segamat</option>
                      <option value="vendor">Konsesi GPT</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!editFormData.is_in_hospital}
                        onChange={(e) => handleEditChange('is_in_hospital', e.target.checked)}
                      />
                      In-Hospital Location
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!editFormData.is_central_store}
                        onChange={(e) => handleEditChange('is_central_store', e.target.checked)}
                      />
                      Main Hospital Store
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Contact Person</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.contact_person || ''}
                        onChange={(e) => handleEditChange('contact_person', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Phone / Ext</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.contact_phone || ''}
                        onChange={(e) => handleEditChange('contact_phone', e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* VENDORS Edit Form */}
              {editTab === 'VENDORS' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Vendor Code *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.code || ''}
                        onChange={(e) => handleEditChange('code', e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Vendor Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.name || ''}
                        onChange={(e) => handleEditChange('name', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Short Name / Brand</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editFormData.short_name || ''}
                      onChange={(e) => handleEditChange('short_name', e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Contact Person</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.contact_person || ''}
                        onChange={(e) => handleEditChange('contact_person', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <input
                        type="text"
                        className="form-input"
                        value={editFormData.contact_phone || ''}
                        onChange={(e) => handleEditChange('contact_phone', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={editFormData.email || ''}
                      onChange={(e) => handleEditChange('email', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={editFormData.address || ''}
                      onChange={(e) => handleEditChange('address', e.target.value)}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeEditModal}
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editLoading}
                >
                  {editLoading ? <RefreshCw className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
