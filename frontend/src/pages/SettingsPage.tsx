import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Download, ShieldCheck, Sparkles, FileSpreadsheet } from 'lucide-react';

interface Settings {
    id?: number;
    bufferMinutes: number; workdayStart: string; workdayEnd: string;
    practiceName: string; practicePhone: string;
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<Partial<Settings>>({});
    const [weekdaysOnly, setWeekdaysOnly] = useState(() => localStorage.getItem('weekdaysOnly') === 'true');
    const [defaultCalendarView, setDefaultCalendarView] = useState(() => localStorage.getItem('defaultCalendarView') || 'week');
    const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('openrouter_api_key') || localStorage.getItem('gemini_api_key') || '');
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

            if (aiApiKey.trim()) {
                if (aiApiKey.trim().startsWith('sk-')) {
                    localStorage.setItem('openrouter_api_key', aiApiKey.trim());
                    localStorage.removeItem('gemini_api_key');
                } else {
                    localStorage.setItem('gemini_api_key', aiApiKey.trim());
                    localStorage.removeItem('openrouter_api_key');
                }
            } else {
                localStorage.removeItem('openrouter_api_key');
                localStorage.removeItem('gemini_api_key');
            }

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

    const handleExportClinicalRegistry = async () => {
        try {
            const { data, error } = await supabase
                .from('ClientDocument')
                .select('*, patient:Patient(name, phone, email)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!data || data.length === 0) return toast.error('No clinical documents found to export');

            const headers = [
                'Document ID',
                'Client Name',
                'Phone',
                'Email',
                'Document Type',
                'Status',
                'Created At',
                'Verified At',
                'HPCSA Retention Until',
                'SHA-256 Checksum',
                'Storage Path',
                'Transcribed Notes'
            ];

            const rows = data.map(d => [
                d.id,
                `"${((d.patient as any)?.name || '').replace(/"/g, '""')}"`,
                `"${((d.patient as any)?.phone || '').replace(/"/g, '""')}"`,
                `"${((d.patient as any)?.email || '').replace(/"/g, '""')}"`,
                d.document_type,
                d.status,
                new Date(d.created_at).toLocaleString('en-ZA'),
                d.verified_at ? new Date(d.verified_at).toLocaleDateString('en-ZA') : 'Unverified',
                new Date(d.retention_until).toLocaleDateString('en-ZA'),
                `"${d.sha256_checksum || ''}"`,
                `"${d.storage_path || ''}"`,
                `"${(d.verified_text || d.raw_ocr_text || '').replace(/"/g, '""')}"`
            ]);

            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `clinical_records_registry_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(`Exported ${data.length} clinical records`);
        } catch (err) {
            toast.error('Error exporting clinical records');
        }
    };

    if (loading) return <p className="text-muted">Loading…</p>;

    return (
        <div>
            <div className="page-header">
                <div><h2 className="page-title">Settings</h2><p className="page-subtitle">Practice configuration & data management</p></div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={handleExport}><Download size={15} /> Export Appointments</button>
                    <button className="btn btn-secondary" onClick={handleExportClinicalRegistry}><FileSpreadsheet size={15} /> Export Clinical Registry</button>
                </div>
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
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Sparkles size={16} style={{ color: '#f59e0b' }} /> AI Handwriting Transcription
                        </h3>
                        <span className={`badge ${aiApiKey || (import.meta as any).env.VITE_OPENROUTER_API_KEY ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: '0.75rem' }}>
                            {aiApiKey || (import.meta as any).env.VITE_OPENROUTER_API_KEY ? 'Active' : 'Key Needed'}
                        </span>
                    </div>

                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>OpenRouter or Gemini API Key</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Supports sk-or-... or AIza...</span>
                        </label>
                        <input
                            type="password"
                            className="form-input"
                            value={aiApiKey}
                            onChange={e => setAiApiKey(e.target.value)}
                            placeholder="sk-or-v1-..."
                        />
                    </div>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        Used to digitize handwritten clinical notes and patient records. You can enter an OpenRouter key here, or configure <code>OPENROUTER_API_KEY</code> in Supabase Edge Functions Secrets or <code>VITE_OPENROUTER_API_KEY</code> in Netlify build environment variables.
                    </p>
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
