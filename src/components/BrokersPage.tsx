import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Upload, Phone, Mail, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resizeImageForUpload } from '../lib/resizeImage';
import { Broker, Client } from '../types';

interface BrokersPageProps {
  clients: Client[];
}

const AVATAR_COLORS = [
  '#b81920', '#1a6b5a', '#1a4f8a', '#7a4f1a', '#4a1a7a', '#1a5c7a',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
}

interface BrokerModalProps {
  broker: Partial<Broker> | null;
  onClose: () => void;
  onSaved: (b: Broker) => void;
  onDelete?: () => void;
}

function BrokerModal({ broker, onClose, onSaved, onDelete }: BrokerModalProps) {
  const isEdit = !!broker?.id;
  const [name, setName] = useState(broker?.name ?? '');
  const [title, setTitle] = useState(broker?.title ?? '');
  const [phone, setPhone] = useState(broker?.phone ?? '');
  const [email, setEmail] = useState(broker?.email ?? '');
  const [loginPassword, setLoginPassword] = useState(broker?.login_password ?? 'broker');
  const [photoUrl, setPhotoUrl] = useState(broker?.photo_url ?? '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(broker?.photo_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      let finalPhotoUrl = photoUrl || broker?.photo_url || null;
      if (photoFile) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        const uploadPhoto = await resizeImageForUpload(photoFile);
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const ext = uploadPhoto.name.split('.').pop();
        const path = `brokers/${slug}.${ext}`;
        const form = new FormData();
        form.append('file', uploadPhoto);
        form.append('path', path);
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-broker-photo`,
          { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Photo upload failed');
        finalPhotoUrl = json.url;
      }

      const payload = {
        name: name.trim(),
        title: title.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        login_password: loginPassword.trim() || 'broker',
        photo_url: finalPhotoUrl,
      };

      let saved: Broker;
      if (isEdit && broker?.id) {
        const { data, error: dbErr } = await supabase.from('brokers').update(payload).eq('id', broker.id).select().single();
        if (dbErr) throw dbErr;
        saved = data as Broker;
      } else {
        const { data, error: dbErr } = await supabase.from('brokers').insert({ ...payload, display_order: 99 }).select().single();
        if (dbErr) throw dbErr;
        saved = data as Broker;
      }

      // Provision (or update) the broker's actual login account so they can sign in
      // with their email + password. The Supabase login uses Auth, not this table,
      // so without this step the saved password would never let them in.
      if (payload.email && payload.login_password) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-login`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ email: payload.email, password: payload.login_password, role: 'broker', broker_id: saved.id }),
            }
          );
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(`Broker saved, but login setup failed: ${j.error ?? res.statusText}`);
          }
        }
      }

      onSaved(saved);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.');
      setSaving(false);
    }
  }

  const inp = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors";
  const inpStyle = { backgroundColor: 'white', border: '1px solid #dedad3', color: '#1e2624' };
  const focus = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = '#dedad3'; },
  };
  const lbl = "block text-xs font-semibold uppercase tracking-widest mb-1";
  const lblStyle = { color: '#7a8a87' };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: 'white' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e5e1d8' }}>
          <h2 className="text-base font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>{isEdit ? 'Edit Broker' : 'Add Broker'}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: '#7a8a87', backgroundColor: '#f0ede8' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Headshot */}
          <div>
            <label className={lbl} style={lblStyle}>Headshot</label>
            {photoPreview ? (
              <div className="flex items-center gap-3 mb-2">
                <img src={photoPreview} alt="" className="w-14 h-14 rounded-full object-cover" style={{ border: '2px solid #dedad3' }} />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(''); setPhotoUrl(''); }} className="text-xs" style={{ color: '#d41f27' }}>Remove</button>
              </div>
            ) : (
              <input className={`${inp} mb-2`} style={inpStyle} value={photoUrl} onChange={e => { setPhotoUrl(e.target.value); setPhotoPreview(e.target.value); }} placeholder="Image URL or upload below" {...focus} />
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#f0ede8', color: '#3a4a47', border: '1px solid #dedad3' }}>
              <Upload className="w-3 h-3" /> Upload headshot
            </button>
          </div>

          {/* Name + Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Name *</label>
              <input className={inp} style={inpStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" {...focus} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Title</label>
              <input className={inp} style={inpStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. SIOR, CCIM" {...focus} />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Phone</label>
              <input className={inp} style={inpStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="512.505.0000" {...focus} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Email (login)</label>
              <input type="email" className={inp} style={inpStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@ecrtx.com" {...focus} />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className={lbl} style={lblStyle}>Password (broker login)</label>
            <input className={inp} style={inpStyle} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} {...focus} />
            <p className="text-xs mt-1" style={{ color: '#9aaba8' }}>Brokers sign in with their email + this password to view their clients' feedback.</p>
          </div>

          {error && <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderTop: '1px solid #e5e1d8' }}>
          {isEdit && onDelete ? (
            <button onClick={onDelete} title="Delete broker" aria-label="Delete broker" className="p-2 rounded-lg transition-colors" style={{ color: '#9aaba8' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#d41f27'; e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9aaba8'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Trash2 className="w-4 h-4" />
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: '#d41f27' }}>
              {saving ? 'Saving…' : 'Save Broker'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrokersPage({ clients }: BrokersPageProps) {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalBroker, setModalBroker] = useState<Partial<Broker> | null | false>(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { fetchBrokers(); }, []);

  async function fetchBrokers() {
    const { data } = await supabase.from('brokers').select('*').order('display_order');
    if (data) setBrokers(data as Broker[]);
    setLoading(false);
  }

  function clientCountFor(brokerId: string) {
    return clients.filter(c => c.brokers?.some(b => b.id === brokerId)).length;
  }

  async function handleDelete(id: string) {
    await supabase.from('brokers').delete().eq('id', id);
    setBrokers(prev => prev.filter(b => b.id !== id));
    setConfirmDelete(null);
    setModalBroker(false);
  }

  function handleSaved(b: Broker) {
    setBrokers(prev => {
      const idx = prev.findIndex(x => x.id === b.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = b; return next; }
      return [...prev, b];
    });
    setModalBroker(false);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8" style={{ backgroundColor: '#f0ede8' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>Brokers</h1>
            <p className="text-sm mt-0.5" style={{ color: '#7a8a87' }}>Team members assignable to clients; they appear in the client footer</p>
          </div>
          <button
            onClick={() => setModalBroker({})}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: '#d41f27' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b81920')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#d41f27')}
          >
            <Plus className="w-3.5 h-3.5" /> Add Broker
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#dedad3', borderTopColor: '#d41f27' }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brokers.map(broker => {
              const bg = avatarColor(broker.name);
              const count = clientCountFor(broker.id);
              return (
                <div key={broker.id} className="rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: 'white', border: '1px solid #e5e1d8' }}>
                  {/* Avatar + name */}
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: bg }}>
                      {broker.photo_url
                        ? <img src={broker.photo_url} alt={broker.name} className="w-full h-full object-cover" />
                        : <span className="text-sm font-bold text-white">{initials(broker.name)}</span>
                      }
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#1e2624' }}>{broker.name}</p>
                      {broker.title && <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#889893' }}>{broker.title}</p>}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="space-y-1">
                    {broker.phone && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#3a4a47' }}>
                        <Phone className="w-3 h-3 shrink-0" style={{ color: '#889893' }} />
                        <span>{broker.phone}</span>
                      </div>
                    )}
                    {broker.email && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: '#3a4a47' }}>
                        <Mail className="w-3 h-3 shrink-0" style={{ color: '#889893' }} />
                        <span className="truncate">{broker.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Client count */}
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: '#7a8a87' }}>
                    <Users className="w-3.5 h-3.5" />
                    <span>{count} {count === 1 ? 'client' : 'clients'}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid #f0ede8' }}>
                    <button
                      onClick={() => setModalBroker(broker)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(broker.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{ color: '#d41f27', border: '1px solid rgba(212,31,39,0.2)', backgroundColor: 'white' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modalBroker !== false && (
        <BrokerModal broker={modalBroker} onClose={() => setModalBroker(false)} onSaved={handleSaved} onDelete={modalBroker && (modalBroker as Broker).id ? () => setConfirmDelete((modalBroker as Broker).id!) : undefined} />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'white' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: '#1e2624' }}>Delete broker?</h3>
            <p className="text-xs mb-5" style={{ color: '#7a8a87' }}>This will remove the broker and unlink them from all clients. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ border: '1px solid #dedad3', color: '#3a4a47' }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#d41f27' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
