import { X, MapPin, Heart, MessageSquare, ExternalLink, Download } from 'lucide-react';
import { Property } from '../types';
import { safeHttpUrl } from '../lib/placeholders';
import { usePropertyPhotos } from '../hooks/usePropertyPhotos';

interface PropertyModalProps {
  property: Property;
  isFavorited: boolean;
  notesCount: number;
  onClose: () => void;
  onFavoriteToggle: (propertyId: string, currentlyFavorited: boolean) => void;
  onOpenNotes: (property: Property) => void;
}

function fmt$(val: number | null) {
  return val == null ? '—' : `$${val.toFixed(2)}`;
}

function fmtSF(val: number | null) {
  return val == null ? '—' : `${val.toLocaleString()} SF`;
}

export default function PropertyModal({
  property,
  isFavorited,
  notesCount,
  onClose,
  onFavoriteToggle,
  onOpenNotes,
}: PropertyModalProps) {
  const { photos } = usePropertyPhotos(property.id, property.slug);
  const heroSrc = photos[0] ?? property.hero_image_url ?? null;
  const suites = property.suites ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} />

      <div
        className="relative w-full max-w-6xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{ backgroundColor: '#2a3330', border: '1px solid rgba(136,152,147,0.2)' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors"
          style={{ backgroundColor: 'rgba(30,38,36,0.8)', color: '#889893' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.backgroundColor = '#37423f'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; e.currentTarget.style.backgroundColor = 'rgba(30,38,36,0.8)'; }}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="overflow-y-auto flex-1">
          {/* Hero */}
          <div className="relative h-72 sm:h-80 shrink-0" style={{ backgroundColor: '#1e2624' }}>
            {heroSrc && (
              <img
                src={heroSrc}
                alt={property.name}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #2a3330 0%, rgba(42,51,48,0.4) 50%, transparent 100%)' }} />
            <div className="absolute bottom-0 left-0 p-6">
              <span
                className="inline-block px-2.5 py-1 text-xs font-semibold rounded-full mb-3"
                style={{ backgroundColor: 'rgba(212,31,39,0.2)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.3)' }}
              >
                {property.property_type}
              </span>
              <h2 className="text-white text-2xl sm:text-3xl font-bold leading-tight">{property.name}</h2>
              <div className="flex items-center gap-1.5 text-sm mt-1.5" style={{ color: '#b5c5c1' }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: '#889893' }} />
                {property.address}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onFavoriteToggle(property.id, isFavorited)}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
                style={isFavorited
                  ? { backgroundColor: 'rgba(212,31,39,0.15)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.3)' }
                  : { color: '#889893', border: '1px solid rgba(136,152,147,0.3)' }
                }
              >
                <Heart className="w-4 h-4" fill={isFavorited ? 'currentColor' : 'none'} />
                {isFavorited ? 'Saved' : 'Save Property'}
              </button>

              <button
                onClick={() => { onClose(); onOpenNotes(property); }}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
                style={notesCount > 0
                  ? { backgroundColor: 'rgba(136,152,147,0.15)', color: '#b5c5c1', border: '1px solid rgba(136,152,147,0.3)' }
                  : { color: '#889893', border: '1px solid rgba(136,152,147,0.3)' }
                }
              >
                <MessageSquare className="w-4 h-4" />
                {notesCount > 0 ? `${notesCount} Note${notesCount !== 1 ? 's' : ''}` : 'Add Notes'}
              </button>

              {safeHttpUrl(property.brochure_url) ? (
                <a
                  href={safeHttpUrl(property.brochure_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200"
                  style={{ backgroundColor: '#879792', color: 'white' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#6e7f7a'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#879792'; }}
                >
                  <Download className="w-4 h-4" />
                  Brochure
                </a>
              ) : (
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold opacity-30 cursor-not-allowed"
                  style={{ backgroundColor: '#879792', color: 'white' }}
                >
                  <Download className="w-4 h-4" />
                  Brochure
                </div>
              )}

              {property.total_sf != null && (
                <span className="ml-auto text-sm" style={{ color: '#889893' }}>
                  {property.total_sf.toLocaleString()} SF total
                </span>
              )}
            </div>

            {/* Description */}
            {property.description && (
              <p className="leading-relaxed text-sm sm:text-base" style={{ color: '#b5c5c1' }}>
                {property.description}
              </p>
            )}

            {/* Suites table */}
            {suites.length > 0 && (
              <div>
                <h3 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
                  Available Spaces
                  <span className="text-sm font-normal" style={{ color: '#889893' }}>
                    ({suites.length} suite{suites.length !== 1 ? 's' : ''})
                  </span>
                </h3>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(136,152,147,0.2)' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[540px]">
                      <thead>
                        <tr style={{ backgroundColor: 'rgba(55,66,63,0.6)', borderBottom: '1px solid rgba(136,152,147,0.2)' }}>
                          <th className="text-left font-semibold px-4 py-3" style={{ color: '#889893' }}>Suite</th>
                          <th className="text-right font-semibold px-4 py-3" style={{ color: '#889893' }}>SF</th>
                          <th className="text-right font-semibold px-4 py-3" style={{ color: '#889893' }}>Base Rent</th>
                          <th className="text-right font-semibold px-4 py-3" style={{ color: '#889893' }}>Op. Exp.</th>
                          <th className="text-left font-semibold px-4 py-3" style={{ color: '#889893' }}>Availability</th>
                          <th className="text-center font-semibold px-4 py-3" style={{ color: '#889893' }}>Tour</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suites.map((suite, i) => (
                          <tr
                            key={suite.id}
                            style={{
                              borderBottom: i < suites.length - 1 ? '1px solid rgba(136,152,147,0.1)' : 'none',
                              backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(55,66,63,0.2)',
                            }}
                          >
                            <td className="px-4 py-3 text-white font-medium">{suite.suite_name}</td>
                            <td className="px-4 py-3 text-right" style={{ color: '#b5c5c1' }}>{fmtSF(suite.sf)}</td>
                            <td className="px-4 py-3 text-right" style={{ color: '#b5c5c1' }}>{fmt$(suite.base_rent)}/SF</td>
                            <td className="px-4 py-3 text-right" style={{ color: '#b5c5c1' }}>{fmt$(suite.op_exp)}/SF</td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                style={suite.available === 'Available Now'
                                  ? { backgroundColor: 'rgba(212,31,39,0.1)', color: '#f87171', border: '1px solid rgba(212,31,39,0.2)' }
                                  : { backgroundColor: 'rgba(136,152,147,0.1)', color: '#889893', border: '1px solid rgba(136,152,147,0.2)' }
                                }
                              >
                                {suite.available ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {suite.tour_url && safeHttpUrl(suite.tour_url) ? (
                                <a
                                  href={safeHttpUrl(suite.tour_url)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                                  style={{ color: '#d41f27' }}
                                >
                                  Tour <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span style={{ color: 'rgba(136,152,147,0.3)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Broker */}
            <div
              className="flex items-center gap-4 p-4 rounded-xl"
              style={{ backgroundColor: 'rgba(55,66,63,0.4)', border: '1px solid rgba(136,152,147,0.15)' }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(212,31,39,0.15)', border: '2px solid rgba(212,31,39,0.2)' }}
              >
                <span className="font-bold text-sm" style={{ color: '#d41f27' }}>
                  {property.broker_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{property.broker_name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#889893' }}>
                  Your Broker &mdash; Equitable Commercial Realty
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
