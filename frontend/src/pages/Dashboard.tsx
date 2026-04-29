import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { prefixAPI, adminAPI, customerAPI } from '../services/api';
import AttackBadge from '../components/AttackBadge';
import { formatTime } from '../utils/date';

interface Prefix {
  id: number;
  imperva_asset_id: string;
  cidr: string;
  name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  threshold_mbps: number | null;
  threshold_kpps: number | null;
  acl_policy_id: string | null;
  action_on_attack: string;
  notify_customer: boolean;
  is_under_attack: boolean;
  attack_started_at: string | null;
  last_seen: string | null;
}

interface ACLPolicy {
  id: string;
  name: string;
  description: string;
}

interface Customer {
  id: number;
  name: string;
}

interface AdminSettings {
  api_key_expired: boolean;
  last_api_check: string | null;
  poll_interval_seconds: number;
}

export default function Dashboard() {
  const [prefixes, setPrefixes] = useState<Prefix[]>([]);
  const [aclPolicies, setAclPolicies] = useState<ACLPolicy[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [prefixRes, aclRes, settingsRes, customerRes] = await Promise.all([
        prefixAPI.list(),
        adminAPI.getACLPolicies(),
        adminAPI.getSettings(),
        customerAPI.list(),
      ]);
      setPrefixes(prefixRes.data);
      setAclPolicies(aclRes.data);
      setSettings(settingsRes.data);
      setCustomers(customerRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await prefixAPI.sync();
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleACLChange = async (prefixId: number, aclPolicyId: string) => {
    try {
      await prefixAPI.update(prefixId, { acl_policy_id: aclPolicyId || null });
      setPrefixes(prev => prev.map(p => p.id === prefixId ? { ...p, acl_policy_id: aclPolicyId || null } : p));
    } catch (err: any) {
      setError('Failed to update ACL');
    }
  };

  const handleCustomerChange = async (prefixId: number, customerIdStr: string) => {
    try {
      const customer_id = customerIdStr ? parseInt(customerIdStr, 10) : null;
      await prefixAPI.update(prefixId, { customer_id });
      // Find customer name for local state update
      const selectedCustomer = customers.find(c => c.id === customer_id);
      setPrefixes(prev => prev.map(p => 
        p.id === prefixId ? { ...p, customer_id, customer_name: selectedCustomer ? selectedCustomer.name : null } : p
      ));
    } catch (err: any) {
      setError('Failed to update customer assignment');
    }
  };

  const handleActionChange = async (prefixId: number, action: string) => {
    try {
      await prefixAPI.update(prefixId, { action_on_attack: action });
      setPrefixes(prev => prev.map(p => p.id === prefixId ? { ...p, action_on_attack: action } : p));
    } catch (err: any) {
      setError('Failed to update action');
    }
  };

  const handleNotifyToggle = async (prefixId: number, current: boolean) => {
    try {
      await prefixAPI.update(prefixId, { notify_customer: !current });
      setPrefixes(prev => prev.map(p => p.id === prefixId ? { ...p, notify_customer: !current } : p));
    } catch (err: any) {
      setError('Failed to update notification');
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="spinner spinner-lg" /></div>;
  }

  const attackCount = prefixes.filter(p => p.is_under_attack).length;
  const blockedCount = prefixes.filter(p => p.action_on_attack === 'block').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Monitor all protected prefixes and their DDoS status
          </p>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? <span className="spinner" /> : '⟳'} Sync from Imperva
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {settings?.api_key_expired && (
        <div className="alert-banner danger">
          ⚠ API key is expired or invalid — attack monitoring is paused.
          <Link to="/admin" style={{ marginLeft: 8 }}>Update credentials →</Link>
        </div>
      )}

      {attackCount > 0 && (
        <div className="alert-banner danger">
          🔴 {attackCount} prefix{attackCount > 1 ? 'es' : ''} currently under DDoS attack
        </div>
      )}

      {error && <div className="alert-banner warning">⚠ {error}</div>}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Prefixes</div>
          <div className="stat-value cyan">{prefixes.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Under Attack</div>
          <div className={`stat-value ${attackCount > 0 ? 'danger' : 'success'}`}>{attackCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auto-Block Enabled</div>
          <div className="stat-value accent">{blockedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Check</div>
          <div className="stat-value" style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            {settings?.last_api_check 
              ? formatTime(settings.last_api_check)
              : 'Never'}
          </div>
        </div>
      </div>

      {/* Prefix Table */}
      {prefixes.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No prefixes found</h3>
            <p>Click "Sync from Imperva" to import your protected IP ranges</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Prefix Range</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Action on Attack</th>
                <th>Notify</th>
                <th>ACL Policy</th>
                <th>Thresholds</th>
              </tr>
            </thead>
            <tbody>
              {prefixes.map(p => (
                <tr key={p.id} className={p.is_under_attack ? 'row-attack' : ''}>
                  <td>
                    <Link to={`/prefixes/${p.id}`} className="text-mono" style={{ fontWeight: 600 }}>{p.cidr}</Link>
                    {p.name && <div className="text-muted" style={{ fontSize: '0.78rem' }}>{p.name}</div>}
                  </td>
                  <td>
                    <div className="flex gap-4 items-center">
                      <select
                        className="form-select"
                        value={p.customer_id || ''}
                        onChange={(e) => handleCustomerChange(p.id, e.target.value)}
                        style={{ minWidth: 120 }}
                      >
                        <option value="">Unassigned</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {p.customer_id && (
                        <Link to={`/customers/${p.customer_id}`} className="text-muted" title="View Customer">
                          ↗
                        </Link>
                      )}
                    </div>
                  </td>
                  <td>
                    <AttackBadge isUnderAttack={p.is_under_attack} since={p.attack_started_at} />
                  </td>
                  <td>
                    <select
                      className="form-select"
                      value={p.action_on_attack}
                      onChange={(e) => handleActionChange(p.id, e.target.value)}
                      style={{ minWidth: 90 }}
                    >
                      <option value="block">Block</option>
                      <option value="pass">Pass</option>
                    </select>
                  </td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={p.notify_customer}
                        onChange={() => handleNotifyToggle(p.id, p.notify_customer)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td>
                    <select
                      className="form-select"
                      value={p.acl_policy_id || ''}
                      onChange={(e) => handleACLChange(p.id, e.target.value)}
                      style={{ minWidth: 140 }}
                    >
                      <option value="">— Select ACL —</option>
                      {aclPolicies.map(acl => (
                        <option key={acl.id} value={acl.id}>
                          {acl.name}{acl.description ? ` — ${acl.description}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                      {p.threshold_mbps != null ? `${p.threshold_mbps} Mbps` : '—'}
                      {p.threshold_kpps != null ? ` / ${p.threshold_kpps} Kpps` : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
