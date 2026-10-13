import React from 'react';
import {
  Flame,
  Scan,
  Boxes,
  Printer,
  FileText,
  Settings as SettingsIcon,
  Moon,
  Sun,
  ShieldCheck,
  Building2,
  PackagePlus
} from 'lucide-react';

export default function Header({
  activeTab,
  setActiveTab,
  isDarkMode,
  setIsDarkMode,
  currentUser
}) {
  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand */}
        <div className="brand-wrapper">
          <div className="brand-logo-icon">
            <Flame size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div className="brand-title">
              SmartGas <span className="brand-badge">HSEGAMAT</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Building2 size={12} /> Medical Gas Management
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
            onClick={() => setActiveTab('scanner')}
          >
            <Scan size={18} />
            <span>Scanner</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            <Boxes size={18} />
            <span>Inventory</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            <PackagePlus size={18} />
            <span>Register Cylinder</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <FileText size={18} />
            <span>Reports & Logs</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'labels' ? 'active' : ''}`}
            onClick={() => setActiveTab('labels')}
          >
            <Printer size={18} />
            <span>Print Labels</span>
          </button>
        </nav>

        {/* Status Indicators & Controls */}
        <div className="header-right">
          <div className="scanner-indicator" title="Continuous background listener is active for wireless 2D barcode scanner">
            <span className="pulse-dot"></span>
            <span>Online</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8rem',
              background: 'var(--bg-subtle)',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)'
            }}
          >
            <ShieldCheck size={16} color="var(--primary)" />
            <div>
              <div style={{ fontWeight: 700, lineHeight: 1.1 }}>{currentUser?.full_name || 'Pharmacy Staff'}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Logistic Pharmacy Store</div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)' }}
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="Toggle Dark/Light Mode"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
