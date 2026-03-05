import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Users, CheckCircle, Clock } from 'lucide-react';
import api from '../lib/api';
import { format } from 'date-fns';

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
    const [patientCount, setPatientCount] = useState(0);
    const [practiceName, setPracticeName] = useState('Dr. Roelof Retief');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([api.get('/appointments'), api.get('/patients'), api.get('/settings')]).then(([a, p, s]) => {
            setAppointments(a.data);
            setPatientCount(p.data.length);
            if (s.data?.practiceName) setPracticeName(s.data.practiceName);
        }).finally(() => setLoading(false));
    }, []);

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayAppts = appointments.filter(a => a.startTime.startsWith(todayStr) && a.status === 'SCHEDULED');
    const upcomingAppts = appointments.filter(a => new Date(a.startTime) >= today && a.status === 'SCHEDULED').slice(0, 5);
    const totalScheduled = appointments.filter(a => a.status === 'SCHEDULED').length;
    const totalCompleted = appointments.filter(a => a.status === 'COMPLETED').length;

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
                <>
                    <div className="grid-cols-4">
                        <div className="stat-card">
                            <div className="stat-icon amber"><Clock size={20} /></div>
                            <div><div className="stat-label">Today's Sessions</div><div className="stat-value">{todayAppts.length}</div></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon indigo"><CalendarDays size={20} /></div>
                            <div><div className="stat-label">Upcoming</div><div className="stat-value">{totalScheduled}</div></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon green"><CheckCircle size={20} /></div>
                            <div><div className="stat-label">Completed</div><div className="stat-value">{totalCompleted}</div></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon rose"><Users size={20} /></div>
                            <div><div className="stat-label">Total Clients</div><div className="stat-value">{patientCount}</div></div>
                        </div>
                    </div>

                    <div className="grid-cols-2 mt-6">
                        <div className="card">
                            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700 }}>Today's Appointments</h3>
                            {todayAppts.length === 0 ? (
                                <p className="text-muted text-sm">No sessions scheduled for today.</p>
                            ) : todayAppts.map(a => (
                                <div key={a.id} onClick={() => navigate(`/appointments/${a.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                                    <div className="avatar">{a.patient.name[0]}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.patient.name}</div>
                                        <div className="text-muted text-sm">{format(new Date(a.startTime), 'HH:mm')} – {format(new Date(a.endTime), 'HH:mm')}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="card">
                            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700 }}>Upcoming Sessions</h3>
                            {upcomingAppts.length === 0 ? (
                                <p className="text-muted text-sm">No upcoming sessions.</p>
                            ) : upcomingAppts.map(a => (
                                <div key={a.id} onClick={() => navigate(`/appointments/${a.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                                    <div className="avatar">{a.patient.name[0]}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.patient.name}</div>
                                        <div className="text-muted text-sm">{format(new Date(a.startTime), 'EEE d MMM, HH:mm')}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
