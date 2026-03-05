import { useEffect, useState } from 'react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';

interface Settings {
    bufferMinutes: number; workdayStart: string; workdayEnd: string;
    practiceName: string; practicePhone: string;
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<Partial<Settings>>({});
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => { api.get('/settings').then(r => { setSettings(r.data); }).finally(() => setLoading(false)); }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put('/settings', settings);
            toast.success('Settings saved');
        } catch {
            toast.error('Error saving settings');
        } finally { setSaving(false); }
    };

    const handleExport = () => { window.open('/api/reports/appointments/export', '_blank'); };

    if (loading) return <p className="text-muted">Loading…</p>;

    return (
        <div>
            <div className="page-header">
                <div><h2 className="page-title">Settings</h2><p className="page-subtitle">Practice configuration and Twilio credentials</p></div>
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
                </div>



                <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
                </div>
            </form>
        </div>
    );
}
