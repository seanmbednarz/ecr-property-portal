import { LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ECRLogo from '../assets/ECR_Logo.svg';
import ACBLogo from '../assets/Austin_Capital_Bank_Logo.svg';

interface HeaderProps {
  userEmail: string;
  favoritesCount: number;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Header({ userEmail, favoritesCount, showFavoritesOnly, onToggleFavorites }: HeaderProps) {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  const now = new Date();
  const monthYear = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <header
      className="sticky top-0 z-40 shrink-0"
      style={{ backgroundColor: '#2a3330', borderBottom: '1px solid rgba(136,152,147,0.15)' }}
    >
      <div className="flex items-center h-14 px-4 gap-3">
        {/* ECR Logo */}
        <img src={ECRLogo} alt="ECR" className="h-7 w-auto shrink-0" />

        {/* Divider */}
        <div className="h-7 w-px shrink-0" style={{ backgroundColor: 'rgba(136,152,147,0.25)' }} />

        {/* Client logo */}
        <img src={ACBLogo} alt="Austin Capital Bank" className="h-6 w-auto shrink-0" style={{ maxWidth: 80 }} />

        {/* Month/year + label */}
        <div className="hidden sm:flex flex-col leading-none ml-1">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'white' }}>{monthYear}</span>
          <span className="text-xs uppercase tracking-wider mt-0.5" style={{ color: '#889893' }}>Property Dashboard</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Favorites toggle */}
        <button
          onClick={onToggleFavorites}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          style={showFavoritesOnly
            ? { backgroundColor: 'rgba(212,31,39,0.15)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.3)' }
            : { color: '#889893', border: '1px solid transparent' }
          }
          onMouseEnter={(e) => { if (!showFavoritesOnly) { e.currentTarget.style.color = '#b5c5c1'; e.currentTarget.style.borderColor = 'rgba(136,152,147,0.3)'; } }}
          onMouseLeave={(e) => { if (!showFavoritesOnly) { e.currentTarget.style.color = '#889893'; e.currentTarget.style.borderColor = 'transparent'; } }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Saved ({favoritesCount})
        </button>

        {/* Divider */}
        <div className="hidden sm:block h-5 w-px" style={{ backgroundColor: 'rgba(136,152,147,0.2)' }} />

        {/* Phone + website */}
        <div className="hidden sm:flex items-center gap-3">
          <a href="tel:5125050000" className="text-xs font-medium transition-colors" style={{ color: '#b5c5c1' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#b5c5c1'; }}>
            512.505.0000
          </a>
          <a href="https://ecrtx.com" target="_blank" rel="noopener noreferrer" className="text-xs font-medium uppercase tracking-widest transition-colors" style={{ color: '#d41f27' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#d41f27'; }}>
            ECRTX.COM
          </a>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          style={{ color: '#889893', border: '1px solid transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.backgroundColor = 'rgba(55,66,63,0.8)'; e.currentTarget.style.borderColor = 'rgba(136,152,147,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
