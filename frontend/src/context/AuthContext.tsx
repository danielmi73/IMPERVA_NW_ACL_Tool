import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI } from '../services/api';

interface AuthState {
  isAuthenticated: boolean;
  setupComplete: boolean | null;
  passwordSet: boolean | null;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
  checkStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    try {
      const token = localStorage.getItem('ddos_token');
      const { data } = await authAPI.getStatus();
      setSetupComplete(data.setup_complete);
      setPasswordSet(data.password_set);
      setIsAuthenticated(!!token && data.setup_complete);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const login = async (password: string) => {
    const { data } = await authAPI.login(password);
    localStorage.setItem('ddos_token', data.access_token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('ddos_token');
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, setupComplete, passwordSet, loading, login, logout, checkStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
