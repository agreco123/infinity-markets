import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useStudy } from './hooks/useStudy';
import { useState, useEffect } from 'react';
import Search from './pages/Search';
import Loading from './pages/Loading';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

function StudyRouter() {
  const study = useStudy();
  const navigate = useNavigate();

  useEffect(() => {
    if (study.phase === 'complete') navigate('/dashboard');
  }, [study.phase]);

  return (
    <Routes>
      <Route path="/" element={<Search onSearch={(q) => { study.run(q); navigate('/loading'); }} />} />
      <Route path="/loading" element={<Loading study={study} onReset={() => navigate('/')} />} />
      <Route path="/dashboard" element={<Dashboard study={study} onReset={() => { window.location.href = '/'; }} />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StudyRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
