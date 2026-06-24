import { Heart, MessageSquare, MapPin, ChevronRight } from 'lucide-react';
import { Property } from '../types';
import { usePropertyPhotos } from '../hooks/usePropertyPhotos';

interface PropertyCardProps {
  property: Property;
  isFavorited: boolean;
  notesCount: number;
  onFavoriteToggle: (propertyId: string, currentlyFavorited: boolean) => void;
  onOpenNotes: (property: Property) => void;
  onOpenDetail: (property: Property) => void;
}

export default function PropertyCard({
  property,
  isFavorited,
  notesCount,
  onFavoriteToggle,
  onOpenNotes,
  onOpenDetail,
}: PropertyCardProps) {
  const availableCount = property.suites?.filter(s => s.available === 'Available Now').length ?? 0;
  const { photos } = usePropertyPhotos(property.id, property.slug);
  const thumbnailSrc = photos[0] ?? property.hero_image_url ?? null;

  return (
    <div
      className="group relative rounded-2xl overflow-hidden flex flex-col transition-all duration-300"
      style={{ backgroundColor: '#2a3330', border: '1px solid rgba(136,152,147,0.15)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(136,152,147,0.3)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(136,152,147,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Image */}
      <div
        className="relative h-52 overflow-hidden cursor-pointer"
        style={{ backgroundColor: '#1e2624' }}
        onClick={() => onOpenDetail(property)}
      >
        {thumbnailSrc && (
          <img
            src={thumbnailSrc}
            alt={property.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(30,38,36,0.85) 0%, transparent 60%)' }} />

        <div className="absolute top-3 left-3">
          <span
            className="px-2.5 py-1 text-xs font-medium rounded-full backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(30,38,36,0.75)', color: '#b5c5c1', border: '1px solid rgba(136,152,147,0.3)' }}
          >
            {property.property_type}
          </span>
        </div>

        {availableCount > 0 && (
          <div className="absolute top-3 right-3">
            <span
              className="px-2.5 py-1 text-xs font-semibold rounded-full backdrop-blur-sm"
              style={{ backgroundColor: 'rgba(212,31,39,0.15)', color: '#f87171', border: '1px solid rgba(212,31,39,0.3)' }}
            >
              {availableCount} Available
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-5">
        <div className="flex-1 cursor-pointer" onClick={() => onOpenDetail(property)}>
          <h3
            className="font-semibold text-base mb-1 leading-snug transition-colors duration-200 group-hover:text-ecr-red"
            style={{ color: 'white' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#d41f27'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'white'; }}
          >
            {property.name}
          </h3>
          <div className="flex items-start gap-1.5 text-sm mb-3" style={{ color: '#889893' }}>
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#889893' }} />
            <span className="leading-snug">{property.address}</span>
          </div>
          <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: 'rgba(181,197,193,0.6)' }}>
            {property.description}
          </p>
        </div>

        {property.total_sf != null && (
          <div
            className="mt-3 pt-3 flex items-center gap-3 text-xs"
            style={{ borderTop: '1px solid rgba(136,152,147,0.15)', color: 'rgba(136,152,147,0.6)' }}
          >
            <span>{property.total_sf.toLocaleString()} SF</span>
            <span>&bull;</span>
            <span>{property.suites?.length ?? 0} suite{property.suites?.length !== 1 ? 's' : ''}</span>
            <span>&bull;</span>
            <span>{property.market}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onFavoriteToggle(property.id, isFavorited); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
              style={isFavorited
                ? { backgroundColor: 'rgba(212,31,39,0.15)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.3)' }
                : { color: '#889893', border: '1px solid rgba(136,152,147,0.25)' }
              }
            >
              <Heart className="w-3.5 h-3.5" fill={isFavorited ? 'currentColor' : 'none'} />
              {isFavorited ? 'Saved' : 'Save'}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onOpenNotes(property); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
              style={notesCount > 0
                ? { backgroundColor: 'rgba(136,152,147,0.15)', color: '#b5c5c1', border: '1px solid rgba(136,152,147,0.3)' }
                : { color: '#889893', border: '1px solid rgba(136,152,147,0.25)' }
              }
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {notesCount > 0 ? `${notesCount} Note${notesCount !== 1 ? 's' : ''}` : 'Notes'}
            </button>
          </div>

          <button
            onClick={() => onOpenDetail(property)}
            className="flex items-center gap-0.5 text-xs transition-colors whitespace-nowrap"
            style={{ color: 'rgba(136,152,147,0.5)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#d41f27'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(136,152,147,0.5)'; }}
          >
            Details <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
