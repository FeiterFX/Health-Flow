import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format, parse, getDay, startOfDay } from 'date-fns';
import { enZA } from 'date-fns/locale';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek: (date: Date) => startOfDay(date), getDay, locales: { 'en-ZA': enZA } });

interface Appointment {
    id: number;
    startTime: string;
    endTime: string;
    status: string;
    patient: { name: string; phone: string; };
}

export default function DashboardPage() {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [practiceName, setPracticeName] = useState('Roelof Retief');
    const [settings, setSettings] = useState<{ workdayStart?: string; workdayEnd?: string }>({});
    const [loading, setLoading] = useState(true);
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [calendarView, setCalendarView] = useState<any>('day');

    useEffect(() => {
        Promise.all([
            supabase.from('Appointment').select('*, patient:Patient(name, phone)'),
            supabase.from('Setting').select('practiceName, workdayStart, workdayEnd').maybeSingle()
        ]).then(([a, s]) => {
            if (a.data) setAppointments(a.data as any);
            if (s.data?.practiceName) setPracticeName(s.data.practiceName);
            if (s.data) setSettings(s.data);
        }).finally(() => setLoading(false));
    }, []);

    const today = new Date();

    const events = appointments.map(a => ({
        id: a.id,
        title: a.patient?.name || 'Unknown',
        start: new Date(a.startTime),
        end: new Date(a.endTime),
        resource: a,
        className: `status-${a.status}`,
    }));

    const CustomEvent = ({ event }: any) => {
        return (
            <div className="custom-event-content">
                <div className="custom-event-title">{event.title}</div>
                <div className="custom-event-stripes"></div>
            </div>
        );
    };

    const parseTime = (timeStr: string, offsetHours: number) => {
        if (!timeStr) return undefined;
        const [h, m] = timeStr.split(':').map(Number);
        return new Date(2026, 0, 1, h + offsetHours, m, 0);
    };

    const minTime = settings.workdayStart ? parseTime(settings.workdayStart, -1) : new Date(2026, 0, 1, 7, 0, 0);
    const maxTime = settings.workdayEnd ? parseTime(settings.workdayEnd, 1) : new Date(2026, 0, 1, 18, 0, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h2 className="page-title">Welcome, {practiceName}</h2>
                    <p className="page-subtitle">{format(today, 'EEEE, d MMMM yyyy')}</p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/appointments/new')}>
                    <CalendarDays size={16} /> New Appointment
                </button>
            </div>

            {loading ? <p className="text-muted">Loading…</p> : (
                <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
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
                        onSelectSlot={({ start, end }: any) => navigate('/appointments/new', { state: { start: start.toISOString(), end: end.toISOString() } })}
                        components={{
                            event: CustomEvent
                        }}
                        style={{ height: 650 }}
                        onSelectEvent={(e: any) => navigate(`/appointments/${e.id}`)}
                        eventPropGetter={(e: any) => ({ className: `custom-event-wrapper status-${e.resource?.status}` })}
                    />
                </div>
            )}
        </div>
    );
}
