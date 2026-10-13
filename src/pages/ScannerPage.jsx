import React, { useState, useEffect, useRef } from 'react';
import {
  Scan,
  ArrowRightLeft,
  Truck,
  PackageCheck,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Volume2,
  RefreshCw,
  Edit3,
  Pencil,
  MapPin
} from 'lucide-react';
import { playBeep, playSuccess, playError } from '../utils/sound';
import { API_BASE } from '../utils/api';

export default function ScannerPage({ settings, onCylinderUpdated }) {
  const [workflow, setWorkflow] = useState('ISSUE'); // 'ISSUE', 'RETURN', 'RETURN_TO_GPT', 'RECEIVE_FROM_GPT'
  const [scanInput, setScanInput] = useState('');
  const [scannedItems, setScannedItems] = useState(() => {
    try {
      const saved = sessionStorage.getItem('smartgas_scanner_batch');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flashMessage, setFlashMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Sync scannedItems to sessionStorage so navigation and tab switches retain the batch
  useEffect(() => {
    try {
      sessionStorage.setItem('smartgas_scanner_batch', JSON.stringify(scannedItems));
    } catch (e) {
      // ignore
    }
  }, [scannedItems]);

  // Workflow Form States
  const [indenterName, setIndenterName] = useState('');
  const [destinationWardId, setDestinationWardId] = useState('');
  const [sourceWardId, setSourceWardId] = useState('');
  const [indentNo, setIndentNo] = useState('');
  const [deliveryOrderNo, setDeliveryOrderNo] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Edit item status modal state (for return special cases: expired, damaged)
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [editStatusValue, setEditStatusValue] = useState('EMPTY');
  const [editRemarksValue, setEditRemarksValue] = useState('');

  // Location inline editing state
  const [editingLocationIndex, setEditingLocationIndex] = useState(null);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  const inputRef = useRef(null);
  const isScanningRef = useRef(false);

  // Focus input automatically whenever workflow changes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [workflow]);

  // Set default ward options from settings
  useEffect(() => {
    if (settings?.locations?.length > 0) {
      const hospitalWards = settings.locations.filter(l => !l.is_central_store && l.is_in_hospital);
      if (hospitalWards.length > 0) {
        if (!destinationWardId) setDestinationWardId(hospitalWards[0].id);
        if (!sourceWardId) setSourceWardId(hospitalWards[0].id);
      }
    }
  }, [settings]);

  // 1. Debounced auto-submit when scanner types into the focused input box without pressing Enter
  useEffect(() => {
    if (!scanInput || scanInput.trim().length < 3) return;

    const timer = setTimeout(() => {
      if (scanInput.trim().length >= 3 && !isScanningRef.current) {
        handleProcessBarcode(scanInput.trim());
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [scanInput]);

  // 2. Global listener with debounced auto-enter for 2D scanners even when input is not focused
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = Date.now();
    let autoEnterTimer = null;

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing inside standard text inputs (like indenter name or notes)
      if (e.target.tagName === 'INPUT' && e.target !== inputRef.current) {
        return;
      }
      if (e.target.tagName === 'TEXTAREA') {
        return;
      }

      // If user is focused on the scan input directly, let input's own debounced effect handle it
      if (e.target === inputRef.current) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (scanInput.trim().length >= 3) {
            handleProcessBarcode(scanInput.trim());
          }
        }
        return;
      }

      const currentTime = Date.now();
      // If delay between keys is long, reset buffer
      if (currentTime - lastKeyTime > 200) {
        scanBuffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (autoEnterTimer) clearTimeout(autoEnterTimer);
        if (scanBuffer.length >= 3) {
          handleProcessBarcode(scanBuffer.trim());
          scanBuffer = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scanBuffer += e.key;

        // Auto "Enter" debounced after 280ms of silence from scanner
        if (autoEnterTimer) clearTimeout(autoEnterTimer);
        if (scanBuffer.trim().length >= 3) {
          autoEnterTimer = setTimeout(() => {
            if (scanBuffer.trim().length >= 3 && !isScanningRef.current) {
              handleProcessBarcode(scanBuffer.trim());
              scanBuffer = '';
            }
          }, 280);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (autoEnterTimer) clearTimeout(autoEnterTimer);
    };
  }, [scannedItems, workflow, scanInput]);

  // Lookup scanned cylinder from API
  const handleProcessBarcode = async (barcode) => {
    if (!barcode) return;
    const cleanCode = barcode.trim();
    if (cleanCode.length < 3) return;

    if (isScanningRef.current) return;
    isScanningRef.current = true;

    // Clear input immediately to prevent duplicate debounce triggers
    setScanInput('');

    // Check duplicate in current batch
    if (scannedItems.some(item => item.gas_id.toLowerCase() === cleanCode.toLowerCase())) {
      playError();
      setErrorMessage(`Cylinder "${cleanCode}" has already been scanned in this batch.`);
      isScanningRef.current = false;
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`${API_BASE}/cylinders/lookup/${encodeURIComponent(cleanCode)}`);

      if (!res.ok) {
        if (workflow === 'RECEIVE_FROM_GPT') {
          // If receiving from GPT, it might be a new cylinder not yet in system
          playBeep();
          const vendorLoc = settings?.locations?.find(l => l.type === 'vendor' || (!l.is_in_hospital && !l.is_central_store));
          const newItem = {
            id: null,
            gas_id: cleanCode,
            name: `New Cylinder (${cleanCode})`,
            gas_type_name: 'Oxygen (Default)',
            gas_type_id: settings?.gasTypes?.[0]?.id,
            gas_volume_id: settings?.gasVolumes?.[0]?.id,
            valve_type_id: settings?.valveTypes?.[0]?.id,
            display_label: 'Pending Specs',
            status_name: 'Full',
            status_code: 'FULL',
            location_id: vendorLoc?.id,
            current_location_id: vendorLoc?.id,
            location_name: vendorLoc?.name || 'Gas Pantai Timur Sdn Bhd (Refilling Plant)',
            location_type: 'vendor',
            is_central_store: false,
            is_in_hospital: false,
            is_new: true,
          };
          setScannedItems(prev => [newItem, ...prev]);
          setScanInput('');
          return;
        }

        playError();
        const errData = await res.json();
        setErrorMessage(errData.error || `Barcode "${cleanCode}" not found in database.`);
        setScanInput('');
        return;
      }

      const cylinder = await res.json();
      playBeep();

      // Configure default status depending on workflow
      let defaultStatus = cylinder.status_code;
      if (workflow === 'ISSUE') defaultStatus = 'ISSUED';
      if (workflow === 'RETURN') defaultStatus = 'EMPTY';
      if (workflow === 'RETURN_TO_GPT') defaultStatus = 'RETURNED_TO_VENDOR';
      if (workflow === 'RECEIVE_FROM_GPT') defaultStatus = 'FULL';

      const enrichedItem = {
        ...cylinder,
        workflow_status: defaultStatus,
        workflow_remarks: '',
      };

      setScannedItems(prev => [enrichedItem, ...prev]);
      setScanInput('');
      if (inputRef.current) inputRef.current.focus();
    } catch (err) {
      playError();
      setErrorMessage(`Scanner error: ${err.message}`);
    } finally {
      setIsScanning(false);
      isScanningRef.current = false;
    }
  };

  const handleManualScanSubmit = (e) => {
    e.preventDefault();
    if (scanInput.trim()) {
      handleProcessBarcode(scanInput.trim());
    }
  };

  const handleRemoveItem = (index) => {
    setScannedItems(prev => prev.filter((_, i) => i !== index));
  };

  // Open Edit status modal for a return item
  const openEditStatusModal = (index) => {
    const item = scannedItems[index];
    setEditingItemIndex(index);
    setEditStatusValue(item.workflow_status || 'EMPTY');
    setEditRemarksValue(item.workflow_remarks || '');
  };

  const handleSaveItemStatus = () => {
    if (editingItemIndex !== null) {
      setScannedItems(prev => prev.map((item, idx) => {
        if (idx === editingItemIndex) {
          return {
            ...item,
            workflow_status: editStatusValue,
            workflow_remarks: editRemarksValue,
          };
        }
        return item;
      }));
    }
    setEditingItemIndex(null);
  };

  // Switch workflow tab while persisting all collected/scanned items
  const handleWorkflowChange = (newWorkflow) => {
    if (workflow === newWorkflow) return;
    setWorkflow(newWorkflow);
    setErrorMessage(null);
    setEditingLocationIndex(null);

    // Persist scanned items across tabs, adapting workflow_status to match the new tab's requirements
    setScannedItems(prev => prev.map(item => {
      let nextStatus = item.workflow_status;
      if (newWorkflow === 'ISSUE') {
        nextStatus = 'ISSUED';
      } else if (newWorkflow === 'RETURN') {
        // If it was already DAMAGED or EXPIRED, preserve it; otherwise default to EMPTY
        nextStatus = (item.workflow_status === 'DAMAGED' || item.workflow_status === 'EXPIRED')
          ? item.workflow_status
          : 'EMPTY';
      } else if (newWorkflow === 'RETURN_TO_GPT') {
        nextStatus = 'RETURNED_TO_VENDOR';
      } else if (newWorkflow === 'RECEIVE_FROM_GPT') {
        nextStatus = 'FULL';
      }
      return {
        ...item,
        workflow_status: nextStatus
      };
    }));
  };

  // Helper to resolve full location object from item or settings
  const getLocationObj = (item) => {
    if (!item) return null;
    const locId = item.location_id || item.current_location_id;
    if (locId && settings?.locations?.length > 0) {
      const found = settings.locations.find(l => String(l.id) === String(locId));
      if (found) return found;
    }
    return {
      id: item.location_id || item.current_location_id,
      name: item.location_name,
      type: item.location_type,
      is_central_store: item.is_central_store,
      is_in_hospital: item.is_in_hospital,
    };
  };

  const isLocationMainStore = (item) => {
    const loc = getLocationObj(item);
    if (!loc) return false;
    return loc.type === 'logistic' || loc.type === 'central_store' || !!loc.is_central_store;
  };

  const isLocationVendor = (item) => {
    const loc = getLocationObj(item);
    if (!loc) return false;
    return loc.type === 'vendor' || (!loc.is_in_hospital && !loc.is_central_store);
  };

  const isLocationOtherThanMainStore = (item) => {
    const loc = getLocationObj(item);
    if (!loc) return false;
    return !isLocationMainStore(item);
  };

  // Evaluate location validity per workflow requirements:
  // - Issue: must be from Main Store (value=logistic)
  // - Return from Wards: must be other than Main Store
  // - Return to GPT: must be Main Store
  // - Receive from GPT: must be vendor
  const checkLocationValidity = (item, currentWorkflow) => {
    const loc = getLocationObj(item);
    if (!loc) return { isValid: true };

    switch (currentWorkflow) {
      case 'ISSUE':
        if (!isLocationMainStore(item)) {
          return {
            isValid: false,
            expected: 'Main Store (Logistic)',
            message: 'Must be from Main Store',
            currentName: loc.name || 'Unknown',
          };
        }
        break;
      case 'RETURN':
        if (!isLocationOtherThanMainStore(item)) {
          return {
            isValid: false,
            expected: 'Ward / Unit',
            message: 'Must be other than Main Store',
            currentName: loc.name || 'Main Store',
          };
        }
        break;
      case 'RETURN_TO_GPT':
        if (!isLocationMainStore(item)) {
          return {
            isValid: false,
            expected: 'Main Store (Logistic)',
            message: 'Must be in Main Store',
            currentName: loc.name || 'Unknown',
          };
        }
        break;
      case 'RECEIVE_FROM_GPT':
        if (!isLocationVendor(item)) {
          return {
            isValid: false,
            expected: 'Konsesi GPT (Vendor)',
            message: 'Must be with Vendor (Konsesi GPT)',
            currentName: loc.name || 'Unknown',
          };
        }
        break;
      default:
        return { isValid: true };
    }
    return { isValid: true, currentName: loc.name };
  };

  // Correct cylinder location on the spot
  const handleUpdateCylinderLocation = async (item, index, newLocationId) => {
    const selectedLoc = settings?.locations?.find(l => String(l.id) === String(newLocationId));
    if (!selectedLoc) return;

    try {
      setIsUpdatingLocation(true);
      if (item.id) {
        const res = await fetch(`${API_BASE}/cylinders/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_location_id: newLocationId,
            notes: `Location corrected on the spot in Scanner (${workflow}) to ${selectedLoc.name}`,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to update cylinder location');
        }
      }

      // Update scannedItems in state and sessionStorage
      setScannedItems(prev => prev.map((it, idx) => {
        if (idx === index) {
          return {
            ...it,
            location_id: selectedLoc.id,
            current_location_id: selectedLoc.id,
            location_name: selectedLoc.name,
            location_type: selectedLoc.type,
            is_central_store: selectedLoc.is_central_store,
            is_in_hospital: selectedLoc.is_in_hospital,
          };
        }
        return it;
      }));

      playSuccess();
      setEditingLocationIndex(null);
      if (onCylinderUpdated) onCylinderUpdated();
    } catch (err) {
      playError();
      setErrorMessage(`Failed to update cylinder location: ${err.message}`);
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  // Get filtered locations for correction dropdown based on active workflow requirements:
  // - Issue Tab: only Main Store/logistic
  // - Return from Wards: only Clinic/Ward/Unit
  // - Return to GPT: only Main Store/logistic
  // - Receive from GPT: only vendor/GPT
  const getFilteredLocations = (currentWorkflow) => {
    if (!settings?.locations?.length) return [];
    switch (currentWorkflow) {
      case 'ISSUE':
      case 'RETURN_TO_GPT':
        // Only Main Store/logistic
        return settings.locations.filter(
          loc => loc.is_central_store || loc.type === 'logistic' || loc.type === 'central_store'
        );
      case 'RETURN':
        // Only Clinic/Ward/Unit (not Main Store, and not vendor)
        return settings.locations.filter(
          loc => !loc.is_central_store && loc.type !== 'logistic' && loc.type !== 'central_store' && loc.type !== 'vendor'
        );
      case 'RECEIVE_FROM_GPT':
        // Only vendor/GPT
        return settings.locations.filter(
          loc => loc.type === 'vendor' || (!loc.is_in_hospital && !loc.is_central_store)
        );
      default:
        return settings.locations;
    }
  };

  // Render location cell with warning & inline correction dropdown
  const renderLocationCell = (item, index) => {
    const locValidity = checkLocationValidity(item, workflow);
    const isEditing = editingLocationIndex === index;

    if (isEditing) {
      const allowedLocations = getFilteredLocations(workflow);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <select
              className="form-select"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', flex: 1 }}
              value={item.location_id || item.current_location_id || ''}
              onChange={(e) => handleUpdateCylinderLocation(item, index, e.target.value)}
              disabled={isUpdatingLocation}
              autoFocus
            >
              <option value="" disabled>Select correct location...</option>
              {allowedLocations.map(loc => {
                const isMain = loc.is_central_store || loc.type === 'logistic' || loc.type === 'central_store';
                const isVend = loc.type === 'vendor' || (!loc.is_in_hospital && !loc.is_central_store);
                const typeTag = isMain ? 'Main Store' : isVend ? 'Konsesi GPT' : 'Clinic/Ward/Unit';
                return (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} [{typeTag}]
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.45rem', fontSize: '0.75rem' }}
              onClick={() => setEditingLocationIndex(null)}
              title="Cancel"
            >
              <X size={13} />
            </button>
          </div>
          {isUpdatingLocation && (
            <div style={{ fontSize: '0.7rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <RefreshCw size={11} className="animate-spin" /> Updating location in database...
            </div>
          )}
        </div>
      );
    }

    if (!locValidity.isValid) {
      return (
        <div style={{
          padding: '0.45rem 0.6rem',
          borderRadius: '6px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid #f59e0b',
          minWidth: '210px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontWeight: 700,
              fontSize: '0.75rem',
              color: '#d97706'
            }}>
              <AlertTriangle size={13} color="#d97706" />
              Location Mismatch
            </span>
            <button
              type="button"
              className="btn"
              style={{
                padding: '0.2rem 0.45rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                color: '#b45309',
                cursor: 'pointer'
              }}
              onClick={() => setEditingLocationIndex(index)}
              title="Click pencil to correct cylinder location"
            >
              <Pencil size={11} /> Correct
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-muted)' }}>
            <MapPin size={12} style={{ flexShrink: 0 }} />
            <span style={{ textDecoration: 'line-through', opacity: 0.85 }}>
              {item.location_name || 'Unknown'}
            </span>
          </div>
          <div style={{ fontSize: '0.73rem', fontWeight: 600, color: '#b45309', marginTop: '2px' }}>
            ⚠️ {locValidity.message}
          </div>
        </div>
      );
    }

    // Location is correct: DO NOT show pencil/edit icon
    return (
      <div style={{ minWidth: '150px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
          <MapPin size={14} color={item.is_central_store ? 'var(--primary)' : 'var(--text-muted)'} />
          <span>{item.location_name || '-'}</span>
        </div>
        {!item.is_in_hospital && item.location_name && (
          <div style={{ fontSize: '0.7rem', color: '#ea580c', fontWeight: 700 }}>
            Offsite with GPT Plant
          </div>
        )}
      </div>
    );
  };

  // Submit Transaction
  const handleSubmitTransaction = async () => {
    if (scannedItems.length === 0) {
      setErrorMessage('Please scan at least one gas cylinder.');
      return;
    }

    // Validate locations before completing transaction
    const locationMismatches = scannedItems.filter(item => !checkLocationValidity(item, workflow).isValid);
    if (locationMismatches.length > 0) {
      playError();
      const workflowLabel =
        workflow === 'ISSUE' ? 'Issue to Wards (must be from Main Store)' :
          workflow === 'RETURN' ? 'Return from Wards (must be other than Main Store)' :
            workflow === 'RETURN_TO_GPT' ? 'Return to GPT (must be from Main Store)' :
              'Receive from GPT (must be from Vendor GPT)';
      setErrorMessage(
        `Cannot complete transaction: ${locationMismatches.length} cylinder(s) have location mismatches for ${workflowLabel}. Please correct their location using the pencil icon in the table.`
      );
      setIsSubmitting(false);
      return;
    }

    try {
      let endpoint = '';
      let payload = {};

      if (workflow === 'ISSUE') {
        if (!indenterName.trim()) {
          throw new Error('Please enter indenter / receiver name.');
        }
        if (!destinationWardId) {
          throw new Error('Please select destination ward / unit.');
        }
        endpoint = `${API_BASE}/transactions/issue`;
        payload = {
          destination_location_id: destinationWardId,
          indent_no: indentNo,
          indenter_name: indenterName,
          gas_ids: scannedItems.map(i => i.gas_id),
          notes,
        };
      } else if (workflow === 'RETURN') {
        if (!indenterName.trim()) {
          throw new Error('Please enter returner / staff name.');
        }
        endpoint = `${API_BASE}/transactions/return`;
        payload = {
          indent_no: indentNo,
          indenter_name: indenterName,
          items: scannedItems.map(i => ({
            gas_id: i.gas_id,
            status_code: i.workflow_status || 'EMPTY',
            remarks: i.workflow_remarks,
          })),
          notes,
        };
      } else if (workflow === 'RETURN_TO_GPT') {
        endpoint = `${API_BASE}/transactions/return-to-vendor`;
        payload = {
          delivery_order_no: deliveryOrderNo,
          items: scannedItems.map(i => ({
            gas_id: i.gas_id,
            status_code: i.workflow_status || 'RETURNED_TO_VENDOR',
            remarks: i.workflow_remarks,
          })),
          notes,
        };
      } else if (workflow === 'RECEIVE_FROM_GPT') {
        endpoint = `${API_BASE}/transactions/receive-from-vendor`;
        payload = {
          delivery_order_no: deliveryOrderNo,
          batch_number: batchNumber,
          cylinders: scannedItems.map(i => ({
            gas_id: i.gas_id,
            name: i.name,
            gas_type_id: i.gas_type_id || settings?.gasTypes?.[0]?.id,
            gas_volume_id: i.gas_volume_id || settings?.gasVolumes?.[0]?.id,
            valve_type_id: i.valve_type_id || settings?.valveTypes?.[0]?.id,
            is_new: !!i.is_new,
          })),
          notes,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete transaction.');
      }

      playSuccess();
      setFlashMessage({
        type: 'success',
        title: 'Transaction Successful!',
        message: data.message,
        transaction_no: data.transaction_no,
        itemsCount: data.total_items,
        timestamp: new Date().toLocaleTimeString(),
      });

      // Clear scanned items and inputs
      setScannedItems([]);
      setIndenterName('');
      setIndentNo('');
      setDeliveryOrderNo('');
      setBatchNumber('');
      setNotes('');

      if (onCylinderUpdated) onCylinderUpdated();
    } catch (err) {
      playError();
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getWorkflowBadgeColor = (status, customColor) => {
    if (customColor) return `badge-${customColor}`;
    const s = String(status || '').toUpperCase();
    if (['FULL', 'FLL'].includes(s)) return 'badge-emerald';
    if (['ISSUED', 'USE', 'IN_USE'].includes(s)) return 'badge-blue';
    if (['EMPTY', 'MPT'].includes(s)) return 'badge-amber';
    if (['RETURNED_TO_VENDOR', 'GPT'].includes(s)) return 'badge-orange';
    if (['EXPIRED', 'EXP'].includes(s)) return 'badge-red';
    if (['DAMAGED', 'DMG'].includes(s)) return 'badge-rose';
    if (['MAINTENANCE', 'MTN'].includes(s)) return 'badge-purple';
    return 'badge-gray';
  };

  const getStatusBadge = (code, name, badgeColor) => {
    const colorClass = getWorkflowBadgeColor(code, badgeColor);
    return <span className={`badge ${colorClass}`}>{name || code}</span>;
  };

  return (
    <div>
      {/* Workflow Selection Tabs */}
      <div className="workflow-tabs-bar">
        <div
          className={`workflow-tab-card ${workflow === 'ISSUE' ? 'active' : ''}`}
          onClick={() => handleWorkflowChange('ISSUE')}
        >
          <div className="tab-icon-box">
            <ArrowRightLeft size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="tab-info-title">1. Issue to Wards</div>
            <div className="tab-info-desc">Hospital wards (ICU, OT, HD, ED)</div>
          </div>
          {scannedItems.length > 0 && workflow === 'ISSUE' && (
            <span className="badge badge-blue" style={{ marginLeft: 'auto', fontWeight: 700 }}>
              {scannedItems.length}
            </span>
          )}
        </div>

        <div
          className={`workflow-tab-card ${workflow === 'RETURN' ? 'active' : ''}`}
          onClick={() => handleWorkflowChange('RETURN')}
        >
          <div className="tab-icon-box">
            <PackageCheck size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="tab-info-title">2. Return from Wards</div>
            <div className="tab-info-desc">Empty or damaged cylinders</div>
          </div>
          {scannedItems.length > 0 && workflow === 'RETURN' && (
            <span className="badge badge-amber" style={{ marginLeft: 'auto', fontWeight: 700 }}>
              {scannedItems.length}
            </span>
          )}
        </div>

        <div
          className={`workflow-tab-card ${workflow === 'RETURN_TO_GPT' ? 'active' : ''}`}
          onClick={() => handleWorkflowChange('RETURN_TO_GPT')}
        >
          <div className="tab-icon-box">
            <Truck size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="tab-info-title">3. Return to GPT</div>
            <div className="tab-info-desc">Concessionaire refill dispatch</div>
          </div>
          {scannedItems.length > 0 && workflow === 'RETURN_TO_GPT' && (
            <span className="badge badge-orange" style={{ marginLeft: 'auto', fontWeight: 700 }}>
              {scannedItems.length}
            </span>
          )}
        </div>

        <div
          className={`workflow-tab-card ${workflow === 'RECEIVE_FROM_GPT' ? 'active' : ''}`}
          onClick={() => handleWorkflowChange('RECEIVE_FROM_GPT')}
        >
          <div className="tab-icon-box">
            <CheckCircle2 size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="tab-info-title">4. Receive from GPT</div>
            <div className="tab-info-desc">Refilled cylinders back to store</div>
          </div>
          {scannedItems.length > 0 && workflow === 'RECEIVE_FROM_GPT' && (
            <span className="badge badge-emerald" style={{ marginLeft: 'auto', fontWeight: 700 }}>
              {scannedItems.length}
            </span>
          )}
        </div>
      </div>

      {/* Prominent Success Flash Message */}
      {flashMessage && (
        <div className="flash-message success">
          <CheckCircle2 size={28} color="#059669" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#065f46' }}>
              {flashMessage.title} ({flashMessage.transaction_no})
            </div>
            <div style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}>
              {flashMessage.message}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.3rem' }}>
              Logged at {flashMessage.timestamp} • {flashMessage.itemsCount} cylinders processed
            </div>
          </div>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}
            onClick={() => setFlashMessage(null)}
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="flash-message error">
          <AlertCircle size={24} color="#dc2626" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>
            {errorMessage}
          </div>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}
            onClick={() => setErrorMessage(null)}
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Workflow Input Form & Scanner Box */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

        {/* Left: Transaction Parameters Form */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              {workflow === 'ISSUE' && 'Issue Details'}
              {workflow === 'RETURN' && 'Return Details'}
              {workflow === 'RETURN_TO_GPT' && 'GPT Refill Dispatch'}
              {workflow === 'RECEIVE_FROM_GPT' && 'GPT Refill Receipt'}
            </h3>
          </div>

          {(workflow === 'ISSUE' || workflow === 'RETURN') && (
            <>
              <div className="form-group">
                <label className="form-label">
                  {workflow === 'ISSUE' ? 'Indenter / Receiver Name *' : 'Returner / Staff Name *'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Staff Nurse Siti (ICU)"
                  value={indenterName}
                  onChange={(e) => setIndenterName(e.target.value)}
                />
              </div>

              {workflow === 'ISSUE' && (
                <div className="form-group">
                  <label className="form-label">Destination Hospital Unit *</label>
                  <select
                    className="form-select"
                    value={destinationWardId}
                    onChange={(e) => setDestinationWardId(e.target.value)}
                  >
                    {settings?.locations?.filter(l => !l.is_central_store && l.is_in_hospital).map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {workflow === 'RETURN' && (
                <div style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: '0.78rem',
                  color: 'var(--primary)',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  lineHeight: 1.4
                }}>
                  <MapPin size={16} style={{ flexShrink: 0 }} />
                  <span>
                    Each cylinder will be returned from its respective clinic/ward/unit location shown in the batch table.
                  </span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Manual Indent Form Reference</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder=""
                  value={indentNo}
                  onChange={(e) => setIndentNo(e.target.value)}
                />
              </div>
            </>
          )}

          {(workflow === 'RETURN_TO_GPT' || workflow === 'RECEIVE_FROM_GPT') && (
            <>
              <div className="form-group">
                <label className="form-label">Concessionaire Vendor</label>
                <input
                  type="text"
                  className="form-input"
                  disabled
                  value="Gas Pantai Timur Sdn Bhd (GPT)"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Delivery Order (DO) / Consignment Ref</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. GPT-DO-98214"
                  value={deliveryOrderNo}
                  onChange={(e) => setDeliveryOrderNo(e.target.value)}
                />
              </div>

              {workflow === 'RECEIVE_FROM_GPT' && (
                <div className="form-group">
                  <label className="form-label">New Gas Refill Batch Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. BATCH-GPT-2026-X"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label className="form-label">Remarks / Special Notes</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder=""
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={isSubmitting || scannedItems.length === 0}
              onClick={handleSubmitTransaction}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="animate-spin" size={16} /> Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Confirm & Submit ({scannedItems.length} Cylinders)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Barcode Scanner Input & Rapid Scan Zone */}
        <div>
          <div className="scanner-input-container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>
                <Scan size={20} />
                <span>Barcode Scanner Input</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Volume2 size={14} /> Chime on capture
              </div>
            </div>

            <form onSubmit={handleManualScanSubmit} className="scanner-input-row">
              <input
                ref={inputRef}
                type="text"
                className="scanner-text-input"
                placeholder=" "
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isScanning || !scanInput.trim()}
              >
                {isScanning ? <RefreshCw className="animate-spin" size={16} /> : 'Scan / Enter'}
              </button>
            </form>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💡 <strong>Auto-Enter Active:</strong> Scanner pauses are captured automatically within 280ms (Enter key is optional).</span>
            </div>
          </div>

          {/* Scanned Items Table */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h3 className="card-title">
                  Scanned Cylinders Batch
                </h3>
                <span className="badge badge-blue">
                  {scannedItems.length} items collected
                </span>
              </div>

              {scannedItems.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => setScannedItems([])}
                >
                  Clear All
                </button>
              )}
            </div>

            {scannedItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <Scan size={44} strokeWidth={1.5} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No Cylinders Scanned Yet</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Use your wireless scanner or type a barcode above to begin collecting items.
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
                      {workflow === 'RETURN' ? (
                        <th>Return Condition</th>
                      ) : (
                        <th>Status</th>
                      )}
                      <th>Location</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedItems.map((item, index) => (
                      <tr key={`${item.gas_id}-${index}`}>
                        <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
                          {scannedItems.length - index}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
                            {item.gas_id}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          {item.batch_number && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              B/N: {item.batch_number}
                            </div>
                          )}
                        </td>
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

                        {/* Status Column / Swapped with Return Condition in Return Tab */}
                        {workflow === 'RETURN' ? (
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span className={`badge ${item.workflow_status === 'EMPTY' ? 'badge-amber' :
                                item.workflow_status === 'DAMAGED' ? 'badge-rose' :
                                  item.workflow_status === 'EXPIRED' ? 'badge-red' :
                                    item.workflow_status === 'FULL' ? 'badge-emerald' : 'badge-gray'
                                }`}>
                                {item.workflow_status === 'EMPTY' ? 'Empty' : item.workflow_status}
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                onClick={() => openEditStatusModal(index)}
                                title="Edit return condition (e.g. damaged, expired)"
                              >
                                <Edit3 size={12} />
                              </button>
                            </div>
                            {item.workflow_remarks && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: '2px' }}>
                                ⚠️ {item.workflow_remarks}
                              </div>
                            )}
                          </td>
                        ) : (
                          <td>
                            {getStatusBadge(item.status_code, item.status_name, item.status_badge_color)}
                          </td>
                        )}

                        {/* Location Column with Validation & In-Place Editing */}
                        <td>
                          {renderLocationCell(item, index)}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '0.3rem 0.5rem' }}
                            onClick={() => handleRemoveItem(index)}
                            title="Remove from batch"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Status Modal (For Return workflow special cases: expired, damaged) */}
      {editingItemIndex !== null && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="card-header">
              <h3 className="card-title">
                Edit Return Status: {scannedItems[editingItemIndex]?.gas_id}
              </h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setEditingItemIndex(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Standard returns default to <strong>Empty</strong>. Use this to flag special circumstances like physical valve damage, leaks, or expired medical gas.
            </p>

            <div className="form-group">
              <label className="form-label">Return Condition / Status</label>
              <select
                className="form-select"
                value={editStatusValue}
                onChange={(e) => setEditStatusValue(e.target.value)}
              >
                <option value="EMPTY">Empty (Standard Refill Required)</option>
                <option value="EXPIRED">Expired (Partial/Full gas past expiry)</option>
                <option value="DAMAGED">Damaged (Faulty valve / Leaking / Dented)</option>
                <option value="FULL">Returned Full (Unused from ward)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Incident / Special Remarks</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="e.g. Pin-index valve pin loose; hiss sound detected"
                value={editRemarksValue}
                onChange={(e) => setEditRemarksValue(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingItemIndex(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveItemStatus}
              >
                Apply Condition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
