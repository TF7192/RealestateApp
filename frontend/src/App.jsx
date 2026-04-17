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
import './App.css';

function AppRoutes() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  // Not logged in — public property pages and shared filter links
  if (!user) {
    return (
      <Routes>
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="/share" element={<CustomerPortal onLogout={() => {}} isPublic />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Customer mode
  if (user.role === 'CUSTOMER') {
    return (
      <Routes>
        <Route path="/customer" element={<CustomerPortal onLogout={logout} />} />
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="*" element={<Navigate to="/customer" replace />} />
      </Routes>
    );
  }

  // Agent mode
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
      <AppRoutes />
    </AuthProvider>
  );
}
