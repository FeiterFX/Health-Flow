import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Download, ShieldCheck } from 'lucide-react';

interface Settings {
    id?: number;
    bufferMinutes: number; workdayStart: string; workdayEnd: string;
    practiceName: string; practicePhone: string;
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<Partial<Settings>>({});
    const [weekdaysOnly, setWeekdaysOnly] = useState(() => localStorage.getItem('weekdaysOnly') === 'true');
    const [defaultCalendarView, setDefaultCalendarView] = useState(() => localStorage.getItem('defaultCalendarView') || 'week');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await supabase.from('Setting').select('*').maybeSingle();
                if (data) setSettings(data);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { id, userId, ...updatePayload } = settings as any;

            let queryResult;
            if (settings.id) {
                queryResult = await supabase.from('Setting').update(updatePayload).eq('id', settings.id);
            } else {
                queryResult = await supabase.from('Setting').insert([updatePayload]).select().single();
                if (queryResult.data) {
                    setSettings(queryResult.data);
                }
            }

            if (queryResult.error) {
                console.error("Supabase error saving settings:", queryResult.error);
                throw queryResult.error;
            }

            localStorage.setItem('weekdaysOnly', weekdaysOnly.toString());
            localStorage.setItem('defaultCalendarView', defaultCalendarView);
            toast.success('Settings saved');
        } catch (err) {
            console.error("Catch block err", err);
            toast.error('Error saving settings');
        } finally { setSaving(false); }
    };

    const handleExport = async () => {
        try {
            const { data } = await supabase.from('Appointment').select('*, patient:Patient(name, phone)').order('startTime', { ascending: false });
            if (!data) return toast.error('No data to export');

            const headers = ['ID', 'Date', 'Time', 'Client Name', 'Phone', 'Status', 'Notes'];
            const rows = data.map(a => [
                a.id,
                new Date(a.startTime).toLocaleDateString('en-ZA'),
                new Date(a.startTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
                `"${(a.patient as any)?.name || ''}"`,
                `"${(a.patient as any)?.phone || ''}"`,
                a.status,
                `"${(a.notes || '').replace(/"/g, '""')}"`
            ]);

            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `appointments_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            toast.error('Error exporting data');
        }
    };

    if (loading) return <p className="text-muted">Loading…</p>;

    return (
        <div>
            <div className="page-header">
                <div><h2 className="page-title">Settings</h2><p className="page-subtitle">Practice configuration</p></div>
                <button className="btn btn-secondary" onClick={handleExport}><Download size={15} /> Export CSV</button>
            </div>

            <form onSubmit={handleSave} style={{ maxWidth: 560 }}>
                <div className="card">
                    <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700 }}>Practice Details</h3>
                    <div className="form-group"><label className="form-label">Practice / Practitioner Name</label>
                        <input className="form-input" value={settings.practiceName || ''} onChange={e => setSettings(s => ({ ...s, practiceName: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Practice Phone (shown in messages)</label>
                        <input className="form-input" value={settings.practicePhone || ''} onChange={e => setSettings(s => ({ ...s, practicePhone: e.target.value }))} placeholder="+27821234567" /></div>
                </div>

                <div className="card mt-4">
                    <h3 style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', fontWeight: 700 }}>Scheduling</h3>
                    <div className="form-row">
                        <div className="form-group"><label className="form-label">Workday Start</label>
                            <input className="form-input" type="time" value={settings.workdayStart || '08:00'} onChange={e => setSettings(s => ({ ...s, workdayStart: e.target.value }))} /></div>
                        <div className="form-group"><label className="form-label">Workday End</label>
                            <input className="form-input" type="time" value={settings.workdayEnd || '17:00'} onChange={e => setSettings(s => ({ ...s, workdayEnd: e.target.value }))} /></div>
                    </div>
                    <div className="form-group"><label className="form-label">Buffer between sessions (minutes)</label>
                        <input className="form-input" type="number" min={0} max={60} value={settings.bufferMinutes ?? 10} onChange={e => setSettings(s => ({ ...s, bufferMinutes: Number(e.target.value) }))} style={{ maxWidth: 120 }} /></div>
                    <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '1rem' }}>
                        <input type="checkbox" id="weekdaysOnly" checked={weekdaysOnly} onChange={e => setWeekdaysOnly(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                        <label htmlFor="weekdaysOnly" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Show weekdays only (hide weekends from calendar)</label>
                    </div>
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                        <label className="form-label">Default Calendar View</label>
                        <select className="form-input" value={defaultCalendarView} onChange={e => setDefaultCalendarView(e.target.value)}>
                            <option value="month">Month</option>
                            <option value="week">Week</option>
                            <option value="work_week">Work Week</option>
                            <option value="day">Day</option>
                        </select>
                    </div>
                </div>

                <div className="card mt-4">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>Clinical Document Retainment</h3>
                        <span className="badge badge-green" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ShieldCheck size={12} /> HPCSA & ECTA
                        </span>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        <strong>South Africa Document Retainment Notice:</strong> Client records and handwritten scans are saved with a minimum 6-year retention mandate (HPCSA Booklet 9 Rule 9.1) and cryptographically sealed with SHA-256 for legal admissibility under ECTA Section 14.
                    </div>
                </div>

                <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
                </div>
            </form>
        </div>
    );
}
