import { useState } from 'react';
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
import './App.css';

export default function App() {
  const [user, setUser] = useState(null); // null | 'agent' | 'customer'

  const handleLogin = (role) => {
    setUser(role);
  };

  const handleLogout = () => {
    setUser(null);
  };

  // Not logged in
  if (!user) {
    return (
      <Routes>
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="*" element={<Login onLogin={handleLogin} />} />
      </Routes>
    );
  }

  // Customer mode
  if (user === 'customer') {
    return (
      <Routes>
        <Route path="/customer" element={<CustomerPortal onLogout={handleLogout} />} />
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="*" element={<Navigate to="/customer" replace />} />
      </Routes>
    );
  }

  // Agent mode
  return (
    <Routes>
      <Route element={<Layout onLogout={handleLogout} />}>
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
