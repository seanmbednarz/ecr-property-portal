import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';

export default function App() {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Still resolving session
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1e2624' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(136,152,147,0.2)', borderTopColor: '#d41f27' }} />
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLogin={() => {}} />;
  }

  return <Dashboard userEmail={session.user.email ?? ''} />;
}
