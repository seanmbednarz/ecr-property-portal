import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { Profile } from './types';

export default function App() {
  const [session, setSession] = useState<any>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session) loadProfile(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    setProfileLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data as Profile | null);
    setProfileLoading(false);
  }

  if (session === undefined || (session && profileLoading && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1e2624' }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(136,152,147,0.2)', borderTopColor: '#d41f27' }} />
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLogin={() => {}} />;
  }

  return (
    <Dashboard
      userEmail={session.user.email ?? ''}
      profile={profile}
    />
  );
}
