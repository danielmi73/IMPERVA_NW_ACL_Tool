import React, { useEffect, useRef, useState } from 'react';
import { adminAPI, authAPI } from '../services/api';
import { formatDateTime } from '../utils/date';
import TemplateVariableHelper, { NOTIFICATION_VARIABLES } from '../components/TemplateVariableHelper';

// ---------------------------------------------------------------------------
// Default email template (shown when DB has nothing stored yet)
// ---------------------------------------------------------------------------
const DEFAULT_SUBJECT = '[DDoS Alert] {{event_type}} — {{prefix}}';
const DEFAULT_BODY = `Dear {{customer_name}},

This is an automated notification from the DDoS Management System.

Event:      {{event_type}}
Prefix:     {{prefix}}
ACL:        {{acl_name}} (ID: {{acl_id}})
Detected:   {{detected_at}}
Peak:       {{peak_mbps}} Mbps
Threshold:  {{threshold_mbps}} Mbps

{{custom_message}}

—
Imperva DDoS Management`;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
interface ACLPolicy {
  id: string;
  name: string;
  description: string;
  last_synced: string | null;
}

interface AdminSettings {
  api_configured: boolean;
  account_id: string | null;
  api_base_url: string | null;
  api_key_expired: boolean;
  last_api_check: string | null;
  setup_complete: boolean;
  poll_interval_seconds: number;
  smtp_configured: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_from_address: string | null;
  smtp_encryption: string | null;
  smtp_default_subject: string | null;
  smtp_default_body: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Admin() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [aclPolicies, setAclPolicies] = useState<ACLPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Credentials form
  const [credForm, setCredForm] = useState({ api_id: '', api_key: '', account_id: '', api_base_url: 'https://my.imperva.com' });
  const [credLoading, setCredLoading] = useState(false);

  // Poll interval
  const [pollInterval, setPollInterval] = useState(60);
  const [pollLoading, setPollLoading] = useState(false);

  // Password change
  const [pwForm, setPwForm] = useState({ current: '', newPw: '' });
  const [pwLoading, setPwLoading] = useState(false);

  // Test connection
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // ACL sync
  const [aclSyncing, setAclSyncing] = useState(false);

  // Editing ACL descriptions
  const [editingAcl, setEditingAcl] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');

  // SMTP form
  const [smtpForm, setSmtpForm] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_from_address: '',
    smtp_encryption: 'STARTTLS',
    smtp_default_subject: DEFAULT_SUBJECT,
    smtp_default_body: DEFAULT_BODY,
  });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpTestLoading, setSmtpTestLoading] = useState(false);

  // Refs for template variable insertion
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [settingsRes, aclRes] = await Promise.all([
        adminAPI.getSettings(),
        adminAPI.getACLPolicies(),
      ]);
      const s: AdminSettings = settingsRes.data;
      setSettings(s);
      setAclPolicies(aclRes.data);
      setPollInterval(s.poll_interval_seconds);
      setCredForm(f => ({ ...f, account_id: s.account_id || '', api_base_url: s.api_base_url || 'https://my.imperva.com' }));

      // Populate SMTP form from saved settings
      setSmtpForm(f => ({
        ...f,
        smtp_host:             s.smtp_host            || '',
        smtp_port:             s.smtp_port             || 587,
        smtp_user:             s.smtp_user             || '',
        smtp_from_address:     s.smtp_from_address     || '',
        smtp_encryption:       s.smtp_encryption       || 'STARTTLS',
        smtp_default_subject:  s.smtp_default_subject  || DEFAULT_SUBJECT,
        smtp_default_body:     s.smtp_default_body     || DEFAULT_BODY,
        smtp_password: '',  // never pre-fill password
      }));
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (msg: string) => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };
  const showError   = (msg: string) => { setError(msg); setSuccess(''); };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credForm.api_id || !credForm.api_key || !credForm.account_id) {
      showError('All credential fields are required');
      return;
    }
    setCredLoading(true);
    try {
      await adminAPI.saveCredentials(credForm);
      showSuccess('Credentials validated and saved');
      await loadAll();
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to save credentials');
    } finally {
      setCredLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      await adminAPI.testConnection();
      setTestResult('success');
      showSuccess('Connection successful');
      await loadAll();
    } catch (err: any) {
      setTestResult('error');
      showError(err.response?.data?.detail || 'Connection failed');
    } finally {
      setTestLoading(false);
    }
  };

  const handlePollInterval = async () => {
    if (pollInterval < 10 || pollInterval > 3600) {
      showError('Interval must be between 10 and 3600 seconds');
      return;
    }
    setPollLoading(true);
    try {
      await adminAPI.setPollInterval(pollInterval);
      showSuccess(`Poll interval updated to ${pollInterval}s`);
      await loadAll();
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to update interval');
    } finally {
      setPollLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw.length < 8) { showError('New password must be at least 8 characters'); return; }
    setPwLoading(true);
    try {
      await authAPI.changePassword(pwForm.current, pwForm.newPw);
      showSuccess('Password changed');
      setPwForm({ current: '', newPw: '' });
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const handleSyncACLs = async () => {
    setAclSyncing(true);
    try {
      const res = await adminAPI.getACLPolicies(true);
      setAclPolicies(res.data);
      showSuccess(`Synced ${res.data.length} ACL policies`);
    } catch (err: any) {
      showError(err.response?.data?.detail || 'ACL sync failed');
    } finally {
      setAclSyncing(false);
    }
  };

  const handleSaveAclDesc = async (policyId: string) => {
    try {
      await adminAPI.updateACLDescription(policyId, editDesc);
      setAclPolicies(prev => prev.map(p => p.id === policyId ? { ...p, description: editDesc } : p));
      setEditingAcl(null);
      showSuccess('Description updated');
    } catch {
      showError('Failed to update description');
    }
  };

  // Auto-adjust port when encryption changes
  const handleEncryptionChange = (enc: string) => {
    const portMap: Record<string, number> = { 'SSL/TLS': 465, 'STARTTLS': 587, 'None': 25 };
    setSmtpForm(f => ({ ...f, smtp_encryption: enc, smtp_port: portMap[enc] ?? f.smtp_port }));
  };

  const handleSaveSMTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpForm.smtp_host || !smtpForm.smtp_user || !smtpForm.smtp_from_address) {
      showError('SMTP Host, Username, and Sender Email are required');
      return;
    }
    setSmtpLoading(true);
    try {
      await adminAPI.saveSMTP(smtpForm);
      showSuccess('SMTP settings saved');
      await loadAll();
    } catch (err: any) {
      showError(err.response?.data?.detail || 'Failed to save SMTP settings');
    } finally {
      setSmtpLoading(false);
    }
  };

  const handleTestSMTP = async () => {
    setSmtpTestLoading(true);
    try {
      const res = await adminAPI.testSMTP();
      showSuccess((res.data as any).message || 'Test email sent');
    } catch (err: any) {
      showError(err.response?.data?.detail || 'SMTP test failed');
    } finally {
      setSmtpTestLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="spinner spinner-lg" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Settings</h1>
          <p className="page-subtitle">API credentials, monitoring, notifications and ACL management</p>
        </div>
      </div>

      {error   && <div className="alert-banner danger">⚠ {error}</div>}
      {success && <div className="alert-banner success">✓ {success}</div>}

      {settings?.api_key_expired && (
        <div className="alert-banner danger">
          ⚠ API key is expired or invalid — monitoring is paused. Update credentials below.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* API Credentials */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">API Credentials</span>
            {settings?.api_configured && (
              <button className="btn btn-secondary btn-sm" onClick={handleTestConnection} disabled={testLoading}>
                {testLoading ? <span className="spinner" /> : '⚡'} Test Connection
              </button>
            )}
          </div>

          {settings?.api_configured && (
            <div className="flex gap-16 mb-16" style={{ flexWrap: 'wrap' }}>
              <div>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>Account ID</span>
                <div className="text-mono">{settings.account_id}</div>
              </div>
              <div>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>Status</span>
                <div>
                  {settings.api_key_expired
                    ? <span className="badge badge-danger">Expired</span>
                    : <span className="badge badge-success">Active</span>
                  }
                </div>
              </div>
              <div>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>Last Check</span>
                <div style={{ fontSize: '0.88rem' }}>{formatDateTime(settings.last_api_check)}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSaveCredentials}>
            <div className="form-group">
              <label className="form-label">API ID</label>
              <input className="form-input" value={credForm.api_id} onChange={e => setCredForm({ ...credForm, api_id: e.target.value })} placeholder="Enter API ID" />
            </div>
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input className="form-input" type="password" value={credForm.api_key} onChange={e => setCredForm({ ...credForm, api_key: e.target.value })} placeholder="Enter API Key" />
            </div>
            <div className="form-group">
              <label className="form-label">Account ID</label>
              <input className="form-input" value={credForm.account_id} onChange={e => setCredForm({ ...credForm, account_id: e.target.value })} placeholder="Imperva Account ID" />
            </div>
            <div className="form-group">
              <label className="form-label">API Base URL</label>
              <input className="form-input" value={credForm.api_base_url} onChange={e => setCredForm({ ...credForm, api_base_url: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={credLoading}>
              {credLoading ? <span className="spinner" /> : 'Validate & Save'}
            </button>
          </form>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-24">
          {/* Poll Interval */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Monitoring Interval</div>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
              How often to poll Imperva for DDoS events. Takes effect immediately.
            </p>
            <div className="flex gap-12 items-center">
              <input
                className="form-input"
                type="number"
                min={10}
                max={3600}
                value={pollInterval}
                onChange={e => setPollInterval(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span className="text-muted">seconds</span>
              <button className="btn btn-primary btn-sm" onClick={handlePollInterval} disabled={pollLoading}>
                {pollLoading ? <span className="spinner" /> : 'Apply'}
              </button>
            </div>
          </div>

          {/* Change Password */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Change Password</div>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input className="form-input" type="password" value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" value={pwForm.newPw} onChange={e => setPwForm({ ...pwForm, newPw: e.target.value })} placeholder="Min 8 characters" />
              </div>
              <button className="btn btn-secondary" type="submit" disabled={pwLoading}>
                {pwLoading ? <span className="spinner" /> : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Email Notifications                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="card mt-24">
        <div className="card-header">
          <div>
            <div className="card-title">Email Notifications</div>
            <div className="card-subtitle">Configure SMTP server and the default email template sent to customers on attack events.</div>
          </div>
          <span className={`badge ${settings?.smtp_configured ? 'badge-success' : 'badge-warning'}`}>
            {settings?.smtp_configured ? '✓ Configured' : 'Not configured'}
          </span>
        </div>

        <form onSubmit={handleSaveSMTP}>
          {/* --- SMTP Server --- */}
          <div style={{ marginBottom: 24 }}>
            <div className="section-divider-label">SMTP Server</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div className="form-group">
                <label className="form-label">SMTP Host</label>
                <input
                  className="form-input"
                  value={smtpForm.smtp_host}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_host: e.target.value }))}
                  placeholder="smtp.gmail.com"
                  id="smtp-host"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Encryption</label>
                <select
                  className="form-select"
                  value={smtpForm.smtp_encryption}
                  onChange={e => handleEncryptionChange(e.target.value)}
                  id="smtp-encryption"
                >
                  <option value="STARTTLS">STARTTLS (port 587)</option>
                  <option value="SSL/TLS">SSL / TLS (port 465)</option>
                  <option value="None">None (port 25)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  className="form-input"
                  value={smtpForm.smtp_user}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_user: e.target.value }))}
                  placeholder="alerts@example.com"
                  id="smtp-user"
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Port</label>
                <input
                  className="form-input"
                  type="number"
                  value={smtpForm.smtp_port}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_port: Number(e.target.value) }))}
                  style={{ width: 100 }}
                  id="smtp-port"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={smtpForm.smtp_password}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_password: e.target.value }))}
                  placeholder={settings?.smtp_configured ? '••••••••  (leave blank to keep current)' : 'Enter SMTP password'}
                  id="smtp-password"
                  autoComplete="current-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Sender Email (From)</label>
                <input
                  className="form-input"
                  type="email"
                  value={smtpForm.smtp_from_address}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_from_address: e.target.value }))}
                  placeholder="noreply@example.com"
                  id="smtp-from"
                />
              </div>
            </div>
          </div>

          {/* --- Email Template --- */}
          <div>
            <div className="section-divider-label">Email Template</div>
            <p className="text-muted" style={{ fontSize: '0.83rem', marginBottom: 12 }}>
              Customize the subject and body for attack notifications. Click a variable chip to insert it at the cursor.
            </p>

            {/* Subject */}
            <div className="form-group">
              <label className="form-label">Default Subject</label>
              <input
                ref={subjectRef as React.RefObject<HTMLInputElement>}
                className="form-input"
                value={smtpForm.smtp_default_subject}
                onChange={e => setSmtpForm(f => ({ ...f, smtp_default_subject: e.target.value }))}
                id="smtp-subject"
              />
              <TemplateVariableHelper
                textareaRef={subjectRef as any}
                onInsert={val => setSmtpForm(f => ({ ...f, smtp_default_subject: val }))}
                variables={NOTIFICATION_VARIABLES}
              />
            </div>

            {/* Body */}
            <div className="form-group">
              <label className="form-label">Default Body</label>
              <textarea
                ref={bodyRef as React.RefObject<HTMLTextAreaElement>}
                className="form-input"
                rows={12}
                value={smtpForm.smtp_default_body}
                onChange={e => setSmtpForm(f => ({ ...f, smtp_default_body: e.target.value }))}
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85rem' }}
                id="smtp-body"
              />
              <TemplateVariableHelper
                textareaRef={bodyRef as any}
                onInsert={val => setSmtpForm(f => ({ ...f, smtp_default_body: val }))}
                variables={NOTIFICATION_VARIABLES}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-12" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={smtpLoading} id="smtp-save-btn">
              {smtpLoading ? <span className="spinner" /> : '💾 Save SMTP Settings'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleTestSMTP}
              disabled={smtpTestLoading || !settings?.smtp_configured}
              title={!settings?.smtp_configured ? 'Save SMTP settings first' : 'Send a test email to the sender address'}
              id="smtp-test-btn"
            >
              {smtpTestLoading ? <span className="spinner" /> : '✉ Send Test Email'}
            </button>
          </div>
        </form>
      </div>

      {/* ACL Policies */}
      <div className="card mt-24">
        <div className="card-header">
          <div>
            <div className="card-title">ACL Policies</div>
            <div className="card-subtitle">Synced from Imperva. Edit descriptions for easier identification.</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleSyncACLs} disabled={aclSyncing}>
            {aclSyncing ? <span className="spinner" /> : '⟳'} Sync ACLs
          </button>
        </div>

        {aclPolicies.length === 0 ? (
          <div className="empty-state">
            <h3>No ACL policies</h3>
            <p>Click "Sync ACLs" to import policies from Imperva</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Policy ID</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Last Synced</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {aclPolicies.map(p => (
                  <tr key={p.id}>
                    <td><span className="text-mono">{p.id}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      {editingAcl === p.id ? (
                        <div className="flex gap-8">
                          <input
                            className="form-input"
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            placeholder="e.g., Block all traffic — used for non-paying customers"
                            style={{ flex: 1 }}
                            autoFocus
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveAclDesc(p.id)}>Save</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingAcl(null)}>Cancel</button>
                        </div>
                      ) : (
                        <span className="text-muted">{p.description || '—'}</span>
                      )}
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                      {formatDateTime(p.last_synced)}
                    </td>
                    <td>
                      {editingAcl !== p.id && (
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditingAcl(p.id); setEditDesc(p.description || ''); }}>
                          ✎ Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
