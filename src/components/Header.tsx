import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, Check, Menu, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ECRLogo from '../assets/ECR_Logo.svg';
import { Client, UserRole } from '../types';

export type NavTab = 'properties' | 'financial' | 'clients' | 'brokers' | 'team';

interface HeaderProps {
  userEmail: string;
  userRole: UserRole;
  favoritesCount: number;
  showFavoritesOnly: boolean;
  activeTab: NavTab;
  clients: Client[];
  selectedClientId: string | null;
  onToggleFavorites: () => void;
  onTabChange: (tab: NavTab) => void;
  onClientChange: (id: string | null) => void;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const ALL_TABS: { key: NavTab; label: string }[] = [
  { key: 'properties', label: 'Properties' },
  { key: 'financial', label: 'Financial' },
  { key: 'clients', label: 'Clients' },
  { key: 'brokers', label: 'Brokers' },
  { key: 'team', label: 'Team' },
];

export default function Header({
  userEmail, userRole, favoritesCount, showFavoritesOnly, activeTab,
  clients, selectedClientId, onToggleFavorites, onTabChange, onClientChange
}: HeaderProps) {
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Only admins manage Clients/Brokers. Brokers and clients see Properties +
  // Financial; brokers switch between their clients via the "Viewing as" dropdown.
  const visibleTabs = userRole === 'admin'
    ? ALL_TABS
    : ALL_TABS.filter(t => t.key === 'properties' || t.key === 'financial');

  const canSwitchClient = userRole !== 'client' && clients.length > 0;

  useEffect(() => {
    if (!showClientMenu) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowClientMenu(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showClientMenu]);

  useEffect(() => {
    if (!showMobileMenu) return;
    function handler(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setShowMobileMenu(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMobileMenu]);

  async function handleSignOut() {
    try {
      // Local scope avoids hanging/throwing on the global token-revoke request
      // (which can fail for recovery-created sessions).
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore — we clear the session and reload regardless.
    }
    window.location.reload();
  }

  const now = new Date();
  const monthYear = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;
  const viewingLabel = selectedClient ? `${selectedClient.name} · ${selectedClient.company}` : 'All Clients';

  return (
    <header
      className="sticky top-0 z-40 shrink-0"
      style={{ backgroundColor: '#2a3330', borderBottom: '1px solid rgba(136,152,147,0.15)' }}
    >
      <div className="flex items-center h-14 px-3 sm:px-4 gap-2 lg:gap-3">
        {/* ECR Logo */}
        <img src={ECRLogo} alt="ECR" className="h-7 w-auto shrink-0" />

        {/* Client brand — logo for any role; the name only for client-role
            users, since admins/brokers already see it in "Viewing as" (showing
            it on both sides is redundant and crowds the bar). */}
        {(selectedClient?.logo_url || (userRole === 'client' && selectedClient?.company)) && (
          <>
            <div className="hidden lg:block h-7 w-px shrink-0" style={{ backgroundColor: 'rgba(136,152,147,0.25)' }} />
            {selectedClient?.logo_url ? (
              <img
                src={selectedClient.logo_url}
                alt={selectedClient.company}
                className="hidden lg:block h-6 w-auto shrink-0 object-contain"
                style={{ maxWidth: 80 }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className="text-xs font-bold uppercase tracking-widest hidden lg:block whitespace-nowrap" style={{ color: 'white' }}>
                {selectedClient?.company}
              </span>
            )}
          </>
        )}

        {/* Month/year + label — only on large desktops, purely decorative */}
        <div className="hidden 2xl:flex flex-col leading-none ml-1">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'white' }}>{monthYear}</span>
          <span className="text-xs uppercase tracking-wider mt-0.5" style={{ color: '#889893' }}>Property Dashboard</span>
        </div>

        {/* Nav tabs — lg and up; below that they live in the mobile menu */}
        <div className="hidden lg:flex items-center gap-1 ml-4">
          {visibleTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className="px-2.5 xl:px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide xl:tracking-widest transition-all duration-150 whitespace-nowrap"
              style={activeTab === key
                ? { backgroundColor: '#d41f27', color: 'white' }
                : { color: '#889893' }
              }
              onMouseEnter={e => { if (activeTab !== key) (e.currentTarget as HTMLElement).style.color = '#b5c5c1'; }}
              onMouseLeave={e => { if (activeTab !== key) (e.currentTarget as HTMLElement).style.color = '#889893'; }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Viewing as dropdown — admin and broker only, lg and up */}
        {canSwitchClient && (
          <div className="relative hidden lg:block" ref={menuRef}>
            <button
              onClick={() => setShowClientMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
              style={{ color: '#b5c5c1', border: '1px solid rgba(136,152,147,0.2)', backgroundColor: showClientMenu ? 'rgba(255,255,255,0.08)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => { if (!showClientMenu) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span className="hidden xl:inline shrink-0" style={{ color: '#889893' }}>Viewing as</span>
              <span className="font-semibold truncate max-w-[140px] xl:max-w-[176px] shrink-0" style={{ color: 'white' }}>{viewingLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: '#889893' }} />
            </button>

            {showClientMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden min-w-[220px] max-h-[70vh] overflow-y-auto"
                style={{ backgroundColor: 'white', border: '1px solid #dedad3', zIndex: 1500 }}
              >
                {[{ id: null, name: 'All Clients', company: '' }, ...clients].map(c => {
                  const isSelected = c.id === selectedClientId;
                  return (
                    <button
                      key={c.id ?? 'all'}
                      onClick={() => { onClientChange(c.id); setShowClientMenu(false); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors"
                      style={isSelected ? { color: '#d41f27', backgroundColor: 'rgba(212,31,39,0.05)' } : { color: '#3a4a47' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f7f5f1'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span>
                        <span className="font-semibold">{c.name}</span>
                        {c.company && <span className="text-xs ml-1.5" style={{ color: '#7a8a87' }}>{c.company}</span>}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-2" style={{ color: '#d41f27' }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Favorites toggle (only on properties tab) — lg and up */}
        {activeTab === 'properties' && (
          <button
            onClick={onToggleFavorites}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 shrink-0"
            style={showFavoritesOnly
              ? { backgroundColor: 'rgba(212,31,39,0.15)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.3)' }
              : { color: '#889893', border: '1px solid transparent' }
            }
            onMouseEnter={e => { if (!showFavoritesOnly) { e.currentTarget.style.color = '#b5c5c1'; e.currentTarget.style.borderColor = 'rgba(136,152,147,0.3)'; } }}
            onMouseLeave={e => { if (!showFavoritesOnly) { e.currentTarget.style.color = '#889893'; e.currentTarget.style.borderColor = 'transparent'; } }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="hidden xl:inline">Saved ({favoritesCount})</span>
          </button>
        )}

        {/* Divider */}
        <div className="hidden 2xl:block h-5 w-px shrink-0" style={{ backgroundColor: 'rgba(136,152,147,0.2)' }} />

        {/* Phone + website — 2xl and up (largest desktops) */}
        <div className="hidden 2xl:flex items-center gap-3 shrink-0">
          <a href="tel:5125050000" className="text-xs font-medium transition-colors whitespace-nowrap" style={{ color: '#b5c5c1' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#b5c5c1'; }}>
            512.505.0000
          </a>
          <a href="https://ecrtx.com" target="_blank" rel="noopener noreferrer" className="text-xs font-medium uppercase tracking-widest transition-colors whitespace-nowrap" style={{ color: '#d41f27' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#d41f27'; }}>
            ECRTX.COM
          </a>
        </div>

        {/* Sign out — lg and up (in the mobile menu below lg) */}
        <button
          onClick={handleSignOut}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 shrink-0"
          style={{ color: '#889893', border: '1px solid transparent' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.backgroundColor = 'rgba(55,66,63,0.8)'; e.currentTarget.style.borderColor = 'rgba(136,152,147,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#889893'; e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Sign out</span>
        </button>

        {/* Hamburger — below lg, holds tabs + viewing-as + links + sign out */}
        <div className="lg:hidden relative ml-auto" ref={mobileMenuRef}>
          <button
            onClick={() => setShowMobileMenu(v => !v)}
            aria-label="Menu"
            aria-expanded={showMobileMenu}
            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-colors"
            style={{ color: showMobileMenu ? 'white' : '#b5c5c1', backgroundColor: showMobileMenu ? 'rgba(255,255,255,0.08)' : 'transparent', border: '1px solid rgba(136,152,147,0.2)' }}
          >
            {showMobileMenu ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {showMobileMenu && (
            <div
              className="absolute right-0 top-full mt-2 w-64 rounded-xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: '#2a3330', border: '1px solid rgba(136,152,147,0.2)', zIndex: 1500 }}
            >
              {/* Tabs */}
              <div className="p-2">
                {visibleTabs.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { onTabChange(key); setShowMobileMenu(false); }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors mb-0.5"
                    style={activeTab === key ? { backgroundColor: '#d41f27', color: 'white' } : { color: '#b5c5c1' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Viewing as (admin/broker) */}
              {canSwitchClient && (
                <div className="p-2 border-t" style={{ borderColor: 'rgba(136,152,147,0.15)' }}>
                  <p className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Viewing as</p>
                  {[{ id: null, name: 'All Clients', company: '' }, ...clients].map(c => {
                    const isSelected = c.id === selectedClientId;
                    return (
                      <button
                        key={c.id ?? 'all'}
                        onClick={() => { onClientChange(c.id); setShowMobileMenu(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors"
                        style={isSelected ? { color: 'white', backgroundColor: 'rgba(212,31,39,0.2)' } : { color: '#b5c5c1' }}
                      >
                        <span className="truncate">
                          <span className="font-semibold">{c.name}</span>
                          {c.company && <span className="text-xs ml-1.5" style={{ color: '#889893' }}>{c.company}</span>}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-2" style={{ color: '#d41f27' }} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Contact + sign out */}
              <div className="p-3 border-t flex flex-col gap-3" style={{ borderColor: 'rgba(136,152,147,0.15)' }}>
                <div className="flex items-center gap-3 px-1">
                  <a href="tel:5125050000" className="text-xs font-medium" style={{ color: '#b5c5c1' }}>512.505.0000</a>
                  <a href="https://ecrtx.com" target="_blank" rel="noopener noreferrer" className="text-xs font-medium uppercase tracking-widest" style={{ color: '#d41f27' }}>ECRTX.COM</a>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ color: '#b5c5c1', border: '1px solid rgba(136,152,147,0.2)' }}
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
