import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserRole } from '../types';

interface TeamUser {
  id: string;
  email: string;
  role: UserRole;
  broker_id: string | null;
  client_id: string | null;
  created_at: string;
}

interface TeamPageProps {
  currentUserId: string | null;
}

const ROLE_META: Record<UserRole, { label: string; color: string; bg: string; blurb: string }> = {
  admin:  { label: 'Admin',  color: '#d41f27', bg: 'rgba(212,31,39,0.10)',  blurb: 'Full access — properties, financials, clients, brokers, and this page' },
  broker: { label: 'Broker', color: '#1a6b5a', bg: 'rgba(26,107,90,0.10)',  blurb: 'Read-only; sees only their assigned clients' },
  client: { label: 'Client', color: '#7a8a87', bg: 'rgba(122,138,135,0.14)', blurb: 'Sees only their own assigned properties' },
};

const ROLE_ORDER: UserRole[] = ['admin', 'broker', 'client'];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TeamPage({ currentUserId }: TeamPageProps) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    const { data, error: err } = await supabase.rpc('admin_list_users');
    if (err) {
      setError(err.message ?? 'Could not load users.');
      setLoading(false);
      return;
    }
    setError('');
    setUsers((data ?? []) as TeamUser[]);
    setLoading(false);
  }

  async function changeRole(u: TeamUser, newRole: UserRole) {
    if (newRole === u.role) return;
    const prev = users;
    setSavingId(u.id);
    setError('');
    // Optimistic update; revert on failure.
    setUsers(list => list.map(x => (x.id === u.id ? { ...x, role: newRole } : x)));
    const { error: err } = await supabase.rpc('admin_set_role', { target_id: u.id, new_role: newRole });
    if (err) {
      setUsers(prev);
      setError(err.message ?? 'Could not change role.');
    }
    setSavingId(null);
  }

  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8" style={{ backgroundColor: '#f0ede8' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>Team &amp; Access</h1>
            <p className="text-sm mt-0.5" style={{ color: '#7a8a87' }}>
              Everyone with a login, and what they can see. Change a role from the dropdown.
            </p>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide shrink-0 disabled:opacity-50"
            style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Admin count summary */}
        {!loading && (
          <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: '#3a4a47' }}>
            <ShieldCheck className="w-4 h-4" style={{ color: '#d41f27' }} />
            <span><span className="font-bold">{adminCount}</span> {adminCount === 1 ? 'admin' : 'admins'} · <span className="font-bold">{users.length}</span> total {users.length === 1 ? 'user' : 'users'}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 mb-4 px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#dedad3', borderTopColor: '#d41f27' }} />
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'white', border: '1px solid #e5e1d8' }}>
            {/* Header row */}
            <div className="hidden sm:grid grid-cols-[1fr_140px_120px] gap-4 px-5 py-3" style={{ backgroundColor: '#f5f2ec', borderBottom: '1px solid #e5e1d8' }}>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Member</span>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Role</span>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Added</span>
            </div>

            {users.map((u, i) => {
              const meta = ROLE_META[u.role];
              const isSelf = u.id === currentUserId;
              return (
                <div
                  key={u.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px] gap-2 sm:gap-4 px-5 py-3.5 items-center"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #f0ede8' }}
                >
                  {/* Member */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate" style={{ color: '#1e2624' }}>{u.email}</span>
                      {isSelf && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0ede8', color: '#7a8a87' }}>You</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#9aaba8' }}>{meta.blurb}</p>
                  </div>

                  {/* Role dropdown */}
                  <div className="relative">
                    <select
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={e => changeRole(u, e.target.value as UserRole)}
                      className="w-full appearance-none rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide cursor-pointer focus:outline-none disabled:opacity-50"
                      style={{ backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}
                    >
                      {ROLE_ORDER.map(r => (
                        <option key={r} value={r} style={{ color: '#1e2624', backgroundColor: 'white' }}>{ROLE_META[r].label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Added date */}
                  <span className="text-xs tabular-nums" style={{ color: '#7a8a87' }}>{formatDate(u.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs mt-4" style={{ color: '#9aaba8' }}>
          Anyone signing up with an <span className="font-semibold">@ecrtx.com</span> email becomes an admin automatically.
          Broker and client assignments (which clients they see) are managed on the Brokers and Clients tabs.
        </p>
      </div>
    </div>
  );
}
