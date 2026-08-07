import { useState } from 'react';
import { supabase, SUPABASE_URL_RESOLVED, SUPABASE_ANON_KEY_RESOLVED } from '../lib/supabase';
import { Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import ECRLogo from '../assets/ECR_Logo.svg';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const identifier = email.trim();

    // No "@" means it's a username. Client teams share one login, so they sign
    // in with a shared name rather than passing an inbox address around. The
    // exchange happens in an edge function so the browser never sees the email
    // behind a username.
    if (identifier && !identifier.includes('@')) {
      try {
        const res = await fetch(
          `${SUPABASE_URL_RESOLVED}/functions/v1/login-with-username`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // No user session exists yet, but the platform still requires a
              // JWT on every function call — the anon key satisfies that.
              apikey: SUPABASE_ANON_KEY_RESOLVED,
              Authorization: `Bearer ${SUPABASE_ANON_KEY_RESOLVED}`,
            },
            body: JSON.stringify({ username: identifier, password }),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? 'Invalid username or password. Please try again.');
          setLoading(false);
          return;
        }
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (sessErr) {
          setError('Signed in, but the session could not be started. Please try again.');
          setLoading(false);
          return;
        }
        onLogin();
        return;
      } catch {
        setError("Can't reach the sign-in service. Check your internet connection and try again.");
        setLoading(false);
        return;
      }
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email: identifier.toLowerCase(), password });

    if (authError) {
      // A request that never reached Supabase — blocked office network,
      // captive portal, service down — carries no HTTP status. Saying
      // "invalid password" there sends people hunting for an account problem
      // that doesn't exist, so name the real failure.
      const status = authError.status ?? 0;
      const unreachable = authError.name === 'AuthRetryableFetchError' || status === 0;
      setError(
        unreachable
          ? "Can't reach the sign-in service. Check your internet connection and try again."
          : status >= 500
            ? 'The sign-in service is temporarily unavailable. Please try again in a moment.'
            : 'Invalid login or password. Please try again.'
      );
      setLoading(false);
      return;
    }

    onLogin();
  }

  return (
    <div className="min-h-screen bg-ecr-darkest flex flex-col" style={{ backgroundColor: '#1e2624' }}>
      {/* Subtle diagonal accent */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute -bottom-32 -left-32 w-[600px] h-[600px] opacity-10"
          style={{
            background: 'conic-gradient(from 200deg, #d41f27, #37423f, transparent)',
            borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
          }}
        />
        <div
          className="absolute -top-24 -right-24 w-[400px] h-[400px] opacity-5"
          style={{
            background: 'radial-gradient(circle, #b5c5c1, transparent 70%)',
          }}
        />
      </div>

      <div className="relative flex flex-col flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <img
              src={ECRLogo}
              alt="ECR — Equitable Commercial Realty"
              className="h-16 w-auto mb-6"
            />
            <p
              className="text-ecr-gray-light text-xs font-semibold tracking-[0.25em] uppercase"
              style={{ color: '#b5c5c1' }}
            >
              Client Property Portal
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-8 shadow-2xl border"
            style={{
              backgroundColor: '#2a3330',
              borderColor: 'rgba(136,152,147,0.15)',
            }}
          >
            <h2
              className="text-white text-lg font-semibold mb-6 tracking-tight"
            >
              Sign in to your account
            </h2>

            {error && (
              <div
                className="flex items-start gap-3 rounded-xl p-4 mb-6 text-sm"
                style={{
                  backgroundColor: 'rgba(212,31,39,0.1)',
                  borderWidth: 1,
                  borderColor: 'rgba(212,31,39,0.25)',
                  color: '#f87171',
                }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#b5c5c1' }}
                >
                  Email or username
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: '#889893' }}
                  />
                  <input
                    // Deliberately "text", not "email": client teams sign in
                    // with a shared username, which type="email" would reject.
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="you@ecrtx.com or username"
                    className="w-full text-white placeholder-ecr-gray rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none transition-colors"
                    style={{
                      backgroundColor: '#37423f',
                      border: '1px solid rgba(136,152,147,0.25)',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.6)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212,31,39,0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(136,152,147,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#b5c5c1' }}
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: '#889893' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full text-white placeholder-ecr-gray rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none transition-colors"
                    style={{
                      backgroundColor: '#37423f',
                      border: '1px solid rgba(136,152,147,0.25)',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.6)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212,31,39,0.1)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(136,152,147,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: '#889893' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#b5c5c1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; }}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 mt-1 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: loading ? 'rgba(212,31,39,0.5)' : '#d41f27',
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#b81920'; }}
                onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#d41f27'; }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          <p
            className="text-center text-xs mt-6 tracking-wide"
            style={{ color: 'rgba(136,152,147,0.4)' }}
          >
            Access restricted to authorized clients only
          </p>
        </div>
      </div>

      <div className="relative py-6 text-center">
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: 'rgba(136,152,147,0.3)' }}
        >
          &copy; {new Date().getFullYear()} Equitable Commercial Realty &mdash; ecrtx.com
        </p>
      </div>
    </div>
  );
}
