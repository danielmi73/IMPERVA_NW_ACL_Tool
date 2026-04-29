import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { prefixAPI, adminAPI } from '../services/api';
import AttackBadge from '../components/AttackBadge';
import { formatDateTime } from '../utils/date';

interface PrefixDetail {
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

interface AttackEvent {
  id: number;
  event_type: string;
  detected_at: string;
  resolved_at: string | null;
  acl_applied: boolean;
  acl_policy_id: string | null;
  peak_mbps: number | null;
}

interface ACLPolicy {
  id: string;
  name: string;
  description: string;
}

export default function Prefix() {
  const { id } = useParams<{ id: string }>();
  const [prefix, setPrefix] = useState<PrefixDetail | null>(null);
  const [events, setEvents] = useState<AttackEvent[]>([]);
  const [aclPolicies, setAclPolicies] = useState<ACLPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const prefixId = Number(id);

  useEffect(() => {
    loadData();
    adminAPI.getACLPolicies().then(res => setAclPolicies(res.data)).catch(() => {});
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prefixRes, historyRes] = await Promise.all([
        prefixAPI.get(prefixId),
        prefixAPI.attackHistory(prefixId),
      ]);
      setPrefix(prefixRes.data);
      setEvents(historyRes.data);
    } catch {
      setError('Failed to load prefix data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (updates: Record<string, any>) => {
    try {
      const { data } = await prefixAPI.update(prefixId, updates);
      setPrefix(data);
      setSuccess('Prefix updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update prefix');
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="spinner spinner-lg" /></div>;
  }

  if (!prefix) {
    return <div className="alert-banner danger">Prefix not found</div>;
  }

  const aclName = aclPolicies.find(a => a.id === prefix.acl_policy_id)?.name || prefix.acl_policy_id || '—';
  const totalAttacks = events.filter(e => e.event_type === 'DDOS_START_IP_RANGE').length;
  const activeAttacks = events.filter(e => e.event_type === 'DDOS_START_IP_RANGE' && !e.resolved_at).length;
  const maxPeak = events.reduce((max, e) => e.peak_mbps != null && e.peak_mbps > max ? e.peak_mbps : max, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-12">
            <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>← Dashboard</Link>
          </div>
          <h1 className="page-title mt-8" style={{ fontFamily: 'monospace' }}>{prefix.cidr}</h1>
          <p className="page-subtitle">{prefix.name || 'IP Prefix Detail'}</p>
        </div>
        <AttackBadge isUnderAttack={prefix.is_under_attack} />
      </div>

      {error && <div className="alert-banner danger">⚠ {error}</div>}
      {success && <div className="alert-banner success">✓ {success}</div>}

      {/* Stats row */}
      <div className="grid grid-3 mb-24">
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Total Attacks</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{totalAttacks}</div>
        </div>
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Currently Active</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: activeAttacks > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {activeAttacks > 0 ? `${activeAttacks} 🔴` : '0 ✅'}
          </div>
        </div>
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Peak Attack (Mbps)</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: maxPeak > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>
            {maxPeak > 0 ? maxPeak : '—'}
          </div>
        </div>
      </div>

      {/* Prefix settings */}
      <div className="card mb-24">
        <div className="card-header">
          <div className="card-title">Prefix Settings</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px 32px', alignItems: 'flex-end', padding: '4px 0' }}>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Asset ID</div>
            <div className="text-mono">{prefix.imperva_asset_id}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Assigned Customer</div>
            <div>
              {prefix.customer_id
                ? <Link to={`/customers/${prefix.customer_id}`} style={{ fontWeight: 600 }}>{prefix.customer_name}</Link>
                : <span className="text-muted">Unassigned</span>
              }
            </div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Last Seen</div>
            <div style={{ fontSize: '0.88rem' }}>{formatDateTime(prefix.last_seen)}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Attack Action</div>
            <select
              className="form-select"
              value={prefix.action_on_attack}
              onChange={e => handleUpdate({ action_on_attack: e.target.value })}
              style={{ minWidth: 120 }}
            >
              <option value="block">Block</option>
              <option value="pass">Pass</option>
            </select>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>ACL Policy</div>
            <select
              className="form-select"
              value={prefix.acl_policy_id || ''}
              onChange={e => handleUpdate({ acl_policy_id: e.target.value || null })}
              style={{ minWidth: 160 }}
            >
              <option value="">— Select —</option>
              {aclPolicies.map(acl => (
                <option key={acl.id} value={acl.id}>{acl.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Threshold (Mbps)</div>
            <input
              className="form-input"
              type="number"
              step="0.1"
              value={prefix.threshold_mbps ?? ''}
              onChange={e => handleUpdate({ threshold_mbps: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="—"
              style={{ width: 110 }}
            />
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>Threshold (Kpps)</div>
            <input
              className="form-input"
              type="number"
              step="0.1"
              value={prefix.threshold_kpps ?? ''}
              onChange={e => handleUpdate({ threshold_kpps: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="—"
              style={{ width: 110 }}
            />
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Notify Customer</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
              <input
                type="checkbox"
                checked={prefix.notify_customer}
                onChange={e => handleUpdate({ notify_customer: e.target.checked })}
              />
              <span style={{ fontSize: '0.88rem' }}>Send notifications</span>
            </label>
          </div>
          {prefix.is_under_attack && (
            <div>
              <div className="text-muted" style={{ fontSize: '0.78rem', marginBottom: 4 }}>Attack Started</div>
              <div style={{ fontSize: '0.88rem', color: 'var(--danger)', fontWeight: 600 }}>
                {formatDateTime(prefix.attack_started_at)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attack History */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Attack History</div>
          <span className="badge badge-neutral">{totalAttacks} events</span>
        </div>

        {events.length === 0 ? (
          <div className="empty-state">
            <h3>No attack history</h3>
            <p>Attack events will appear here once detected</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Detected</th>
                  <th>Resolved</th>
                  <th>ACL Applied</th>
                  <th>Peak (Mbps)</th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} className={e.event_type === 'DDOS_START_IP_RANGE' && !e.resolved_at ? 'row-attack' : ''}>
                    <td>
                      <span className={`badge ${e.event_type.includes('START') ? 'badge-danger' : 'badge-success'}`}>
                        {e.event_type.includes('START') ? '🔴 Start' : '🟢 Stop'}
                      </span>
                    </td>
                    <td>{formatDateTime(e.detected_at)}</td>
                    <td>
                      {e.resolved_at
                        ? formatDateTime(e.resolved_at)
                        : e.event_type.includes('START')
                          ? <span className="badge badge-danger">Ongoing</span>
                          : '—'
                      }
                    </td>
                    <td>{e.acl_applied ? <span className="badge badge-warning">Yes</span> : <span className="text-muted">No</span>}</td>
                    <td style={{ fontWeight: e.peak_mbps != null ? 600 : 400 }}>
                      {e.peak_mbps != null ? `${e.peak_mbps} Mbps` : '—'}
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
