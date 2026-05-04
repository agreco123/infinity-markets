import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useStudy } from './hooks/useStudy';
import { useEffect } from 'react';
import Search from './pages/Search';
import Loading from './pages/Loading';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Debug from './pages/Debug';
import Studies from './pages/Studies';
import { ErrorBoundary, Page } from './components/ui';

/**
 * App shell. Routes preserved exactly as v4.1.4:
 *   /          → Search (entry; logo + brass search field)
 *   /loading   → Loading (data pull animation, phase tracker)
 *   /dashboard → Dashboard (full study workspace)
 *   /login     → Login
 *   /debug     → Debug
 *   /studies   → New: list of saved studies (gated to authed users; falls back to empty state)
 *
 * useStudy() is hoisted to a single instance via StudyRouter so that hitting
 * /loading after /search retains the in-flight study state — exactly as
 * v4.1.4 already did. No data path changes.
 */

function StudyRouter() {
  const study = useStudy();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (study.phase === 'complete' && location.pathname === '/loading') {
      navigate('/dashboard');
    }
  }, [study.phase, location.pathname, navigate]);

  return (
    <Routes>
      <Route path="/" element={<Search onSearch={(q) => { study.run(q); navigate('/loading'); }} />} />
      <Route path="/loading" element={<Loading study={study} onReset={() => navigate('/')} />} />
      <Route path="/dashboard" element={<Dashboard study={study} onReset={() => { window.location.href = '/'; }} />} />
      <Route path="/studies" element={<Studies />} />
      <Route path="/login" element={<Login />} />
      <Route path="/debug" element={<Debug />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <StudyRouter />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
