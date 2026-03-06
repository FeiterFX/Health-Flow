import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

interface MessageLog {
    id: number; type: string; status: string; sentAt: string; twilioSid?: string; errorMessage?: string;
    patient: { name: string; phone: string; };
    appointment?: { startTime: string; };
}

export default function MessagesPage() {
    const [logs, setLogs] = useState<MessageLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const { data } = await supabase.from('MessageLog')
                    .select('*, patient:Patient(name, phone), appointment:Appointment(startTime)')
                    .order('sentAt', { ascending: false });
                if (data) setLogs(data as any);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    const typeBadge = (t: string) => {
        const map: any = { CONFIRMATION: 'badge-indigo', REMINDER: 'badge-amber', CHANGE: 'badge-amber', CANCELLATION: 'badge-red', CUSTOM: 'badge-gray' };
        return <span className={`badge ${map[t] || 'badge-gray'}`}>{t}</span>;
    };

    return (
        <div>
            <div className="page-header">
                <div><h2 className="page-title">Message Log</h2><p className="page-subtitle">WhatsApp delivery history</p></div>
            </div>

            <div className="card">
                {loading ? <p className="text-muted">Loading…</p> : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr><th>Patient</th><th>Type</th><th>Appointment</th><th>Sent</th><th>Status</th><th>Twilio SID</th></tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No messages logged yet</td></tr>
                                ) : logs.map(log => (
                                    <tr key={log.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div className="avatar">{log.patient.name[0]}</div>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{log.patient.name}</div>
                                                    <div className="text-sm text-muted">{log.patient.phone}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{typeBadge(log.type)}</td>
                                        <td className="text-sm text-muted">{log.appointment ? format(new Date(log.appointment.startTime), 'd MMM yyyy HH:mm') : '—'}</td>
                                        <td className="text-sm text-muted">{format(new Date(log.sentAt), 'd MMM HH:mm')}</td>
                                        <td><span className={`badge ${log.status === 'SENT' ? 'badge-green' : 'badge-red'}`}>{log.status}</span></td>
                                        <td><span className="text-muted text-sm" style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{log.twilioSid || (log.errorMessage ? `Error: ${log.errorMessage.slice(0, 40)}` : '—')}</span></td>
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
