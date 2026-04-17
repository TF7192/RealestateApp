import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import NewProperty from './pages/NewProperty';
import NewLead from './pages/NewLead';
import Customers from './pages/Customers';
import Deals from './pages/Deals';
import Login from './pages/Login';
import AgentPortal from './pages/AgentPortal';
import CustomerPropertyView from './pages/CustomerPropertyView';
import Profile from './pages/Profile';
import { AuthProvider, useAuth } from './lib/auth';
import CommandPalette from './components/CommandPalette';

// Mobile-optimized shell
import MobileLayout from './mobile/MobileLayout';
import MobileDashboard from './mobile/pages/MobileDashboard';
import MobileProperties from './mobile/pages/MobileProperties';
import MobilePropertyDetail from './mobile/pages/MobilePropertyDetail';
import MobileLeads from './mobile/pages/MobileLeads';
import MobileDeals from './mobile/pages/MobileDeals';
import MobileLogin from './mobile/pages/MobileLogin';
import MobileNewLead from './mobile/pages/MobileNewLead';
import MobileNewProperty from './mobile/pages/MobileNewProperty';
import MobileSettings from './mobile/pages/MobileSettings';

import { shouldUseMobileUI, initStatusBar } from './native';
import './App.css';

function AppRoutes() {
  const { user, loading, logout } = useAuth();
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileUI());
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    initStatusBar();
    const onResize = () => setIsMobile(shouldUseMobileUI());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Global ⌘K / Ctrl+K → command palette
  useEffect(() => {
    if (!user || user.role !== 'AGENT') return undefined;
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  return (
    <>
      {isMobile
        ? <MobileAppRoutes user={user} logout={logout} />
        : <DesktopAppRoutes user={user} logout={logout} />}
      {user?.role === 'AGENT' && (
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      )}
    </>
  );
}

function MobileAppRoutes({ user, logout }) {
  // Public routes always available
  if (!user) {
    return (
      <Routes>
        <Route path="/p/:id" element={<MobilePropertyDetail />} />
        <Route path="/a/:agentId" element={<AgentPortal />} />
        <Route path="*" element={<MobileLogin />} />
      </Routes>
    );
  }
  // Only agents can log in — any non-agent drops to public
  return (
    <Routes>
      <Route element={<MobileLayout onLogout={logout} />}>
        <Route path="/" element={<MobileDashboard />} />
        <Route path="/properties" element={<MobileProperties />} />
        <Route path="/properties/new" element={<MobileNewProperty />} />
        <Route path="/properties/:id" element={<MobilePropertyDetail />} />
        <Route path="/customers" element={<MobileLeads />} />
        <Route path="/customers/new" element={<MobileNewLead />} />
        {/* Legacy URLs */}
        <Route path="/leads" element={<Navigate to="/customers" replace />} />
        <Route path="/leads/new" element={<Navigate to="/customers/new" replace />} />
        <Route path="/buyers" element={<Navigate to="/customers?tab=active" replace />} />
        <Route path="/deals" element={<MobileDeals />} />
        <Route path="/settings" element={<MobileSettings />} />
      </Route>
      <Route path="/p/:id" element={<MobilePropertyDetail />} />
      <Route path="/a/:agentId" element={<AgentPortal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DesktopAppRoutes({ user, logout }) {
  if (!user) {
    return (
      <Routes>
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="/a/:agentId" element={<AgentPortal />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout onLogout={logout} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/properties/new" element={<NewProperty />} />
        <Route path="/properties/:id" element={<PropertyDetail />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<NewLead />} />
        <Route path="/profile" element={<Profile />} />
        {/* Legacy URLs — redirect */}
        <Route path="/leads" element={<Navigate to="/customers" replace />} />
        <Route path="/leads/new" element={<Navigate to="/customers/new" replace />} />
        <Route path="/buyers" element={<Navigate to="/customers?tab=active" replace />} />
        <Route path="/deals" element={<Deals />} />
      </Route>
      <Route path="/p/:id" element={<CustomerPropertyView />} />
      <Route path="/a/:agentId" element={<AgentPortal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
