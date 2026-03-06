import { useEffect, useState } from 'react';
import { Search, Plus, Phone, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

interface Patient { id: number; name: string; phone: string; email?: string; notes?: string; consentWhatsApp: boolean; optedOut: boolean; }

const EMPTY: Partial<Patient> = { name: '', phone: '', email: '', notes: '', consentWhatsApp: true, optedOut: false };

export default function PatientsPage() {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<Partial<Patient>>(EMPTY);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        const { data, error } = await supabase.from('Patient').select('*').order('name');
        if (data) setPatients(data as any);
        if (error) toast.error('Error loading patients');
    };
    useEffect(() => { load(); }, []);

    const filtered = patients.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search));

    const openNew = () => { setEditing(EMPTY); setModal(true); };
    const openEdit = (p: Patient) => { setEditing(p); setModal(true); };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing.id) {
                const { error } = await supabase.from('Patient').update(editing).eq('id', editing.id);
                if (error) throw error;
                toast.success('Client updated');
            } else {
                const { error } = await supabase.from('Patient').insert([editing]);
                if (error) throw error;
                toast.success('Client added');
            }
            setModal(false);
            load();
        } catch (err: any) {
            toast.error(err.message || 'Error saving client');
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this client? This cannot be undone.')) return;
        try {
            const { error } = await supabase.from('Patient').delete().eq('id', id);
            if (error) throw error;
            toast.success('Client deleted');
            load();
        } catch (err: any) {
            toast.error(err.message || 'Error deleting client');
        }
    };

    const handleSelectContact = async () => {
        try {
            const opts = { multiple: false };
            const contacts = await (navigator as any).contacts.select(['name', 'tel', 'email'], opts);
            if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                const name = contact.name?.[0] || '';
                const phone = contact.tel?.[0] || '';
                const email = contact.email?.[0] || '';

                // Keep only the digits and the + sign
                const cleanPhone = phone.replace(/[^\d+]/g, '');

                setEditing(p => ({ ...p, name, phone: cleanPhone, email }));
                toast.success('Contact info imported!');
            }
        } catch (err: any) {
            console.error('Contact picker error:', err);
            toast.error('Could not access contacts. Note: This feature only works on supported mobile browsers.');
        }
    };


    return (
        <div>
            <div className="page-header">
                <div><h2 className="page-title">Clients</h2><p className="page-subtitle">{patients.length} clients total</p></div>
                <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Client</button>
            </div>

            <div className="card">
                <div className="search-wrap" style={{ marginBottom: '1rem' }}>
                    <Search size={15} />
                    <input className="form-input search-input" placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Client</th><th>Phone</th><th>Email</th><th>WhatsApp</th><th>Status</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No clients found</td></tr>
                            ) : filtered.map(p => (
                                <tr key={p.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                            <div className="avatar">{p.name[0]}</div>
                                            <div><div style={{ fontWeight: 600 }}>{p.name}</div></div>
                                        </div>
                                    </td>
                                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={13} style={{ color: 'var(--text-muted)' }} />{p.phone}</div></td>
                                    <td><span className="text-muted">{p.email || '—'}</span></td>
                                    <td><span className={`badge ${p.consentWhatsApp ? 'badge-green' : 'badge-gray'}`}>{p.consentWhatsApp ? 'Consented' : 'No consent'}</span></td>
                                    <td><span className={`badge ${p.optedOut ? 'badge-red' : 'badge-green'}`}>{p.optedOut ? 'Opted out' : 'Active'}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(p)}><Pencil size={14} /></button>
                                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(p.id)}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 className="modal-title">{editing.id ? 'Edit Client' : 'Add Client'}</h3>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '0.25rem' }} onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            {!editing.id && (
                                <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: '1rem', justifyContent: 'center' }} onClick={handleSelectContact}>
                                    <Phone size={16} /> Choose from Contacts
                                </button>
                            )}
                            <div className="form-group"><label className="form-label" htmlFor="patient-name">Full Name *</label><input id="patient-name" className="form-input" name="name" autoComplete="name" value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} required /></div>
                            <div className="form-group"><label className="form-label" htmlFor="patient-phone">Phone (E.164 format e.g. +27821234567) *</label><input id="patient-phone" type="tel" className="form-input" name="phone" autoComplete="tel" value={editing.phone || ''} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="+27821234567" required /></div>
                            <div className="form-group"><label className="form-label">Email (optional)</label><input className="form-input" type="email" name="email" autoComplete="email" value={editing.email || ''} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} /></div>
                            <div className="form-group"><label className="form-label">Notes (practitioner only)</label><textarea className="form-textarea" value={editing.notes || ''} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} /></div>
                            <label className="form-checkbox" style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 6, marginBottom: '0.5rem' }}>
                                <input type="checkbox" checked={editing.consentWhatsApp || false} onChange={e => setEditing(p => ({ ...p, consentWhatsApp: e.target.checked }))} />
                                <div>
                                    <div style={{ fontWeight: 500 }}>WhatsApp Consent</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Client consents to WhatsApp messages</div>
                                </div>
                            </label>
                            {editing.id && (
                                <label className="form-checkbox" style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 6, opacity: editing.consentWhatsApp ? 1 : 0.6 }}>
                                    <input type="checkbox" checked={editing.optedOut || false} onChange={e => setEditing(p => ({ ...p, optedOut: e.target.checked }))} disabled={!editing.consentWhatsApp} />
                                    <div>
                                        <div style={{ fontWeight: 500 }}>Opted Out</div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Client has opted out</div>
                                    </div>
                                </label>
                            )}
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Client'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
