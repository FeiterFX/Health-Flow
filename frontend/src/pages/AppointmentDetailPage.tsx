import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, XCircle, CheckCircle, RefreshCw, Camera, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { buildMessage, type MsgType } from '../lib/whatsapp';
import toast from 'react-hot-toast';
import ClientDocumentsModal from '../components/ClientDocumentsModal';

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
    const [practiceName, setPracticeName] = useState('Roelof Retief');
    const [docsModalOpen, setDocsModalOpen] = useState(false);

    const load = async () => {
        const [{ data, error }, { data: pData }] = await Promise.all([
            supabase.from('Appointment').select('*, patient:Patient(id, name, phone)').eq('id', id).single(),
            supabase.from('Setting').select('practiceName').maybeSingle()
        ]);
        if (error) {
            toast.error('Error loading appointment');
            return;
        }
        if (data) {
            setAppt(data as any);
            setNotes(data.notes || '');
        }
        if (pData?.practiceName) setPracticeName(pData.practiceName);
    };
    useEffect(() => { load(); }, [id]);

    const openWhatsApp = (phone: string, text: string) => {
        if (!phone || !text) return;

        let cleanPhone = phone.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '27' + cleanPhone.substring(1);
        } else if (cleanPhone.length === 9) {
            cleanPhone = '27' + cleanPhone;
        }

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const waUrl = isMobile
            ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
            : `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
        window.location.href = waUrl;
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updates = { startTime: newTime || appt?.startTime, notes, status: appt?.status };
            const { error } = await supabase.from('Appointment').update(updates).eq('id', id);
            if (error) throw error;

            toast.success('Appointment updated!');

            if (appt?.patient?.phone) {
                const msgText = buildMessage(appt.patient.name, updates.startTime as string, 'CHANGE', practiceName, updates.notes);
                let cleanPhone = appt.patient.phone.replace(/[^0-9]/g, '');
                if (cleanPhone.startsWith('0')) cleanPhone = '27' + cleanPhone.substring(1);
                else if (cleanPhone.length === 9) cleanPhone = '27' + cleanPhone;

                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const waUrl = isMobile ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(msgText)}` : `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgText)}`;

                toast.custom((t) => (
                    <div className="card" style={{ padding: '1rem', background: 'var(--bg-card)', border: '1px solid var(--accent)' }}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Updated Successfully</h4>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Notify {appt.patient.name} about this change?</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <a href={waUrl} target="_self" className="btn btn-primary btn-sm" onClick={() => toast.dismiss(t.id)}>Open WhatsApp</a>
                            <button className="btn btn-secondary btn-sm" onClick={() => toast.dismiss(t.id)}>Skip</button>
                        </div>
                    </div>
                ), { duration: 10000 });
            }
            setEditing(false);
            load();
        } catch (err: any) {
            toast.error(err.message || 'Error updating');
        } finally { setSaving(false); }
    };

    const handleCancel = async () => {
        if (!confirm('Cancel this appointment?')) return;
        try {
            const { error } = await supabase.from('Appointment').update({ status: 'CANCELLED' }).eq('id', id);
            if (error) throw error;
            toast.success('Appointment cancelled');
            load();
        } catch (err: any) {
            toast.error(err.message || 'Error cancelling');
        }
    };

    const handleComplete = async () => {
        await supabase.from('Appointment').update({ status: 'COMPLETED' }).eq('id', id);
        toast.success('Marked as completed');
        load();
    };

    const handleSendMsg = (type: string) => {
        if (appt?.patient?.phone && appt?.startTime) {
            const msgText = buildMessage(appt.patient.name, appt.startTime, type as MsgType, practiceName, appt.customMsg);
            openWhatsApp(appt.patient.phone, msgText);
        } else {
            toast.error('Could not generate message');
        }
    };

    if (!appt) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>;

    return (
        <div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/appointments', { state: { date: appt.startTime, view: 'day' } })} style={{ marginBottom: '1rem' }}><ArrowLeft size={15} /> Back</button>

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
                            d.setMinutes(0, 0, 0);
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

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700 }}>Clinical Notes & Scanned Documents</h3>
                        <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>HPCSA Compliant</span>
                    </div>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
                        Capture or upload handwritten notes, clinical assessments, or consent forms. Stores original image and AI-digitized text directly on {appt.patient.name}'s profile.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn btn-primary"
                            style={{ flex: 1, justifyContent: 'center', gap: '6px' }}
                            onClick={() => setDocsModalOpen(true)}
                        >
                            <Camera size={15} /> Scan / Upload Note
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ justifyContent: 'center', gap: '6px' }}
                            onClick={() => setDocsModalOpen(true)}
                        >
                            <FileText size={15} /> View Client Records
                        </button>
                    </div>
                </div>
            </div>

            {/* Client Clinical Documents & Handwritten Notes Modal */}
            {appt.patient && (
                <ClientDocumentsModal
                    patient={appt.patient}
                    appointmentId={Number(id)}
                    isOpen={docsModalOpen}
                    onClose={() => setDocsModalOpen(false)}
                />
            )}
        </div>
    );
}
