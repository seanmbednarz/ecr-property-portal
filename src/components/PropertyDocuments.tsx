import { useState, useRef } from 'react';
import { FileText, FileSpreadsheet, FileImage, File as FileIcon, Upload, Trash2, Download, AlertTriangle } from 'lucide-react';
import { usePropertyDocuments, DOCUMENT_EXTENSIONS, StoredDocument } from '../hooks/usePropertyDocuments';

// Documents attached to a property, shown at the bottom of the detail page in
// the same card-grid language as the photo boxes. Admins can drag files on to
// upload; everyone who can see the property can download.

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

// Icon + accent per file family, so a spreadsheet reads as a spreadsheet at a
// glance rather than every row looking like a generic file.
function iconFor(doc: StoredDocument) {
  const ext = extOf(doc.file_name);
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { Icon: FileSpreadsheet, color: '#1a6b5a' };
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return { Icon: FileImage, color: '#1a4f8a' };
  if (['pdf'].includes(ext)) return { Icon: FileText, color: '#d41f27' };
  if (['doc', 'docx'].includes(ext)) return { Icon: FileText, color: '#1a4f8a' };
  return { Icon: FileIcon, color: '#7a8a87' };
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PropertyDocuments({ propertyId, isAdmin = false }: {
  propertyId: string;
  isAdmin?: boolean;
}) {
  const { documents, loading, uploading, error, upload, remove } = usePropertyDocuments(propertyId);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hide the section entirely for non-admins when there is nothing to show —
  // an empty "Documents" heading is just noise on a client's page.
  if (!isAdmin && documents.length === 0 && !loading) return null;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!isAdmin) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) upload(files);
  }

  return (
    <div className="mt-10">
      <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#7a8a87' }}>Documents</h2>

      {error && (
        <div className="flex items-start gap-2 mb-3 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div
        onDragOver={e => { if (isAdmin) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="rounded-xl transition-colors"
        style={isAdmin
          ? { border: `2px dashed ${dragging ? '#d41f27' : '#dedad3'}`, backgroundColor: dragging ? 'rgba(212,31,39,0.04)' : 'transparent', padding: 12 }
          : undefined}
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#dedad3', borderTopColor: '#d41f27' }} />
          </div>
        ) : (
          <>
            {documents.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {documents.map(doc => {
                  const { Icon, color } = iconFor(doc);
                  return (
                    <div key={doc.id} className="group relative rounded-xl p-3 flex items-center gap-3 shadow-sm"
                      style={{ backgroundColor: 'white', border: '1px solid #e5e1d8' }}>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${color}14` }}>
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: '#1e2624' }} title={doc.file_name}>
                          {doc.file_name}
                        </p>
                        <p className="text-xs" style={{ color: '#9aaba8' }}>
                          {extOf(doc.file_name).toUpperCase()}{doc.size_bytes ? ` · ${formatSize(doc.size_bytes)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={doc.file_name}
                          title={`Download ${doc.file_name}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                          style={{ color: '#7a8a87' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f0ede8'; e.currentTarget.style.color = '#3a4a47'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#7a8a87'; }}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {isAdmin && (
                          <button
                            onClick={() => setConfirmDelete(doc.id)}
                            title={`Delete ${doc.file_name}`}
                            aria-label={`Delete ${doc.file_name}`}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                            style={{ color: '#9aaba8' }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.08)'; e.currentTarget.style.color = '#d41f27'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9aaba8'; }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isAdmin && (
              <div className={documents.length > 0 ? 'mt-3' : ''}>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept={DOCUMENT_EXTENSIONS.map(e => `.${e}`).join(',')}
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) upload(files);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-60"
                  style={{ color: '#7a8a87', backgroundColor: '#f5f2ec', border: '1px solid #e5e1d8' }}
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading…' : documents.length > 0 ? 'Add more documents' : 'Drag files here, or click to browse'}
                </button>
                <p className="text-xs mt-2 text-center" style={{ color: '#9aaba8' }}>
                  PDF, Word, Excel, CSV, or images · up to 25 MB each
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: 'white' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: '#1e2624' }}>Delete document?</h3>
            <p className="text-xs mb-5" style={{ color: '#7a8a87' }}>
              {documents.find(d => d.id === confirmDelete)?.file_name} will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ border: '1px solid #dedad3', color: '#3a4a47' }}>Cancel</button>
              <button onClick={() => { remove(confirmDelete); setConfirmDelete(null); }}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#d41f27' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
