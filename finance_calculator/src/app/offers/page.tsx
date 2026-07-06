'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage, LanguageSelector } from '@/contexts/LanguageContext';
import Navigation from '@/components/Navigation';
import { generateOfferPDF, ClientInfo } from '@/lib/pdfGenerator';

interface OfferData {
  currentType: string;
  thickness: number;
  width: number;
  length: number;
  gradeInput: string;
  pglBase: number;
  marginPct: number;
  extra: number;
  transport: number;
  zestawienie: Array<{
    id: number;
    type: string;
    grade: string;
    thickness: number;
    width: number;
    length: number;
    sumaHuta: number;
    sumaSSC: number;
    marza: number;
    finalPrice: number;
    tons: number;
    totalValue: number;
    pgl: number;
  }>;
  // Client info
  clientInfo?: ClientInfo;
  // All other calculator state fields
  tolThick?: number;
  cert?: number;
  selectedCoating?: string;
  crZabezp?: number;
  crOpak?: number;
  crPowierz?: number;
  crWykon?: number;
  crZgrzew?: number;
  hdgZabezp?: number;
  hdgOpak?: number;
  hdgPowierz?: number;
  hdgWykon?: number;
  hdgZgrzew?: number;
  sscLenTol?: number;
  sscFlatness?: number;
  sscSurface?: number;
  sscMaxWeight?: number;
  sscMarking?: number;
  sscEdging?: number;
  sscPacking?: number;
  sscLabels?: number;
  tons?: number;
}

interface Offer {
  id: number;
  offer_name: string;
  offer_data: OfferData;
  created_at: string;
  updated_at: string;
}

export default function OffersPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      const res = await fetch('/api/offers');
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers);
      }
    } catch (error) {
      console.error('Error fetching offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (offerId: number) => {
    router.push(`/calculator?edit=${offerId}`);
  };

  const handleDuplicate = async (offerId: number) => {
    setActionLoading(offerId);
    try {
      const res = await fetch(`/api/offers/${offerId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        setMessage({ type: 'success', text: t.offers.duplicated });
        fetchOffers();
      } else {
        setMessage({ type: 'error', text: t.offers.saveFailed });
      }
    } catch (error) {
      console.error('Error duplicating offer:', error);
      setMessage({ type: 'error', text: t.offers.saveFailed });
    } finally {
      setActionLoading(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDelete = async (offerId: number) => {
    if (!confirm(t.offers.confirmDelete)) return;
    
    setActionLoading(offerId);
    try {
      const res = await fetch(`/api/offers/${offerId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ type: 'success', text: t.offers.deleted });
        setOffers(offers.filter(o => o.id !== offerId));
      } else {
        setMessage({ type: 'error', text: t.offers.saveFailed });
      }
    } catch (error) {
      console.error('Error deleting offer:', error);
      setMessage({ type: 'error', text: t.offers.saveFailed });
    } finally {
      setActionLoading(null);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleExportPDF = (offer: Offer) => {
    const emptyClientInfo: ClientInfo = {
      firstName: '',
      lastName: '',
      company: '',
      address: '',
      nip: '',
      phone: '',
      email: '',
    };
    
    try {
      generateOfferPDF({
        offerName: offer.offer_name,
        offerId: offer.id,
        clientInfo: offer.offer_data.clientInfo || emptyClientInfo,
        zestawienie: offer.offer_data.zestawienie || [],
        createdAt: offer.created_at,
      }, t);
      setMessage({ type: 'success', text: t.pdf?.exportPdf ? 'PDF generated!' : 'PDF wygenerowany!' });
    } catch (error) {
      console.error('PDF generation error:', error);
      setMessage({ type: 'error', text: 'PDF generation error' });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateOfferTotal = (offer: Offer) => {
    const data = offer.offer_data;
    if (data.zestawienie && data.zestawienie.length > 0) {
      return data.zestawienie.reduce((sum, item) => sum + item.totalValue, 0);
    }
    return 0;
  };

  const getOfferItemCount = (offer: Offer) => {
    return offer.offer_data.zestawienie?.length || 0;
  };

  // CSS variables based on theme
  const cssVars = isDark ? {
    '--bg': '#0f1117',
    '--bg-panel': '#181c26',
    '--bg-card': '#1e2333',
    '--bg-input': '#141720',
    '--border': '#2a3048',
    '--border-hi': '#3d4a70',
    '--text-primary': '#e8ecf5',
    '--text-secondary': '#7b88aa',
    '--text-muted': '#4a536b',
    '--text-value': '#c8d4f0',
    '--accent-hrs': '#e8a020',
    '--accent-cr': '#3b8ef5',
    '--accent-hdg': '#2ecc71',
    '--accent-sum': '#f5475a',
  } : {
    '--bg': '#eef0f6',
    '--bg-panel': '#e2e6f0',
    '--bg-card': '#ffffff',
    '--bg-input': '#f4f5fa',
    '--border': '#b8c0d8',
    '--border-hi': '#7e90c0',
    '--text-primary': '#0d1220',
    '--text-secondary': '#2e3a5c',
    '--text-muted': '#6b789a',
    '--text-value': '#141e3a',
    '--accent-hrs': '#e8a020',
    '--accent-cr': '#3b8ef5',
    '--accent-hdg': '#2ecc71',
    '--accent-sum': '#f5475a',
  };

  return (
    <div 
      className="min-h-screen p-7 font-sans"
      style={{ 
        ...cssVars as React.CSSProperties,
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Header */}
      <header className="flex items-center gap-4 mb-7 pb-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-semibold text-[13px] text-white bg-gradient-to-br from-[#3b8ef5] to-[#e8a020]">
          SSC
        </div>
        <div>
          <h1 className="text-[17px] font-semibold tracking-wide text-[var(--text-primary)]">
            {t.offers.title}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
            {t.offers.subtitle} · {t.common.version}
          </p>
        </div>
        
        <LanguageSelector className="ml-auto" />
        
        <button
          onClick={() => setIsDark(!isDark)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5 hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
          <span>{isDark ? t.header.light : t.header.dark}</span>
        </button>
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
          }}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] px-3.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)] transition-colors"
        >
          {t.common.logout}
        </button>
      </header>

      {/* Navigation */}
      <Navigation isDark={isDark} />

      {/* Message Toast */}
      {message && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg border shadow-lg z-50 animate-[fadeIn_0.2s_ease] ${
          message.type === 'success' 
            ? 'bg-[rgba(46,204,113,0.15)] border-[#2ecc71] text-[#2ecc71]' 
            : 'bg-[rgba(245,71,90,0.15)] border-[#f5475a] text-[#f5475a]'
        }`}>
          {message.text}
        </div>
      )}

      {/* Offers Content */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
            {t.offers.title}
          </h2>
          <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">
            {offers.length} {t.offers.items}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">
            {t.common.loading}
          </div>
        ) : offers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[var(--text-secondary)] text-sm mb-4">{t.offers.empty}</p>
            <button
              onClick={() => router.push('/calculator')}
              className="px-4 py-2 bg-[var(--accent-cr)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t.navigation.calculator}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {offers.map((offer) => (
              <div 
                key={offer.id} 
                className={`p-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors ${
                  !isDark ? 'hover:bg-[rgba(0,0,0,0.02)]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[var(--text-primary)] truncate">
                      {offer.offer_name}
                    </h3>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-[var(--text-secondary)]">
                      <span>
                        📅 {t.offers.createdAt}: {formatDate(offer.created_at)}
                      </span>
                      <span>
                        📦 {getOfferItemCount(offer)} {t.offers.items}
                      </span>
                      <span className="font-mono text-[var(--accent-hrs)]">
                        💰 {calculateOfferTotal(offer).toFixed(2)} €
                      </span>
                    </div>
                    {/* Show items preview */}
                    {offer.offer_data.zestawienie && offer.offer_data.zestawienie.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {offer.offer_data.zestawienie.slice(0, 3).map((item, idx) => (
                          <span 
                            key={idx}
                            className={`px-2 py-1 rounded text-[10px] font-mono border ${
                              item.type === 'HRS' ? 'border-[var(--accent-hrs)] text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)]' :
                              item.type === 'CR' ? 'border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)]' :
                              'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.08)]'
                            }`}
                          >
                            {item.type} {item.thickness}×{item.width}×{item.length} {item.grade}
                          </span>
                        ))}
                        {offer.offer_data.zestawienie.length > 3 && (
                          <span className="px-2 py-1 rounded text-[10px] font-mono text-[var(--text-muted)]">
                            +{offer.offer_data.zestawienie.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleExportPDF(offer)}
                      disabled={!offer.offer_data.zestawienie || offer.offer_data.zestawienie.length === 0}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-[#2ecc71] text-[#2ecc71] bg-[rgba(46,204,113,0.08)] hover:bg-[rgba(46,204,113,0.15)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t.pdf?.exportPdf || 'Export PDF'}
                    >
                      📄 PDF
                    </button>
                    <button
                      onClick={() => handleEdit(offer.id)}
                      disabled={actionLoading === offer.id}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)] hover:bg-[rgba(59,142,245,0.15)] transition-colors disabled:opacity-50"
                      title={t.offers.editOffer}
                    >
                      ✏️ {t.common.edit}
                    </button>
                    <button
                      onClick={() => handleDuplicate(offer.id)}
                      disabled={actionLoading === offer.id}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-hrs)] text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)] hover:bg-[rgba(232,160,32,0.15)] transition-colors disabled:opacity-50"
                      title={t.offers.copyOffer}
                    >
                      📋 {t.common.duplicate}
                    </button>
                    <button
                      onClick={() => handleDelete(offer.id)}
                      disabled={actionLoading === offer.id}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] hover:bg-[rgba(245,71,90,0.15)] transition-colors disabled:opacity-50"
                      title={t.offers.deleteOffer}
                    >
                      🗑️ {t.common.delete}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-8 pt-5 border-t border-[var(--border)] text-center">
        <p className="text-[10px] text-[var(--text-muted)] font-mono">
          © 2025 · Steel Surcharge Calculator · {t.common.version}
        </p>
      </footer>
    </div>
  );
}
