import { useState, useEffect, createContext, useContext } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('im_token');
    if (!token) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then(d => setUser(d.user))
      .catch(() => localStorage.removeItem('im_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const d = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('im_token', d.session.access_token);
    setUser(d.user);
    return d;
  };

  const signup = async (email, password) => {
    const d = await api.post('/api/auth/signup', { email, password });
    if (d.session) localStorage.setItem('im_token', d.session.access_token);
    setUser(d.user);
    return d;
  };

  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch (_) {}
    localStorage.removeItem('im_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
