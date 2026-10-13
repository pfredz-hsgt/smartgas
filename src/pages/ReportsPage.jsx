import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Calendar, 
  Filter, 
  Download, 
  Printer, 
  RefreshCw, 
  ArrowRight, 
  CheckCircle2, 
  ExternalLink,
  X,
  FileSpreadsheet
} from 'lucide-react';

export default function ReportsPage({ settings }) {
  const [transactions, setTransactions] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [loadingTxnDetail, setLoadingTxnDetail] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [dashRes, txnRes] = await Promise.all([
        fetch('/api/reports/dashboard'),
        fetch(`/api/transactions?type=${typeFilter}&search=${encodeURIComponent(searchTerm)}&limit=100`),
      ]);

      if (dashRes.ok) setDashboardData(await dashRes.json());
      if (txnRes.ok) setTransactions(await txnRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [typeFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchReports();
  };

  const openTxnDetails = async (txnId) => {
    setLoadingTxnDetail(true);
    try {
      const res = await fetch(`/api/transactions/${txnId}`);
      if (res.ok) {
        setSelectedTxn(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTxnDetail(false);
    }
  };

  // Export to CSV
  const exportTransactionsToCSV = () => {
    if (transactions.length === 0) return;

    const headers = [
      'Transaction No',
      'Type',
      'Reference / Indent',
      'DO Ref',
      'Indenter / Recipient',
      'Source Location',
      'Destination Location',
      'Performed By',
      'Item Count',
      'Timestamp',
    ];

    const rows = transactions.map(t => [
      `"${t.transaction_no}"`,
      `"${t.transaction_type}"`,
      `"${t.indent_no || ''}"`,
      `"${t.delivery_order_no || ''}"`,
      `"${t.indenter_name || ''}"`,
      `"${t.source_location_name}"`,
      `"${t.destination_location_name}"`,
      `"${t.performed_by_name}"`,
      t.item_count,
      `"${new Date(t.created_at).toLocaleString('en-GB')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartgas_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'ISSUE': return <span className="badge badge-blue">ISSUE TO WARD</span>;
      case 'RETURN': return <span className="badge badge-emerald">RETURN FROM WARD</span>;
      case 'RETURN_TO_VENDOR': return <span className="badge badge-orange">SENT TO GPT</span>;
      case 'RECEIVE_FROM_VENDOR': return <span className="badge badge-purple">RECEIVED FROM GPT</span>;
      default: return <span className="badge badge-gray">{type}</span>;
    }
  };

  return (
    <div>
      {/* Top Header & Export Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Reports & Transaction Audit Log</h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Hospital-wide audit trail of all medical gas cylinder movements and vendor refilling shipments.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportTransactionsToCSV}
            disabled={transactions.length === 0}
          >
            <FileSpreadsheet size={16} color="#059669" />
            Export Audit Log (CSV)
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Print Report
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {dashboardData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1.1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Cylinders Tracked</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem' }}>
              {dashboardData.totals?.total_cylinders || 0}
            </div>
          </div>
          <div className="card" style={{ padding: '1.1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>Full Stock In Store</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.2rem' }}>
              {dashboardData.totals?.full_count || 0}
            </div>
          </div>
          <div className="card" style={{ padding: '1.1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>In Use Across Hospital</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.2rem' }}>
              {dashboardData.totals?.issued_count || 0}
            </div>
          </div>
          <div className="card" style={{ padding: '1.1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#ea580c', fontWeight: 600 }}>With GPT (Refilling Offsite)</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ea580c', marginTop: '0.2rem' }}>
              {dashboardData.totals?.at_vendor_count || 0}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 250px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2rem', width: '100%' }}
              placeholder="Search TXN #, indent, receiver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="form-select"
            style={{ flex: '1 1 180px' }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Movement Types</option>
            <option value="ISSUE">Issue to Wards</option>
            <option value="RETURN">Return from Wards</option>
            <option value="RETURN_TO_VENDOR">Dispatched to GPT</option>
            <option value="RECEIVE_FROM_VENDOR">Received from GPT</option>
          </select>

          <button type="submit" className="btn btn-primary" style={{ padding: '0.65rem 1rem' }}>
            Search
          </button>

          {(searchTerm || typeFilter) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setSearchTerm(''); setTypeFilter(''); }}
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {/* Transaction Log Table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 0.75rem' }} />
            <div>Loading transaction logs...</div>
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <FileText size={44} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
            <div style={{ fontWeight: 600 }}>No transaction logs found</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Transactions performed in the 2D Scanner page will be logged here.
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Txn Number</th>
                  <th>Movement Type</th>
                  <th>Reference / Slip</th>
                  <th>Indenter / Recipient</th>
                  <th>Transfer Route</th>
                  <th>Cylinders</th>
                  <th>Performed By</th>
                  <th>Timestamp</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(txn => (
                  <tr key={txn.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--primary)' }}>
                        {txn.transaction_no}
                      </span>
                    </td>
                    <td>{getTypeBadge(txn.transaction_type)}</td>
                    <td>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {txn.indent_no || txn.delivery_order_no || '-'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{txn.indenter_name}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                        <span>{txn.source_location_name}</span>
                        <ArrowRight size={12} color="var(--text-muted)" />
                        <span style={{ fontWeight: 700 }}>{txn.destination_location_name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-gray" style={{ fontWeight: 800 }}>
                        {txn.item_count} items
                      </span>
                    </td>
                    <td>{txn.performed_by_name}</td>
                    <td>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(txn.created_at).toLocaleString('en-GB')}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => openTxnDetails(txn.id)}
                      >
                        <ExternalLink size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTxn && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  {selectedTxn.transaction_no}
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Logged at {new Date(selectedTxn.created_at).toLocaleString('en-GB')} by {selectedTxn.staff_name}
                </div>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setSelectedTxn(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: 'var(--bg-subtle)', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div><strong>Movement:</strong> {getTypeBadge(selectedTxn.transaction_type)}</div>
                <div><strong>Indenter/Party:</strong> {selectedTxn.indenter_name}</div>
                <div><strong>Source:</strong> {selectedTxn.source_name}</div>
                <div><strong>Destination:</strong> {selectedTxn.destination_name}</div>
                {selectedTxn.indent_no && <div><strong>Indent Slip:</strong> {selectedTxn.indent_no}</div>}
                {selectedTxn.delivery_order_no && <div><strong>DO Ref:</strong> {selectedTxn.delivery_order_no}</div>}
              </div>
              {selectedTxn.notes && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <strong>Notes:</strong> {selectedTxn.notes}
                </div>
              )}
            </div>

            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Scanned Cylinder Items ({selectedTxn.items?.length || 0})
            </h4>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gas ID / Barcode</th>
                    <th>Cylinder Name</th>
                    <th>Status Before</th>
                    <th>Status After</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTxn.items?.map(it => (
                    <tr key={it.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
                        {it.gas_id}
                      </td>
                      <td>{it.cylinder_name}</td>
                      <td><span className="badge badge-gray">{it.status_before || '-'}</span></td>
                      <td><span className="badge badge-emerald">{it.status_after || '-'}</span></td>
                      <td style={{ fontSize: '0.78rem' }}>{it.item_remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedTxn(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
