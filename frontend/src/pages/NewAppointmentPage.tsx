import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildMessage } from '../lib/whatsapp';
import toast from 'react-hot-toast';

interface Patient { id: number; name: string; phone: string; }

export default function NewAppointmentPage() {
    const navigate = useNavigate();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [patientId, setPatientId] = useState('');
    const [patientMode, setPatientMode] = useState<'select' | 'create'>('select');
    const [newPatient, setNewPatient] = useState({ name: '', phone: '', email: '' });
    const [startTime, setStartTime] = useState(() => {
        const d = new Date();
        d.setHours(d.getHours() + 1, 0, 0, 0); // Next hour, 00 minutes
        // Format for datetime-local: YYYY-MM-DDThh:mm
        return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    });
    const [notes, setNotes] = useState('');
    const [customMsg, setCustomMsg] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        supabase.from('Patient').select('*').order('name').then(r => {
            if (r.data) setPatients(r.data as any);
        });
    }, []);

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

        const waWindow = window.open('', '_blank');
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
                if (waWindow) waWindow.close();
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

            const { data: appt, error: apptError } = await supabase.from('Appointment')
                .insert([{ patientId: Number(targetPatientId), startTime: start.toISOString(), endTime: end.toISOString(), notes, customMsg }])
                .select().single();
            if (apptError) throw apptError;

            toast.success('Appointment created!');

            const practiceNameQuery = await supabase.from('Setting').select('practiceName').maybeSingle();
            const practiceName = practiceNameQuery.data?.practiceName || 'Dr. Roelof Retief';
            const msgText = buildMessage(targetPatientName, start.toISOString(), 'CONFIRMATION', practiceName, customMsg);

            if (msgText && targetPatientPhone) {
                let cleanPhone = targetPatientPhone.replace(/[^0-9]/g, '');
                if (cleanPhone.startsWith('0')) {
                    cleanPhone = '27' + cleanPhone.substring(1);
                }
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const waUrl = isMobile
                    ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(msgText)}`
                    : `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgText)}`;

                if (isMobile) {
                    if (waWindow) waWindow.close();
                    // On iOS Safari PWAs, setting window.location.href directly can sometimes record in the history stack,
                    // causing the "Back to App" button to try and reload the whatsapp:// scheme inside the PWA view.
                    // Instead, we create a hidden anchor link and fake a click.
                    const a = document.createElement('a');
                    a.href = waUrl;
                    a.target = '_top';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else {
                    if (waWindow) {
                        waWindow.location.href = waUrl;
                    } else {
                        window.open(waUrl, '_blank') || (window.location.href = waUrl);
                    }
                }
            } else if (waWindow) {
                waWindow.close();
            }

            navigate(`/appointments/${appt.id}`);
        } catch (err: any) {
            try {
                if (waWindow && !waWindow.closed) {
                    waWindow.close();
                    if (!waWindow.closed) waWindow.document.write('<script>window.close()</script>');
                }
            } catch (ignore) { }
            toast.error(err.message || 'Error creating appointment');
        } finally { setSaving(false); }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/appointments')} style={{ marginBottom: '0.5rem' }}><ArrowLeft size={15} /> Back</button>
                    <h2 className="page-title">New Appointment</h2>
                    <p className="page-subtitle">Select a client and time slot — you will be prompted to send a WhatsApp confirmation.</p>
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
                            <select className="form-select" value={patientId} onChange={e => setPatientId(e.target.value)} required>
                                <option value="">Select an existing client…</option>
                                {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.phone})</option>)}
                            </select>
                        ) : (
                            <div style={{ background: 'var(--bg-hover)', padding: '1rem', borderRadius: 6, border: '1px dashed var(--border-color)' }}>
                                <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: '1rem', justifyContent: 'center' }} onClick={handleSelectContact}>
                                    <Phone size={16} /> Choose from Contacts
                                </button>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}><input id="new-patient-name" className="form-input" placeholder="Full Name *" name="name" autoComplete="name" value={newPatient.name || ''} onChange={e => setNewPatient(p => ({ ...p, name: e.target.value }))} required /></div>
                                <div className="form-group" style={{ marginBottom: '0.75rem' }}><input id="new-patient-phone" type="tel" className="form-input" placeholder="Phone (E.164 e.g. +27821234567) *" name="phone" autoComplete="tel" value={newPatient.phone || ''} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} required /></div>
                                <div className="form-group" style={{ marginBottom: 0 }}><input id="new-patient-email" className="form-input" type="email" placeholder="Email (optional)" name="email" autoComplete="email" value={newPatient.email || ''} onChange={e => setNewPatient(p => ({ ...p, email: e.target.value }))} /></div>
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label">Date & Start Time *</label>
                        <input className="form-input" type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Session will run for 60 minutes</span>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Notes (practitioner only — not sent to client)</label>
                        <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Session topic, referral, etc." />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Custom message to include in WhatsApp confirmation (optional)</label>
                        <textarea className="form-textarea" value={customMsg} onChange={e => setCustomMsg(e.target.value)} placeholder="e.g. Please remember to bring your intake form." style={{ minHeight: 60 }} />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/appointments')}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Creating…' : '✓ Create Appointment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
