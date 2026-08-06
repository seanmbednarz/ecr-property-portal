import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, UserPlus, Pencil, X } from 'lucide-react';
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

// Calls the admin-manage-user edge function with the caller's session token.
async function manageUser(body: Record<string, unknown>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-user`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    },
  );
  const jsonBody = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(jsonBody.error ?? `Request failed (${res.status})`);
}

interface UserModalProps {
  user: TeamUser | null; // null = add a new user
  onClose: () => void;
  onSaved: () => void;
}

function UserModal({ user, onClose, onSaved }: UserModalProps) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'client');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setError('Email is required.'); return; }
    if (!isEdit && password.trim().length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (isEdit && password.trim() && password.trim().length < 6) { setError('Password must be at least 6 characters.'); return; }

    setSaving(true); setError('');
    try {
      if (isEdit) {
        const body: Record<string, unknown> = { action: 'update', target_id: user!.id };
        if (cleanEmail !== user!.email) body.email = cleanEmail;
        if (password.trim()) body.password = password.trim();
        if (!body.email && !body.password) { onClose(); return; }
        await manageUser(body);
      } else {
        await manageUser({ action: 'create', email: cleanEmail, password: password.trim(), role });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  const inp = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors';
  const inpStyle = { backgroundColor: 'white', border: '1px solid #dedad3', color: '#1e2624' };
  const focus = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#dedad3'; },
  };
  const lbl = 'block text-xs font-semibold uppercase tracking-widest mb-1';
  const lblStyle = { color: '#7a8a87' };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: 'white' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e1d8' }}>
          <h2 className="text-base font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>{isEdit ? 'Edit User' : 'Add User'}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: '#7a8a87', backgroundColor: '#f0ede8' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className={lbl} style={lblStyle}>Email (login)</label>
            <input type="email" className={inp} style={inpStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@ecrtx.com" autoComplete="off" {...focus} />
          </div>

          <div>
            <label className={lbl} style={lblStyle}>{isEdit ? 'Reset Password' : 'Password'}</label>
            <input className={inp} style={inpStyle} value={password} onChange={e => setPassword(e.target.value)} placeholder={isEdit ? 'Leave blank to keep current' : 'Min 6 characters'} autoComplete="new-password" {...focus} />
          </div>

          {!isEdit && (
            <div>
              <label className={lbl} style={lblStyle}>Role</label>
              <select className={inp} style={inpStyle} value={role} onChange={e => setRole(e.target.value as UserRole)}>
                {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
              </select>
              <p className="text-xs mt-1" style={{ color: '#9aaba8' }}>Broker/client property assignments are set on the Brokers and Clients tabs.</p>
            </div>
          )}

          {error && <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid #e5e1d8' }}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#d41f27' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage({ currentUserId }: TeamPageProps) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [modalUser, setModalUser] = useState<TeamUser | null | false>(false);

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
              Everyone with a login, and what they can see. Change a role from the dropdown, or edit a login.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide disabled:opacity-50"
              style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={() => setModalUser(null)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: '#d41f27' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b81920')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#d41f27')}
            >
              <UserPlus className="w-3.5 h-3.5" /> Add User
            </button>
          </div>
        </div>

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
            <div className="hidden sm:grid grid-cols-[1fr_140px_110px_44px] gap-4 px-5 py-3" style={{ backgroundColor: '#f5f2ec', borderBottom: '1px solid #e5e1d8' }}>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Member</span>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Role</span>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Added</span>
              <span />
            </div>

            {users.map((u, i) => {
              const meta = ROLE_META[u.role];
              const isSelf = u.id === currentUserId;
              return (
                <div
                  key={u.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_140px_110px_44px] gap-2 sm:gap-4 px-5 py-3.5 items-center"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #f0ede8' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate" style={{ color: '#1e2624' }}>{u.email}</span>
                      {isSelf && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0ede8', color: '#7a8a87' }}>You</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#9aaba8' }}>{meta.blurb}</p>
                  </div>

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

                  <span className="text-xs tabular-nums" style={{ color: '#7a8a87' }}>{formatDate(u.created_at)}</span>

                  <button
                    onClick={() => setModalUser(u)}
                    title="Edit email or password"
                    aria-label={`Edit ${u.email}`}
                    className="justify-self-start sm:justify-self-center w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ color: '#7a8a87', border: '1px solid #dedad3', backgroundColor: 'white' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f0ede8'; e.currentTarget.style.color = '#3a4a47'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#7a8a87'; }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
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

      {modalUser !== false && (
        <UserModal
          key={modalUser ? modalUser.id : 'new'}
          user={modalUser}
          onClose={() => setModalUser(false)}
          onSaved={() => { setModalUser(false); fetchUsers(); }}
        />
      )}
    </div>
  );
}
