'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '@/lib/lang-context';
import { t } from '@/lib/translations';
import { FileText, Trash2, Copy, Loader2, Calendar, Edit3, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OrderItem, ClientInfo } from './calculator-panel';

export interface SavedOffer {
  id: string;
  name: string;
  data: { items: OrderItem[]; clientInfo?: ClientInfo };
  createdAt: string;
  updatedAt: string;
}

interface Props {
  onEditOffer: (offer: SavedOffer) => void;
}

export default function OffersPanel({ onEditOffer }: Props) {
  const { lang } = useLang();
  const [offers, setOffers] = useState<SavedOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/offers');
      if (res?.ok) {
        const data = await res?.json?.();
        setOffers(data ?? []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' });
      if (res?.ok) {
        setOffers(prev => prev.filter(o => o.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
    setDeleteId(null);
  }, []);

  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const handlePdfExport = useCallback(async (offer: SavedOffer) => {
    setPdfLoadingId(offer.id);
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: offer.data?.items ?? [],
          clientInfo: offer.data?.clientInfo ?? {},
          offerName: offer.name || 'Oferta cenowa',
          offerDate: offer.updatedAt ? new Date(offer.updatedAt).toLocaleDateString('pl-PL') : new Date().toLocaleDateString('pl-PL'),
        }),
      });
      if (!res.ok) {
        alert('Nie udało się wygenerować PDF');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(offer.name || 'oferta').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Błąd generowania PDF');
    } finally {
      setPdfLoadingId(null);
    }
  }, []);

  const handleDuplicate = useCallback(async (offer: SavedOffer) => {
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: (offer.name ?? '') + ` (${t('copy', lang)})`,
          data: offer.data ?? {},
        }),
      });
      if (res?.ok) {
        fetchOffers();
      }
    } catch (err) {
      console.error(err);
    }
  }, [fetchOffers]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="col-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <FileText size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{t('noOffers', lang)}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
          {t('noOffersHint', lang)}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <AnimatePresence>
        {offers.map((offer, idx) => {
          const items: OrderItem[] = offer.data?.items ?? [];
          const totalTons = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
          const totalValue = items.reduce((s, i) => s + (i.pricePerTon ?? 0) * (i.quantity ?? 0), 0);
          const types = [...new Set(items.map(i => i.steelType))];

          return (
            <motion.div
              key={offer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.03 }}
              className="col-card"
              style={{ overflow: 'hidden' }}
            >
              {/* Header row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', borderBottom: expandedIds.has(offer.id) ? '1px solid var(--border)' : 'none',
                cursor: 'pointer', userSelect: 'none'
              }}
                onClick={() => toggleExpand(offer.id)}
              >
                <span style={{
                  fontSize: '12px', color: 'var(--text-muted)', transition: 'transform .2s',
                  transform: expandedIds.has(offer.id) ? 'rotate(180deg)' : 'rotate(0)',
                  flexShrink: 0
                }}>▼</span>
                <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {offer.name ?? t('unnamed', lang)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '10px', marginTop: '2px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Calendar size={10} />
                      {offer.updatedAt ? new Date(offer.updatedAt).toLocaleDateString('pl-PL') : '-'}
                    </span>
                    <span>{items.length} {t('items', lang)}</span>
                    {!expandedIds.has(offer.id) && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-sum)' }}>
                        {totalValue.toFixed(2)} €
                      </span>
                    )}
                  </div>
                </div>

                {/* Type badges */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {types.map(tp => (
                    <span key={tp} className={`z-type-badge z-type-${tp}`}>{tp}</span>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handlePdfExport(offer)}
                    className="z-action-btn"
                    title={t('downloadPdf', lang)}
                    disabled={pdfLoadingId === offer.id}
                    style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: pdfLoadingId === offer.id ? 'var(--border)' : 'transparent', cursor: pdfLoadingId === offer.id ? 'wait' : 'pointer', color: '#dc2626' }}
                  >
                    {pdfLoadingId === offer.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  </button>
                  <button
                    onClick={() => onEditOffer(offer)}
                    className="z-action-btn"
                    title={t('editOffer', lang)}
                    style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    onClick={() => handleDuplicate(offer)}
                    className="z-action-btn"
                    title={t('duplicateOffer', lang)}
                    style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteId(offer.id)}
                    className="z-action-btn"
                    title={t('deleteOffer', lang)}
                    style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--accent-sum)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Items summary table */}
              {expandedIds.has(offer.id) && items.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th className="zt" style={{ textAlign: 'center', width: '30px' }}>#</th>
                        <th className="zt" style={{ textAlign: 'left' }}>{t('colDesc', lang)}</th>
                        <th className="zt" style={{ textAlign: 'center' }}>{t('colType', lang)}</th>
                        <th className="zt">{t('colPriceT', lang)}</th>
                        <th className="zt">{t('colQty', lang)}</th>
                        <th className="zt">{t('colValue', lang)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={item.id ?? i} className="zr">
                          <td style={{ textAlign: 'center', fontSize: '10px' }}>{i + 1}</td>
                          <td style={{ textAlign: 'left' }}>
                            <div className="z-desc-grade">{item.grade}</div>
                            <div className="z-desc-dim">
                              {item.thickness}×{item.width}
                              {!item.isCoil && <>×{item.length}</>}
                              {item.coating ? ` / ${item.coating}` : ''}
                              {item.isCoil ? ' (KRĄG)' : ''}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`z-type-badge z-type-${item.steelType}`}>{item.steelType}</span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.pricePerTon?.toFixed(2)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.quantity?.toFixed(2)} t</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--accent-sum)' }}>
                            {(item.pricePerTon * item.quantity).toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
                        <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', borderBottom: 'none' }}>
                          {t('total', lang)}:
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--accent-sum)', borderBottom: 'none' }}></td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-value)', borderBottom: 'none', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                          {totalTons.toFixed(2)} t
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--accent-sum)', borderBottom: 'none', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                          {totalValue.toFixed(2)} €
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Delete confirmation */}
              {expandedIds.has(offer.id) && deleteId === offer.id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    padding: '10px 14px', borderTop: '1px solid var(--border)',
                    background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', gap: '10px'
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--accent-sum)', flex: 1 }}>
                    {t('confirmDelete', lang)}
                  </span>
                  <button
                    onClick={() => handleDelete(offer.id)}
                    style={{
                      padding: '4px 14px', borderRadius: '4px', background: 'var(--accent-sum)',
                      color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: 600
                    }}
                  >
                    {t('yes', lang)}
                  </button>
                  <button
                    onClick={() => setDeleteId(null)}
                    style={{
                      padding: '4px 14px', borderRadius: '4px', background: 'transparent',
                      color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '11px', cursor: 'pointer'
                    }}
                  >
                    {t('no', lang)}
                  </button>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
