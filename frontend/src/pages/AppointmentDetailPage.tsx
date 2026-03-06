import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, XCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { buildMessage, type MsgType } from '../lib/whatsapp';
import toast from 'react-hot-toast';

interface Patient { id: number; name: string; phone: string; }
interface MessageLog { id: number; type: string; status: string; sentAt: string; twilioSid?: string; errorMessage?: string; }
interface Appointment {
    id: number; startTime: string; endTime: string; status: string;
    notes?: string; customMsg?: string; patient: Patient; messageLogs: MessageLog[];
}

export default function AppointmentDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [appt, setAppt] = useState<Appointment | null>(null);
    const [editing, setEditing] = useState(false);
    const [newTime, setNewTime] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const load = async () => {
        const { data, error } = await supabase.from('Appointment').select('*, patient:Patient(id, name, phone)').eq('id', id).single();
        if (error) {
            toast.error('Error loading appointment');
            return;
        }
        if (data) {
            setAppt(data as any);
            setNotes(data.notes || '');
        }
    };
    useEffect(() => { load(); }, [id]);

    const openWhatsApp = (phone: string, text: string, waWindow?: Window | null) => {
        if (!phone || !text) {
            if (waWindow) waWindow.close();
            return;
        }
        let cleanPhone = phone.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '27' + cleanPhone.substring(1);
        }
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const waUrl = isMobile
            ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
            : `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

        if (isMobile) {
            if (waWindow) waWindow.close();
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
    };

    const handleSave = async () => {
        const waWindow = window.open('', '_blank');
        setSaving(true);
        try {
            const updates = { startTime: newTime || appt?.startTime, notes, status: appt?.status };
            const { error } = await supabase.from('Appointment').update(updates).eq('id', id);
            if (error) throw error;

            toast.success('Appointment updated!');
            const practiceNameQuery = await supabase.from('Setting').select('practiceName').maybeSingle();
            const practiceName = practiceNameQuery.data?.practiceName || 'Dr. Roelof Retief';

            if (appt?.patient?.phone) {
                const msgText = buildMessage(appt.patient.name, updates.startTime as string, 'CHANGE', practiceName, updates.notes);
                openWhatsApp(appt.patient.phone, msgText, waWindow);
            } else if (waWindow) {
                waWindow.close();
            }
            setEditing(false);
            load();
        } catch (err: any) {
            try {
                if (waWindow && !waWindow.closed) {
                    waWindow.close();
                    if (!waWindow.closed) waWindow.document.write('<script>window.close()</script>');
                }
            } catch (ignore) { }
            toast.error(err.message || 'Error updating');
        } finally { setSaving(false); }
    };

    const handleCancel = async () => {
        if (!confirm('Cancel this appointment? You will be prompted to send a WhatsApp notification.')) return;
        const waWindow = window.open('', '_blank');
        try {
            const { error } = await supabase.from('Appointment').update({ status: 'CANCELLED' }).eq('id', id);
            if (error) throw error;
            toast.success('Appointment cancelled');

            const practiceNameQuery = await supabase.from('Setting').select('practiceName').maybeSingle();
            const practiceName = practiceNameQuery.data?.practiceName || 'Dr. Roelof Retief';

            if (appt?.patient?.phone && appt?.startTime) {
                const msgText = buildMessage(appt.patient.name, appt.startTime, 'CANCELLATION', practiceName);
                openWhatsApp(appt.patient.phone, msgText, waWindow);
            } else {
                try {
                    if (waWindow && !waWindow.closed) {
                        waWindow.close();
                        if (!waWindow.closed) waWindow.document.write('<script>window.close()</script>');
                    }
                } catch (ignore) { }
            }
            load();
        } catch {
            try {
                if (waWindow && !waWindow.closed) {
                    waWindow.close();
                    if (!waWindow.closed) waWindow.document.write('<script>window.close()</script>');
                }
            } catch (ignore) { }
        }
    };

    const handleComplete = async () => {
        await supabase.from('Appointment').update({ status: 'COMPLETED' }).eq('id', id);
        toast.success('Marked as completed');
        load();
    };

    const handleSendMsg = async (type: string) => {
        const waWindow = window.open('', '_blank');
        try {
            const practiceNameQuery = await supabase.from('Setting').select('practiceName').maybeSingle();
            const practiceName = practiceNameQuery.data?.practiceName || 'Dr. Roelof Retief';

            if (appt?.patient?.phone && appt?.startTime) {
                const msgText = buildMessage(appt.patient.name, appt.startTime, type as MsgType, practiceName, appt.customMsg);
                openWhatsApp(appt.patient.phone, msgText, waWindow);
            } else {
                try {
                    if (waWindow && !waWindow.closed) {
                        waWindow.close();
                        if (!waWindow.closed) waWindow.document.write('<script>window.close()</script>');
                    }
                } catch (ignore) { }
                toast.error('Could not generate message');
            }
        } catch {
            try {
                if (waWindow && !waWindow.closed) {
                    waWindow.close();
                    if (!waWindow.closed) waWindow.document.write('<script>window.close()</script>');
                }
            } catch (ignore) { }
            toast.error('Error generating message');
        }
    };

    if (!appt) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>;


    return (
        <div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/appointments')} style={{ marginBottom: '1rem' }}><ArrowLeft size={15} /> Back</button>

            <div className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '4px' }}>
                        <div className="avatar" style={{ width: 40, height: 40, fontSize: '1rem' }}>{appt.patient.name[0]}</div>
                        <h2 className="page-title" style={{ margin: 0 }}>{appt.patient.name}</h2>
                        <span className={`badge ${appt.status === 'SCHEDULED' ? 'badge-indigo' : appt.status === 'COMPLETED' ? 'badge-green' : 'badge-red'}`}>{appt.status}</span>
                    </div>
                    <p className="page-subtitle">{appt.patient.phone}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {appt.status === 'SCHEDULED' && !editing && <>
                        <button className="btn btn-secondary" onClick={() => {
                            setEditing(true);
                            const d = new Date(appt.startTime);
                            d.setMinutes(0, 0, 0); // Reset minutes and seconds to 0
                            setNewTime(new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16));
                        }}><RefreshCw size={15} /> Reschedule</button>
                        <button className="btn btn-secondary" onClick={() => handleSendMsg('CONFIRMATION')}><Send size={15} /> Send WA Confirmation</button>
                        <button className="btn btn-secondary" onClick={handleComplete}><CheckCircle size={15} /> Complete</button>
                        <button className="btn btn-danger" onClick={handleCancel}><XCircle size={15} /> Cancel</button>
                    </>}
                </div>
            </div>

            <div className="grid-cols-2">
                <div className="card">
                    <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 700 }}>Appointment Details</h3>
                    {editing ? (
                        <div>
                            <div className="form-group"><label className="form-label">New Date & Time</label>
                                <input className="form-input" type="datetime-local" value={newTime} onChange={e => setNewTime(e.target.value)} /></div>
                            <div className="form-group"><label className="form-label">Notes</label>
                                <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} /></div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save & Notify'}</button>
                                <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div><div className="form-label">Date</div><div style={{ fontWeight: 600 }}>{format(new Date(appt.startTime), 'EEEE, d MMMM yyyy')}</div></div>
                            <div><div className="form-label">Time</div><div style={{ fontWeight: 600 }}>{format(new Date(appt.startTime), 'HH:mm')} – {format(new Date(appt.endTime), 'HH:mm')} (60 min)</div></div>
                            {appt.notes && <div><div className="form-label">Notes</div><div style={{ fontWeight: 500 }}>{appt.notes}</div></div>}
                            {appt.customMsg && <div><div className="form-label">Custom WA Message</div><div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.875rem' }}>{appt.customMsg}</div></div>}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
