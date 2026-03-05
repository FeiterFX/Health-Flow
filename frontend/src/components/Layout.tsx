import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, MessageSquare, Settings, LogOut, Heart, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/patients', icon: Users, label: 'Clients' },
    { to: '/appointments', icon: CalendarDays, label: 'Appointments' },
    { to: '/messages', icon: MessageSquare, label: 'Messages' },
    { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => { logout(); navigate('/login'); };
    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className="app-layout">
            {/* Hamburger – only visible on mobile */}
            <button
                className="hamburger"
                onClick={() => setSidebarOpen(o => !o)}
                aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
                {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Dark overlay behind sidebar on mobile */}
            <div
                className={`mobile-overlay${sidebarOpen ? ' visible' : ''}`}
                onClick={closeSidebar}
            />

            <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
                <div className="sidebar-brand">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ background: 'var(--accent)', borderRadius: '8px', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Heart size={16} color="white" />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '1rem' }}>Healthcare Booking</h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user?.name}</p>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(({ to, icon: Icon, label, exact }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={exact}
                            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                            onClick={closeSidebar}
                        >
                            <Icon size={18} />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="nav-item btn-ghost" onClick={handleLogout} style={{ width: '100%', border: 'none', background: 'none' }}>
                        <LogOut size={18} />
                        Log out
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <div className="page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
