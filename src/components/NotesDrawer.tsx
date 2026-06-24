import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Edit3, Check, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Property, Note } from '../types';

interface NotesDrawerProps {
  property: Property;
  userEmail: string;
  onClose: () => void;
  onNotesCountChange: (propertyId: string, count: number) => void;
}

export default function NotesDrawer({ property, userEmail, onClose, onNotesCountChange }: NotesDrawerProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    fetchNotes();
  }, [property.id]);

  async function fetchNotes() {
    setLoading(true);
    const { data, error } = await supabase
      .from('property_notes')
      .select('*')
      .eq('property_id', property.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setNotes(data as Note[]);
      onNotesCountChange(property.id, data.length);
    }
    setLoading(false);
  }

  async function handleAdd() {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data, error } = await supabase
      .from('property_notes')
      .insert({ property_id: property.id, content: trimmed, user_id: user.id })
      .select()
      .single();
    if (!error && data) {
      const updated = [data as Note, ...notes];
      setNotes(updated);
      onNotesCountChange(property.id, updated.length);
      setNewContent('');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('property_notes').delete().eq('id', id);
    if (!error) {
      const updated = notes.filter(n => n.id !== id);
      setNotes(updated);
      onNotesCountChange(property.id, updated.length);
    }
  }

  async function handleSaveEdit(id: string) {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from('property_notes')
      .update({ content: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setNotes(notes.map(n => n.id === id ? { ...n, content: trimmed } : n));
      setEditingId(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000 }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-md flex flex-col shadow-2xl"
        style={{ zIndex: 2001, backgroundColor: '#2a3330', borderLeft: '1px solid rgba(136,152,147,0.2)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(136,152,147,0.15)' }}
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4" style={{ color: '#d41f27' }} />
            <div>
              <p className="text-white font-semibold text-sm">Notes</p>
              <p className="text-xs mt-0.5 truncate max-w-[200px]" style={{ color: '#889893' }}>
                {property.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
            style={{ color: '#889893' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.backgroundColor = '#37423f'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New note */}
        <div className="p-4" style={{ borderBottom: '1px solid rgba(136,152,147,0.15)' }}>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
            placeholder="Write a note about this property…"
            rows={3}
            className="w-full text-white resize-none focus:outline-none transition-colors rounded-xl px-4 py-3"
            style={{
              backgroundColor: '#37423f',
              border: '1px solid rgba(136,152,147,0.25)',
              color: 'white',
              fontSize: '16px',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212,31,39,0.08)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(136,152,147,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs" style={{ color: 'rgba(136,152,147,0.4)' }}>Cmd+Enter to save</p>
            <button
              onClick={handleAdd}
              disabled={!newContent.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-semibold rounded-full transition-all duration-200 disabled:cursor-not-allowed"
              style={{
                backgroundColor: !newContent.trim() || saving ? 'rgba(212,31,39,0.4)' : '#d41f27',
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'rgba(136,152,147,0.3)', borderTopColor: '#d41f27' }}
              />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{ backgroundColor: '#37423f' }}
              >
                <MessageSquare className="w-5 h-5" style={{ color: '#889893' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: '#b5c5c1' }}>No notes yet</p>
              <p className="text-xs mt-1" style={{ color: '#889893' }}>Add your first note above</p>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="rounded-xl p-4 group"
                style={{ backgroundColor: 'rgba(55,66,63,0.5)', border: '1px solid rgba(136,152,147,0.15)' }}
              >
                {editingId === note.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full text-white resize-none focus:outline-none rounded-lg px-3 py-2 transition-colors"
                      style={{ backgroundColor: '#37423f', border: '1px solid rgba(136,152,147,0.3)', fontSize: '16px' }}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        className="flex items-center gap-1 px-3 py-1 text-white text-xs font-semibold rounded-full transition-colors"
                        style={{ backgroundColor: '#d41f27' }}
                      >
                        <Check className="w-3 h-3" /> Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs transition-colors"
                        style={{ color: '#889893' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#e8e4df' }}>
                      {note.content}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium" style={{ color: 'rgba(181,197,193,0.7)' }}>
                          {userEmail}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(136,152,147,0.5)' }}>
                          {formatDate(note.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#889893' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#b5c5c1'; e.currentTarget.style.backgroundColor = '#37423f'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#889893' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#d41f27'; e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
