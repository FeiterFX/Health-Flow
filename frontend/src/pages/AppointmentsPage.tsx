import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, List, Plus } from 'lucide-react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enZA } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import api from '../lib/api';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), getDay, locales: { 'en-ZA': enZA } });

interface Appointment {
    id: number; startTime: string; endTime: string; status: string;
    patient: { name: string; };
}

export default function AppointmentsPage() {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [view, setView] = useState<'calendar' | 'list'>('calendar');

    useEffect(() => { api.get('/appointments').then(r => setAppointments(r.data)); }, []);

    const events = appointments.map(a => ({
        id: a.id,
        title: a.patient.name,
        start: new Date(a.startTime),
        end: new Date(a.endTime),
        resource: a,
        className: `status-${a.status}`,
    }));

    const upcoming = appointments.filter(a => new Date(a.startTime) >= new Date() && a.status === 'SCHEDULED').sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const past = appointments.filter(a => new Date(a.startTime) < new Date() || a.status !== 'SCHEDULED').sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const statusBadge = (s: string) => {
        if (s === 'SCHEDULED') return <span className="badge badge-indigo">Scheduled</span>;
        if (s === 'COMPLETED') return <span className="badge badge-green">Completed</span>;
        return <span className="badge badge-red">Cancelled</span>;
    };

    return (
        <div>
            <div className="page-header">
                <div><h2 className="page-title">Appointments</h2></div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className={`btn ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('calendar')}><Calendar size={15} /> Calendar</button>
                    <button className={`btn ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('list')}><List size={15} /> List</button>
                    <button className="btn btn-primary" onClick={() => navigate('/appointments/new')}><Plus size={15} /> New</button>
                </div>
            </div>

            {view === 'calendar' ? (
                <div className="card" style={{ padding: '1rem' }}>
                    <BigCalendar
                        localizer={localizer}
                        events={events}
                        startAccessor="start"
                        endAccessor="end"
                        style={{ height: 580 }}
                        onSelectEvent={(e: any) => navigate(`/appointments/${e.id}`)}
                        eventPropGetter={(e: any) => ({ className: `status-${e.resource?.status}` })}
                    />
                </div>
            ) : (
                <div>
                    <div className="card">
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700 }}>Upcoming ({upcoming.length})</h3>
                        <div className="table-wrap">
                            <table>
                                <thead><tr><th>Client</th><th>Date</th><th>Time</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    {upcoming.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No upcoming appointments</td></tr>
                                    ) : upcoming.map(a => (
                                        <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/appointments/${a.id}`)}>
                                            <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="avatar">{a.patient.name[0]}</div><span style={{ fontWeight: 600 }}>{a.patient.name}</span></div></td>
                                            <td>{format(new Date(a.startTime), 'EEE d MMM yyyy')}</td>
                                            <td>{format(new Date(a.startTime), 'HH:mm')} – {format(new Date(a.endTime), 'HH:mm')}</td>
                                            <td>{statusBadge(a.status)}</td>
                                            <td><span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>View →</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="card mt-4">
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700 }}>Past ({past.length})</h3>
                        <div className="table-wrap">
                            <table>
                                <thead><tr><th>Client</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
                                <tbody>
                                    {past.length === 0 ? (
                                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No past appointments</td></tr>
                                    ) : past.map(a => (
                                        <tr key={a.id} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => navigate(`/appointments/${a.id}`)}>
                                            <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="avatar">{a.patient.name[0]}</div><span style={{ fontWeight: 600 }}>{a.patient.name}</span></div></td>
                                            <td>{format(new Date(a.startTime), 'EEE d MMM yyyy')}</td>
                                            <td>{format(new Date(a.startTime), 'HH:mm')}</td>
                                            <td>{statusBadge(a.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
