import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerAPI, prefixAPI } from '../services/api';
import { formatDate } from '../utils/date';

interface CustomerItem {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
}

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [custRes, prefRes] = await Promise.all([customerAPI.list(), prefixAPI.list()]);
      setCustomers(custRes.data);
      setPrefixes(prefRes.data);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    try {
      await customerAPI.create({ name: form.name, email: form.email || undefined });
      setForm({ name: '', email: '' });
      setShowCreate(false);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create customer');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete customer "${name}"? Prefixes will be unlinked but not deleted.`)) return;
    try {
      await customerAPI.delete(id);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const getCustomerPrefixCount = (customerId: number) =>
    prefixes.filter(p => p.customer_id === customerId).length;

  const getCustomerAttackCount = (customerId: number) =>
    prefixes.filter(p => p.customer_id === customerId && p.is_under_attack).length;

  if (loading) {
    return <div className="loading-center"><div className="spinner spinner-lg" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Manage customers and their prefix assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New Customer'}
        </button>
      </div>

      {error && <div className="alert-banner warning">⚠ {error}</div>}

      {showCreate && (
        <div className="card mb-24">
          <form onSubmit={handleCreate} className="flex gap-16 items-center" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Customer name" autoFocus />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-end' }}>Create</button>
          </form>
        </div>
      )}

      {customers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No customers yet</h3>
            <p>Create a customer and assign prefixes from the Dashboard</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Prefixes</th>
                <th>Under Attack</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => {
                const attackCount = getCustomerAttackCount(c.id);
                return (
                  <tr key={c.id}>
                    <td><Link to={`/customers/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link></td>
                    <td className="text-muted">{c.email || '—'}</td>
                    <td><span className="badge badge-neutral">{getCustomerPrefixCount(c.id)}</span></td>
                    <td>
                      {attackCount > 0 ? (
                        <span className="badge badge-danger">{attackCount} active</span>
                      ) : (
                        <span className="badge badge-success">None</span>
                      )}
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                      {formatDate(c.created_at)}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(c.id, c.name)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
