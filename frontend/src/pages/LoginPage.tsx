import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Heart } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [isSignup, setIsSignup] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isSignup) {
                await register(name, email, password);
            } else {
                await login(email, password);
            }
            navigate('/');
        } catch (err: any) {
            toast.error(err.response?.data?.error || (isSignup ? 'Error creating account' : 'Invalid email or password'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                        <div style={{ background: 'var(--accent)', borderRadius: '14px', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Heart size={24} color="white" />
                        </div>
                    </div>
                    <h1>Healthcare Booking</h1>
                    <p>Psychology Practice Management</p>
                </div>

                <form onSubmit={handleSubmit}>
                    {isSignup && (
                        <div className="form-group">
                            <label className="form-label">Full Name</label>
                            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Jane Doe" required />
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@debsbooking.co.za" required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
                        {loading ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Sign up' : 'Sign in')}
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem' }}>
                        {isSignup ? (
                            <span className="text-muted">Already have an account? <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline', padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => setIsSignup(false)}>Sign in</button></span>
                        ) : (
                            <span className="text-muted">Don't have an account? <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline', padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => setIsSignup(true)}>Create one</button></span>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
