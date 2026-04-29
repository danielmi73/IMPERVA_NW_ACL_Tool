import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, adminAPI } from '../services/api';

const ShieldIcon = () => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="64" y2="64">
        <stop offset="0%" stopColor="#6366f1"/>
        <stop offset="100%" stopColor="#06b6d4"/>
      </linearGradient>
    </defs>
    <path d="M32 4L6 16v16c0 14.4 11.1 27.8 26 30 14.9-2.2 26-15.6 26-30V16L32 4z" fill="url(#lg)" opacity="0.9"/>
    <path d="M32 12l-18 8.4v11.2c0 10.1 7.7 19.5 18 21 10.3-1.5 18-10.9 18-21V20.4L32 12z" fill="#0f172a" opacity="0.7"/>
    <path d="M28 34l-6-6 2.8-2.8L28 28.4l11.2-11.2L42 20 28 34z" fill="white"/>
  </svg>
);

export default function Login() {
  const { login, setupComplete, passwordSet, checkStatus } = useAuth();
  
  // Determine initial step
  let initialStep: 'login' | 'setup-password' | 'setup-api' = 'login';
  if (setupComplete === false) {
    if (passwordSet === false) {
      initialStep = 'setup-password';
    } else {
      initialStep = 'setup-api';
    }
  }

  const [step, setStep] = useState<'login' | 'setup-password' | 'setup-api'>(initialStep);

  React.useEffect(() => {
    if (setupComplete === false) {
      if (passwordSet === false) {
        setStep('setup-password');
      } else {
        setStep('setup-api');
      }
    } else if (setupComplete === true) {
      setStep('login');
    }
  }, [setupComplete, passwordSet]);
  const [password, setPassword] = useState('');
  const [apiId, setApiId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await authAPI.setupPassword(password);
      // Auto-login after setting password
      await login(password);
      setSuccess('Password set successfully');
      setStep('setup-api');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupAPI = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!apiId || !apiKey || !accountId) {
      setError('All fields are required');
      return;
    }
    setLoading(true);
    try {
      await adminAPI.saveCredentials({ api_id: apiId, api_key: apiKey, account_id: accountId });
      setSuccess('API credentials validated & saved');
      // Complete setup
      await adminAPI.completeSetup();
      await checkStatus();
      // Redirect handled by router
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-section">
          <ShieldIcon />
          <h1>DDoS Prefix Manager</h1>
          <p>
            {step === 'login' && 'Sign in to your dashboard'}
            {step === 'setup-password' && 'First-time setup — Set admin password'}
            {step === 'setup-api' && 'Configure Imperva API credentials'}
          </p>
        </div>

        {error && <div className="alert-banner danger" style={{ marginBottom: 20 }}>⚠ {error}</div>}
        {success && <div className="alert-banner success" style={{ marginBottom: 20 }}>✓ {success}</div>}

        {step === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Admin Password</label>
              <input
                id="login-password"
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoFocus
              />
            </div>
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign In'}
            </button>
          </form>
        )}

        {step === 'setup-password' && (
          <form onSubmit={handleSetupPassword}>
            <div className="form-group">
              <label className="form-label" htmlFor="setup-password">Choose Admin Password</label>
              <input
                id="setup-password"
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                autoFocus
              />
            </div>
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Set Password & Continue'}
            </button>
          </form>
        )}

        {step === 'setup-api' && (
          <form onSubmit={handleSetupAPI}>
            <div className="form-group">
              <label className="form-label" htmlFor="api-id">API ID</label>
              <input
                id="api-id"
                className="form-input"
                type="text"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
                placeholder="Imperva API ID"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="api-key">API Key</label>
              <input
                id="api-key"
                className="form-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Imperva API Key"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="account-id">Account ID</label>
              <input
                id="account-id"
                className="form-input"
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Imperva Account ID"
              />
            </div>
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Validate & Save'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
