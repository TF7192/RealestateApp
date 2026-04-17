import { useEffect, useState } from 'react';
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

import { initStatusBar } from './native';
import './App.css';

/**
 * Single app shell — the same pages run on mobile and desktop.
 * The Layout's drawer sidebar, responsive grids, and safe-area paddings
 * deliver the mobile experience; no separate mobile fork.
 */
function AppRoutes() {
  const { user, loading, logout } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => { initStatusBar(); }, []);

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
    <>
      <Routes>
        <Route element={<Layout onLogout={logout} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/new" element={<NewProperty />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<NewLead />} />
          <Route path="/profile" element={<Profile />} />
          {/* Legacy routes — redirect */}
          <Route path="/leads" element={<Navigate to="/customers" replace />} />
          <Route path="/leads/new" element={<Navigate to="/customers/new" replace />} />
          <Route path="/buyers" element={<Navigate to="/customers?tab=active" replace />} />
          <Route path="/deals" element={<Deals />} />
        </Route>
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="/a/:agentId" element={<AgentPortal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {user.role === 'AGENT' && (
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
