import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import NewProperty from './pages/NewProperty';
import Leads from './pages/Leads';
import NewLead from './pages/NewLead';
import Buyers from './pages/Buyers';
import Deals from './pages/Deals';
import Login from './pages/Login';
import CustomerPortal from './pages/CustomerPortal';
import CustomerPropertyView from './pages/CustomerPropertyView';
import { AuthProvider, useAuth } from './lib/auth';

// Mobile-optimized shell
import MobileLayout from './mobile/MobileLayout';
import MobileDashboard from './mobile/pages/MobileDashboard';
import MobileProperties from './mobile/pages/MobileProperties';
import MobilePropertyDetail from './mobile/pages/MobilePropertyDetail';
import MobileLeads from './mobile/pages/MobileLeads';
import MobileDeals from './mobile/pages/MobileDeals';
import MobileBuyers from './mobile/pages/MobileBuyers';
import MobileLogin from './mobile/pages/MobileLogin';
import MobileNewLead from './mobile/pages/MobileNewLead';
import MobileNewProperty from './mobile/pages/MobileNewProperty';
import MobileSettings from './mobile/pages/MobileSettings';
import { ToastProvider } from './mobile/components/Toast';

import { shouldUseMobileUI, initStatusBar } from './native';
import './App.css';

function AppRoutes() {
  const { user, loading, logout } = useAuth();
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileUI());

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

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (isMobile) return <MobileAppRoutes user={user} logout={logout} />;
  return <DesktopAppRoutes user={user} logout={logout} />;
}

function MobileAppRoutes({ user, logout }) {
  if (!user) {
    return (
      <Routes>
        <Route path="/p/:id" element={<MobilePropertyDetail />} />
        <Route path="*" element={<MobileLogin />} />
      </Routes>
    );
  }
  if (user.role === 'CUSTOMER') {
    return (
      <Routes>
        <Route path="/customer" element={<CustomerPortal onLogout={logout} />} />
        <Route path="/p/:id" element={<MobilePropertyDetail />} />
        <Route path="*" element={<Navigate to="/customer" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<MobileLayout onLogout={logout} />}>
        <Route path="/" element={<MobileDashboard />} />
        <Route path="/properties" element={<MobileProperties />} />
        <Route path="/properties/new" element={<MobileNewProperty />} />
        <Route path="/properties/:id" element={<MobilePropertyDetail />} />
        <Route path="/leads" element={<MobileLeads />} />
        <Route path="/leads/new" element={<MobileNewLead />} />
        <Route path="/buyers" element={<MobileBuyers />} />
        <Route path="/deals" element={<MobileDeals />} />
        <Route path="/settings" element={<MobileSettings />} />
      </Route>
      <Route path="/p/:id" element={<MobilePropertyDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DesktopAppRoutes({ user, logout }) {
  if (!user) {
    return (
      <Routes>
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="/share" element={<CustomerPortal onLogout={() => {}} isPublic />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (user.role === 'CUSTOMER') {
    return (
      <Routes>
        <Route path="/customer" element={<CustomerPortal onLogout={logout} />} />
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="*" element={<Navigate to="/customer" replace />} />
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
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/new" element={<NewLead />} />
        <Route path="/buyers" element={<Buyers />} />
        <Route path="/deals" element={<Deals />} />
      </Route>
      <Route path="/p/:id" element={<CustomerPropertyView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
