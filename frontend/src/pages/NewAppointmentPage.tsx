import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildMessage } from '../lib/whatsapp';
import toast from 'react-hot-toast';

interface Patient { id: number; name: string; phone: string; }

export default function NewAppointmentPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [patientId, setPatientId] = useState('');
    const [patientSearch, setPatientSearch] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [patientMode, setPatientMode] = useState<'select' | 'create'>('select');
    const [newPatient, setNewPatient] = useState({ name: '', phone: '', email: '' });
    const [startTime, setStartTime] = useState(() => {
        if (location.state?.start) {
            const d = new Date(location.state.start);
            return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        }
        const d = new Date();
        d.setHours(d.getHours() + 1, 0, 0, 0); // Next hour, 00 minutes
        // Format for datetime-local: YYYY-MM-DDThh:mm
        return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        supabase.from('Patient').select('*').order('name').then(r => {
            if (r.data) setPatients(r.data as any);
        });
    }, []);

    const filteredPatients = patients.filter(p => 
        p.name.toLowerCase().includes(patientSearch.toLowerCase()) || 
        p.phone.includes(patientSearch)
    );

    const handleSelectPatient = (p: Patient) => {
        setPatientId(String(p.id));
        setPatientSearch(p.name);
        setDropdownOpen(false);
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

                const cleanPhone = phone.replace(/[^\d+]/g, '');

                setNewPatient({ name, phone: cleanPhone, email });
                toast.success('Contact info imported!');
            }
        } catch (err: any) {
            console.error('Contact picker error:', err);
            toast.error('Could not access contacts. Note: This feature only works on supported mobile browsers.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let targetPatientName = '';
        let targetPatientId = patientId;
        let targetPatientPhone = '';

        if (patientMode === 'create') {
            if (!newPatient.name || !newPatient.phone) return toast.error('Please enter client name and phone');
            targetPatientName = newPatient.name;
            targetPatientPhone = newPatient.phone;
        } else {
            if (!patientId) return toast.error('Please select a client');
            const pt = patients.find(p => String(p.id) === patientId);
            if (pt) {
                targetPatientName = pt.name;
                targetPatientPhone = pt.phone;
            }
        }

        if (!startTime) return toast.error('Please select a date/time');
        setSaving(true);
        try {
            const start = new Date(startTime);
            const end = new Date(start.getTime() + 60 * 60 * 1000); // 60 min session

            // Check double booking
            const { data: conflict } = await supabase.from('Appointment')
                .select('id, startTime, patient:Patient(name)')
                .eq('status', 'SCHEDULED')
                .lt('startTime', end.toISOString())
                .gt('endTime', start.toISOString())
                .maybeSingle();

            if (conflict) {
                const timeStr = new Date(conflict.startTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
                setSaving(false);
                return toast.error(`Time unavailable. slot conflicts with ${(conflict.patient as any)?.name} at ${timeStr}.`);
            }

            if (patientMode === 'create') {
                const { data: created, error: ptError } = await supabase.from('Patient')
                    .insert([{ ...newPatient, consentWhatsApp: true }])
                    .select().single();
                if (ptError) throw ptError;
                targetPatientId = String(created.id);
            }

            const { error: apptError } = await supabase.from('Appointment')
                .insert([{ patientId: Number(targetPatientId), startTime: start.toISOString(), endTime: end.toISOString() }])
                .select().single();
            if (apptError) throw apptError;

            const practiceNameQuery = await supabase.from('Setting').select('practiceName').maybeSingle();
            const practiceName = practiceNameQuery.data?.practiceName || 'Roelof Retief';
            const msgText = buildMessage(targetPatientName, start.toISOString(), 'CONFIRMATION', practiceName, '');

            if (msgText && targetPatientPhone) {
                let cleanPhone = targetPatientPhone.replace(/[^0-9]/g, '');
                if (cleanPhone.startsWith('0')) {
                    cleanPhone = '27' + cleanPhone.substring(1);
                } else if (cleanPhone.length === 9) {
                    cleanPhone = '27' + cleanPhone;
                }
                
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const waUrl = isMobile
                    ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(msgText)}`
                    : `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgText)}`;
                
                toast.custom((t) => (
                    <div className="card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--accent)' }}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Appointment Saved!</h4>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Send confirmation message to {targetPatientName}?</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <a href={waUrl} target="_self" className="btn btn-primary btn-sm" onClick={() => toast.dismiss(t.id)}>Open WhatsApp</a>
                            <button className="btn btn-secondary btn-sm" onClick={() => toast.dismiss(t.id)}>Skip</button>
                        </div>
                    </div>
                ), { duration: 10000 });
            } else {
                toast.success('Appointment created!');
            }

            // Route back to the calendar day view for the booked date
            navigate('/appointments', { state: { date: start.toISOString(), view: 'day' } });

        } catch (err: any) {
            toast.error(err.message || 'Error creating appointment');
        } finally { setSaving(false); }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/appointments', { state: { date: new Date(startTime).toISOString(), view: 'day' } })} style={{ marginBottom: '0.5rem' }}><ArrowLeft size={15} /> Back</button>
                    <h2 className="page-title">New Appointment</h2>
                    <p className="page-subtitle">Select a client and time slot.</p>
                </div>
            </div>

            <div className="card" style={{ maxWidth: 520 }}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Client *</span>
                            {patientMode === 'select' ? (
                                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => setPatientMode('create')}>+ New Client</button>
                            ) : (
                                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', fontWeight: 600, color: 'var(--text-muted)' }} onClick={() => setPatientMode('select')}>Cancel New Client</button>
                            )}
                        </label>

                        {patientMode === 'select' ? (
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="text"
                                    className="form-input form-input-lg" 
                                    placeholder="Search for an existing client…" 
                                    value={patientSearch}
                                    onChange={e => {
                                        setPatientSearch(e.target.value);
                                        setDropdownOpen(true);
                                        if (patientId) setPatientId(''); 
                                    }}
                                    onFocus={() => setDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
                                    autoComplete="off"
                                />
                                {dropdownOpen && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0, right: 0,
                                        zIndex: 10,
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0 0 6px 6px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                                    }}>
                                        {filteredPatients.length > 0 ? (
                                            filteredPatients.map(p => (
                                                <div 
                                                    key={p.id}
                                                    style={{
                                                        padding: '0.75rem 1rem',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid var(--border-color)',
                                                        background: patientId === String(p.id) ? 'var(--bg-hover)' : 'transparent'
                                                    }}
                                                    onClick={() => handleSelectPatient(p)}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = patientId === String(p.id) ? 'var(--bg-hover)' : 'transparent'}
                                                >
                                                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.phone}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>
                                                No clients found.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ background: 'var(--bg-hover)', padding: '1rem', borderRadius: 6, border: '1px dashed var(--border-color)' }}>
                                <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: '1rem', justifyContent: 'center' }} onClick={handleSelectContact}>
                                    <Phone size={16} /> Choose from Contacts
                                </button>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}><input id="new-patient-name" className="form-input form-input-lg" placeholder="Full Name *" name="name" autoComplete="name" value={newPatient.name || ''} onChange={e => setNewPatient(p => ({ ...p, name: e.target.value }))} required /></div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}><input id="new-patient-phone" type="tel" className="form-input form-input-lg" placeholder="Phone (E.164 e.g. +27821234567) *" name="phone" autoComplete="tel" value={newPatient.phone || ''} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} required /></div>
                                <div className="form-group" style={{ marginBottom: 0 }}><input id="new-patient-email" className="form-input form-input-lg" type="email" placeholder="Email (optional)" name="email" autoComplete="email" value={newPatient.email || ''} onChange={e => setNewPatient(p => ({ ...p, email: e.target.value }))} /></div>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.9rem' }}>Date & Start Time *</label>
                        <input className="form-input form-input-lg" type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Session will run for 60 minutes</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/appointments', { state: { date: new Date(startTime).toISOString(), view: 'day' } })}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Creating…' : '✓ Create Appointment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
