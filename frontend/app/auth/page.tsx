'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './auth.module.css';
import { buildApiUrl } from '../../lib/api';

export default function AuthPage() {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [userId, setUserId] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = mode === 'login'
                ? buildApiUrl('/api/auth/login')
                : buildApiUrl('/api/auth/register');
            const body = mode === 'login'
                ? { email, password }
                : { user_id: userId, name, email, password };
            // Note: role is NOT sent — backend always assigns 'user' on registration (BUG-009 fix)

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Authentication failed');
            }

            // BUG-003 fix: Backend returns { success: true, data: { user, tokens: { accessToken, ... } } }
            localStorage.setItem('token', data.data.tokens.accessToken);
            localStorage.setItem('user', JSON.stringify(data.data.user));

            if (data.data.user.role === 'officer') {
                router.push('/officer');
            } else {
                router.push('/dashboard');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            {/* Top Navigation */}
            <nav className={styles.topNav}>
                <div className={styles.navLeft}>
                    <span className={styles.brand}>WASTECOIN</span>
                    <div className={styles.navLinks}>
                        <a href="/" className={styles.navLink}>Home</a>
                        <a href="#" className={styles.navLink}>
                            Get started
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                        </a>
                        <a href="#" className={styles.navLink}>About</a>
                        <a href="#" className={styles.navLink}>Forum</a>
                    </div>
                </div>
                <div className={styles.navRight}>
                    <div className={styles.searchBar}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        <span>Try &apos;Recycling centers&apos;</span>
                    </div>
                    <button
                        className={styles.navLoginBtn}
                        onClick={() => setMode('login')}
                    >
                        Login
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <div className={styles.mainContent}>
                {/* Left Side — Hero */}
                <div className={styles.heroSide}>
                    <div className={styles.heroContent}>
                        <span className={styles.heroTag}>SUSTAINABLE FUTURE SOURCE</span>
                        <h1 className={styles.heroTitle}>
                            TURN YOUR<br />
                            WASTE INTO<br />
                            VALUABLE<br />
                            <span className={styles.heroDecoRow}>
                                <span className={styles.decoDot} style={{ background: '#a3a93e' }}></span>
                                <span className={styles.decoDot} style={{ background: '#b5bc5a' }}></span>
                                <span className={styles.decoDot} style={{ background: '#d4e4c8' }}></span>
                            </span>
                            ASSETS.
                        </h1>

                        <div className={styles.heroBottom}>
                            <div className={styles.createAccount}>
                                <span className={styles.createLabel}>
                                    {mode === 'login' ? "Don't have account?" : "Already have account?"}
                                </span>
                                <button
                                    className={styles.createLink}
                                    onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                                >
                                    {mode === 'login' ? 'Create account →' : 'Sign in →'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* About Us Card */}
                    <div className={styles.aboutCard}>
                        <div className={styles.aboutOverlay}>
                            <span className={styles.aboutTitle}>About us</span>
                            <p className={styles.aboutText}>
                                Over <strong>3 million</strong> tons of waste recycled by our generous community of eco-warriors.
                            </p>
                        </div>
                        <div className={styles.aboutArrow}>→</div>
                    </div>
                </div>

                {/* Right Side — Image + Login Form */}
                <div className={styles.formSide}>
                    <div className={styles.heroImageArea}>
                        {/* Background gradient/placeholder for the hero visual */}
                        <div className={styles.heroImageBg}>
                            <div className={styles.heroImageLabel}>
                                <span className={styles.heroImageTitle}>WASTE REDUCTION 2024</span>
                                <span className={styles.heroImageSub}>Best practices</span>
                            </div>
                        </div>

                        {/* Login Form Card */}
                        <div className={styles.formCard}>
                            <h2 className={styles.formTitle}>
                                {mode === 'login' ? 'Login to your account' : 'Create your account'}
                            </h2>

                            <form onSubmit={handleSubmit} className={styles.form}>
                                {mode === 'register' && (
                                    <>
                                        <div className={styles.inputGroup}>
                                            <input
                                                type="text"
                                                className={styles.input}
                                                value={userId}
                                                onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
                                                required
                                                placeholder="User ID (Numbers only, e.g., 001)"
                                            />
                                        </div>
                                        <div className={styles.inputGroup}>
                                            <input
                                                type="text"
                                                className={styles.input}
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                required
                                                placeholder="Full Name"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className={styles.inputGroup}>
                                    <input
                                        type="email"
                                        className={styles.input}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="Email or Username"
                                    />
                                </div>

                                <div className={styles.inputGroup}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className={styles.input}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        placeholder="Password"
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        className={styles.eyeBtn}
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                        )}
                                    </button>
                                </div>

                                {/* Role selector removed: all new accounts are 'user' by default (BUG-009 security fix) */}

                                {mode === 'login' && (
                                    <div className={styles.formOptions}>
                                        <label className={styles.rememberMe}>
                                            <input type="checkbox" />
                                            <span>Remember me</span>
                                        </label>
                                        <a href="#" className={styles.forgotLink}>Forgot password?</a>
                                    </div>
                                )}

                                {error && <div className={styles.errorMsg}>{error}</div>}

                                <button
                                    type="submit"
                                    className={styles.submitBtn}
                                    disabled={loading}
                                >
                                    {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Create Account'}
                                </button>
                            </form>
                        </div>

                        {/* Bottom badge */}
                        <div className={styles.secureBadge}>
                            <span>SECURE</span>
                            <span className={styles.secureDot}>•</span>
                            <span>ENCRYPTED</span>
                            <span className={styles.secureDot}>•</span>
                            <span>FAST</span>
                        </div>

                        {/* Slide counter */}
                        <div className={styles.slideCounter}>
                            <span>01/05</span>
                            <div className={styles.slideArrows}>
                                <button className={styles.slideArrow}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                                </button>
                                <button className={styles.slideArrow}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
