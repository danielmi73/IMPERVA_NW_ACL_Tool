import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { customerAPI, prefixAPI, adminAPI } from '../services/api';
import AttackBadge from '../components/AttackBadge';
import { formatDateTime } from '../utils/date';
import TemplateVariableHelper, { NOTIFICATION_VARIABLES } from '../components/TemplateVariableHelper';

interface CustomerDetail {
  id: number;
  name: string;
  email: string | null;
  custom_message: string | null;
  prefixes: PrefixInfo[];
}

interface PrefixInfo {
  id: number;
  cidr: string;
  name: string | null;
  is_under_attack: boolean;
  action_on_attack: string;
  acl_policy_id: string | null;
  threshold_mbps: number | null;
  threshold_kpps: number | null;
  notify_customer: boolean;
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

export default function Customer() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [attackHistory, setAttackHistory] = useState<Record<number, AttackEvent[]>>({});
  const [aclPolicies, setAclPolicies] = useState<ACLPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', custom_message: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const customerId = Number(id);
  const customMsgRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadCustomer();
    adminAPI.getACLPolicies().then(res => setAclPolicies(res.data)).catch(() => {});
  }, [id]);

  const loadCustomer = async () => {
    try {
      const { data } = await customerAPI.get(customerId);
      setCustomer(data);
      setForm({ name: data.name, email: data.email || '', custom_message: data.custom_message || '' });
      // Load attack history for each prefix
      const historyMap: Record<number, AttackEvent[]> = {};
      for (const p of data.prefixes) {
        try {
          const res = await prefixAPI.attackHistory(p.id);
          historyMap[p.id] = res.data;
        } catch { /* ignore */ }
      }
      setAttackHistory(historyMap);
    } catch (err: any) {
      setError('Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const { data } = await customerAPI.update(customerId, form);
      setCustomer(data);
      setEditing(false);
      setSuccess('Customer updated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update');
    }
  };

  const handlePrefixUpdate = async (prefixId: number, updates: Record<string, any>) => {
    try {
      await prefixAPI.update(prefixId, updates);
      await loadCustomer();
    } catch (err: any) {
      setError('Failed to update prefix');
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="spinner spinner-lg" /></div>;
  }

  if (!customer) {
    return <div className="alert-banner danger">Customer not found</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-12">
            <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>← Dashboard</Link>
          </div>
          <h1 className="page-title mt-8">{customer.name}</h1>
          <p className="page-subtitle">{customer.email || 'No email configured'}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setEditing(!editing)}>
          {editing ? 'Cancel' : '✎ Edit'}
        </button>
      </div>

      {error && <div className="alert-banner danger">⚠ {error}</div>}
      {success && <div className="alert-banner success">✓ {success}</div>}

      {/* Edit form */}
      {editing && (
        <div className="card mb-24">
          <div className="card-title" style={{ marginBottom: 16 }}>Edit Customer</div>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="customer@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Custom Message</label>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
              Appended inside the global notification email template at <code style={{ fontSize: '0.8rem' }}>{`{{custom_message}}`}</code>.
              Supports template variables. Leave blank to omit this section.
            </p>
            <textarea
              ref={customMsgRef}
              className="form-input"
              rows={4}
              value={form.custom_message}
              onChange={e => setForm({ ...form, custom_message: e.target.value })}
              placeholder="e.g. Your service is currently under a volumetric DDoS attack targeting {{prefix}}. Our systems have automatically applied mitigation via {{acl_name}}."
              style={{ resize: 'vertical' }}
              id="customer-custom-message"
            />
            <TemplateVariableHelper
              textareaRef={customMsgRef as any}
              onInsert={val => setForm(f => ({ ...f, custom_message: val }))}
              variables={NOTIFICATION_VARIABLES}
            />
            {/* Inline preview */}
            {form.custom_message.trim() && (
              <div className="custom-msg-preview">
                <div className="custom-msg-preview-label">Preview (with sample values)</div>
                <div className="custom-msg-preview-body">
                  {form.custom_message
                    .replace(/\{\{event_type\}\}/g,     'Attack Started')
                    .replace(/\{\{prefix\}\}/g,         '203.0.113.0/24')
                    .replace(/\{\{acl_name\}\}/g,       'Block All Traffic')
                    .replace(/\{\{acl_id\}\}/g,         '12345')
                    .replace(/\{\{customer_name\}\}/g,  form.name || 'Customer')
                    .replace(/\{\{detected_at\}\}/g,    '2026-05-24 21:00 UTC')
                    .replace(/\{\{peak_mbps\}\}/g,      '4820.5')
                    .replace(/\{\{threshold_mbps\}\}/g, '1000.0')
                  }
                </div>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      )}

      {/* Prefixes */}
      <div className="card mb-24">
        <div className="card-header">
          <div className="card-title">Assigned Prefixes ({customer.prefixes.length})</div>
        </div>

        {customer.prefixes.length === 0 ? (
          <div className="empty-state">
            <h3>No prefixes assigned</h3>
            <p>Assign prefixes to this customer from the Dashboard</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Prefix</th>
                  <th>Status</th>
                  <th>Action</th>
                  <th>ACL Policy</th>
                  <th>Threshold (Mbps)</th>
                  <th>Threshold (Kpps)</th>
                </tr>
              </thead>
              <tbody>
                {customer.prefixes.map(p => (
                  <tr key={p.id} className={p.is_under_attack ? 'row-attack' : ''}>
                    <td><span className="text-mono">{p.cidr}</span></td>
                    <td><AttackBadge isUnderAttack={p.is_under_attack} /></td>
                    <td>
                      <select
                        className="form-select"
                        value={p.action_on_attack}
                        onChange={e => handlePrefixUpdate(p.id, { action_on_attack: e.target.value })}
                      >
                        <option value="block">Block</option>
                        <option value="pass">Pass</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="form-select"
                        value={p.acl_policy_id || ''}
                        onChange={e => handlePrefixUpdate(p.id, { acl_policy_id: e.target.value || null })}
                        style={{ minWidth: 140 }}
                      >
                        <option value="">— Select —</option>
                        {aclPolicies.map(acl => (
                          <option key={acl.id} value={acl.id}>{acl.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        value={p.threshold_mbps ?? ''}
                        onChange={e => handlePrefixUpdate(p.id, { threshold_mbps: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="—"
                        style={{ width: 100 }}
                      />
                    </td>
                    <td>
                      <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        value={p.threshold_kpps ?? ''}
                        onChange={e => handlePrefixUpdate(p.id, { threshold_kpps: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="—"
                        style={{ width: 100 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attack History */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Attack History</div>
        </div>
        {customer.prefixes.map(p => {
          const events = attackHistory[p.id] || [];
          if (events.length === 0) return null;
          return (
            <div key={p.id} style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                <span className="text-mono">{p.cidr}</span>
              </div>
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
                      <tr key={e.id}>
                        <td>
                          <span className={`badge ${e.event_type.includes('START') ? 'badge-danger' : 'badge-success'}`}>
                            {e.event_type.includes('START') ? '🔴 Start' : '🟢 Stop'}
                          </span>
                        </td>
                        <td>{formatDateTime(e.detected_at)}</td>
                        <td>{formatDateTime(e.resolved_at)}</td>
                        <td>{e.acl_applied ? <span className="badge badge-warning">Yes</span> : 'No'}</td>
                        <td>{e.peak_mbps != null ? `${e.peak_mbps}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {Object.values(attackHistory).every(v => v.length === 0) && (
          <div className="empty-state">
            <h3>No attack history</h3>
            <p>Attack events will appear here once detected</p>
          </div>
        )}
      </div>
    </div>
  );
}
