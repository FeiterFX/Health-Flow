import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, List, Plus } from 'lucide-react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, getDay, startOfDay } from 'date-fns';
import { enZA } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: (date: Date) => startOfDay(date), getDay, locales: { 'en-ZA': enZA } });

interface Appointment {
    id: number; startTime: string; endTime: string; status: string;
    patient: { name: string; };
}

export default function AppointmentsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [settings, setSettings] = useState<{ workdayStart?: string; workdayEnd?: string }>({});
    const [view, setView] = useState<'calendar' | 'list'>('calendar');
    const [calendarDate, setCalendarDate] = useState(location.state?.date ? new Date(location.state.date) : new Date());
    const [calendarView, setCalendarView] = useState<any>(
        location.state?.view ? location.state.view : (localStorage.getItem('defaultCalendarView') || (localStorage.getItem('weekdaysOnly') === 'true' ? 'work_week' : 'week'))
    );

    useEffect(() => {
        if (!localStorage.getItem('debsQuirkyMessageSeen')) {
            toast("Hey Lovely! I sprinkled some magic on the calendar for you. Pop over to Settings and change your 'Default Calendar View' to 'Day' so it always loads just the way you like it. Happy scheduling! ✨", {
                duration: 12000,
                icon: '😎',
                style: {
                    border: '1px solid var(--accent)',
                    padding: '16px',
                    color: 'var(--text)',
                    background: 'var(--bg-card)',
                },
            });
            localStorage.setItem('debsQuirkyMessageSeen', 'true');
        }

        supabase.from('Appointment').select('*, patient:Patient(name)').then(r => {
            if (r.data) setAppointments(r.data as any);
        });
        supabase.from('Setting').select('workdayStart, workdayEnd').maybeSingle().then(r => {
            if (r.data) setSettings(r.data);
        });
    }, []);

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

    const CustomEvent = ({ event }: any) => {
        return (
            <div className="custom-event-content">
                <div className="custom-event-title">{event.title}</div>
                <div className="custom-event-stripes"></div>
            </div>
        );
    };

    const parseTime = (timeStr: string, offsetHours: number) => {
        const [h, m] = timeStr.split(':').map(Number);
        return new Date(2026, 0, 1, h + offsetHours, m, 0);
    };

    const minTime = settings.workdayStart ? parseTime(settings.workdayStart, -1) : new Date(2026, 0, 1, 7, 0, 0);
    const maxTime = settings.workdayEnd ? parseTime(settings.workdayEnd, 1) : new Date(2026, 0, 1, 18, 0, 0);

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
                        date={calendarDate}
                        view={calendarView}
                        onNavigate={setCalendarDate}
                        onView={setCalendarView}
                        views={['month', 'week', 'work_week', 'day']}
                        step={60}
                        timeslots={1}
                        min={minTime}
                        max={maxTime}
                        selectable={true}
                        longPressThreshold={10}
                        onSelectSlot={({ start, end }: any) => navigate('/appointments/new', { state: { start: start.toISOString(), end: end.toISOString() } })}
                        components={{
                            event: CustomEvent
                        }}
                        style={{ height: 850 }}
                        onSelectEvent={(e: any) => navigate(`/appointments/${e.id}`)}
                        eventPropGetter={(e: any) => ({ className: `custom-event-wrapper status-${e.resource?.status}` })}
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
