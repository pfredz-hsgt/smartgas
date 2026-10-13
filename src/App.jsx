import { useState, useEffect } from 'react';
import Header from './components/Header';
import ScannerPage from './pages/ScannerPage';
import InventoryPage from './pages/InventoryPage';
import RegisterCylinderPage from './pages/RegisterCylinderPage';
import LabelRegistrationPage from './pages/LabelRegistrationPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settings, setSettings] = useState(null);
  const [initialCylinderForPrint, setInitialCylinderForPrint] = useState(null);
  const [currentUser, setCurrentUser] = useState({
    username: 'staff',
    full_name: 'Logistic Pharmacy Staff',
    role: 'staff',
  });

  // Fetch reference settings from Fastify API
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/all');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Sync dark theme attribute on HTML body
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDarkMode]);

  const handleSelectPrintLabel = (cylinder) => {
    setInitialCylinderForPrint(cylinder);
    setActiveTab('labels');
  };

  return (
    <div>
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        currentUser={currentUser}
      />

      <main className="main-content">
        {activeTab === 'scanner' && (
          <ScannerPage
            settings={settings}
            onCylinderUpdated={fetchSettings}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryPage
            settings={settings}
            onSelectPrintLabel={handleSelectPrintLabel}
            onCylinderUpdated={fetchSettings}
          />
        )}

        {activeTab === 'register' && (
          <RegisterCylinderPage
            settings={settings}
            onCylinderRegistered={fetchSettings}
          />
        )}

        {activeTab === 'labels' && (
          <LabelRegistrationPage
            settings={settings}
            onCylinderCreated={fetchSettings}
            initialCylinderForPrint={initialCylinderForPrint}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsPage
            settings={settings}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            settings={settings}
            onSettingsUpdated={fetchSettings}
          />
        )}
      </main>
    </div>
  );
}
