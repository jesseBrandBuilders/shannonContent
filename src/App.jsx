import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppShell } from './components/layout/AppShell';
import { ToastContainer } from './components/ui/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Composer from './pages/Composer';
import Library from './pages/Library';
import Calendar from './pages/Calendar';
import Templates from './pages/Templates';
import Analytics from './pages/Analytics';
import Leads from './pages/Leads';

function ProtectedShell() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-sm text-stone-500">Loading…</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <AppShell />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/composer" element={<Composer />} />
          <Route path="/library" element={<Library />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
