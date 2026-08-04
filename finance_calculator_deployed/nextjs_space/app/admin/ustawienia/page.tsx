'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/currency';
import type { PglPriceHistoryEntry } from '@/app/api/settings/pgl-history/route';
import { exportPglHistoryToExcel } from '@/lib/pglHistoryExport';

// Spójna paleta per typ stali w całym panelu (te same zmienne, co w Calculatorze):
// HRS = pomarańczowy, CR = niebieski, HDG = zielony.
const STEEL_TYPE_COLOR: Record<'HRS' | 'CR' | 'HDG', string> = {
  HRS: 'var(--accent-hrs)',
  CR: 'var(--accent-cr)',
  HDG: 'var(--accent-hdg)',
};

// Pola trzymamy jako string, a nie number: pole musi pozwolić wpisać "4," albo wyczyścić
// zawartość w trakcie edycji. Konwersja i walidacja następuje przy zapisie — a serwer
// waliduje drugi raz (app/api/settings/route.ts), bo to on jest granicą zaufania.
type FormState = Record<keyof AppSettings, string>;

function toForm(s: AppSettings): FormState {
  return {
    eurPlnRate: String(s.eurPlnRate),
    pglBaseHrs: String(s.pglBaseHrs),
    pglBaseCr: String(s.pglBaseCr),
    pglBaseHdg: String(s.pglBaseHdg),
    transportBase: String(s.transportBase),
  };
}

export default function AdminSettingsPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(toForm(DEFAULT_SETTINGS));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<PglPriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/settings/pgl-history');
      if (res.ok) {
        const { history: rows } = await res.json();
        setHistory(rows as PglPriceHistoryEntry[]);
      }
    } catch (error) {
      console.error('Error loading PGL price history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const { settings } = await res.json();
          setForm(toForm(settings as AppSettings));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    })();
    loadHistory();
  }, [loadHistory]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eurPlnRate: form.eurPlnRate,
          pglBaseHrs: form.pglBaseHrs,
          pglBaseCr: form.pglBaseCr,
          pglBaseHdg: form.pglBaseHdg,
          transportBase: form.transportBase,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setForm(toForm(data.settings as AppSettings));
        setMessage({ type: 'success', text: t.admin.settings.saved });
        loadHistory();
      } else {
        // Serwer zwraca konkretny powód (np. "Kurs EUR/PLN: wartość musi być w zakresie 0.0001-100").
        setMessage({ type: 'error', text: data.error || t.admin.settings.saveFailed });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: t.admin.settings.saveFailed });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const fields: { key: keyof AppSettings; label: string; hint: string; unit: string; step: string; color?: string }[] = [
    {
      key: 'eurPlnRate',
      label: t.admin.settings.eurPlnRate,
      hint: t.admin.settings.eurPlnRateHint,
      unit: 'PLN / 1 EUR',
      step: '0.0001',
    },
    {
      key: 'pglBaseHrs',
      label: t.admin.settings.pglBaseHrs,
      hint: t.admin.settings.pglBaseHint,
      unit: '€/t',
      step: '0.01',
      color: STEEL_TYPE_COLOR.HRS,
    },
    {
      key: 'pglBaseCr',
      label: t.admin.settings.pglBaseCr,
      hint: t.admin.settings.pglBaseHint,
      unit: '€/t',
      step: '0.01',
      color: STEEL_TYPE_COLOR.CR,
    },
    {
      key: 'pglBaseHdg',
      label: t.admin.settings.pglBaseHdg,
      hint: t.admin.settings.pglBaseHint,
      unit: '€/t',
      step: '0.01',
      color: STEEL_TYPE_COLOR.HDG,
    },
    {
      key: 'transportBase',
      label: t.admin.settings.transportBase,
      hint: t.admin.settings.transportBaseHint,
      unit: '€/t',
      step: '0.01',
    },
  ];

  return (
    <AdminLayout>
      {loading ? (
        <div className="p-8 text-center text-[var(--text-secondary)]">{t.common.loading}</div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-hrs)]" />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
                {t.admin.settings.title}
              </h2>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono ml-auto">
                {t.admin.settings.subtitle}
              </span>
            </div>

            <div className="py-2">
              {fields.map((field) => (
                <div key={field.key} className="px-4 py-3 border-b border-[rgba(42,48,72,0.5)]">
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor={field.key}
                      className="flex-1 flex items-center gap-1.5 text-xs"
                      style={{ color: field.color ?? 'var(--text-secondary)' }}
                    >
                      {field.color && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: field.color }}
                        />
                      )}
                      {field.label}
                    </label>
                    <input
                      id={field.key}
                      type="number"
                      min="0"
                      step={field.step}
                      value={form[field.key]}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-[13px] font-medium text-right w-[120px] focus:border-[var(--accent-cr)] outline-none"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] font-mono w-[70px]">
                      {field.unit}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{field.hint}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)]">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded bg-gradient-to-r from-[#e8a020] to-[#f0c040] text-[#0d1220] font-mono text-xs font-bold tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? '…' : t.admin.settings.save}
              </button>
              {message && (
                <span
                  className="text-xs font-mono"
                  style={{
                    color: message.type === 'success' ? 'var(--accent-hdg)' : 'var(--accent-sum)',
                  }}
                >
                  {message.text}
                </span>
              )}
            </div>
          </div>

          {/* Bez tego ostrzeżenia admin nie ma jak wiedzieć, że zmiana kursu NIE rusza ofert
              już wycenionych — a to jest tu najważniejsza zasada działania systemu. */}
          <div className="flex gap-2.5 px-4 py-3 rounded-md border-l-[3px] border-[var(--accent-cr)] bg-[rgba(59,142,245,0.08)]">
            <span className="text-base leading-none">ℹ</span>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t.admin.settings.frozenRateNotice}
            </p>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" />
              <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">
                {t.admin.settings.historyTitle}
              </h2>
              <button
                onClick={() => exportPglHistoryToExcel(history)}
                disabled={history.length === 0}
                className="ml-auto px-3 py-1.5 rounded bg-[var(--bg-input)] border border-[var(--border)] text-[10px] font-mono font-semibold tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-cr)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t.admin.settings.historyDownload}
              </button>
            </div>

            {historyLoading ? (
              <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                {t.admin.settings.historyLoading}
              </div>
            ) : history.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                {t.admin.settings.historyEmpty}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="text-left font-medium px-4 py-2">{t.admin.settings.historyColType}</th>
                      <th className="text-right font-medium px-4 py-2">{t.admin.settings.historyColOld}</th>
                      <th className="text-right font-medium px-4 py-2">{t.admin.settings.historyColNew}</th>
                      <th className="text-right font-medium px-4 py-2">{t.admin.settings.historyColDelta}</th>
                      <th className="text-left font-medium px-4 py-2">{t.admin.settings.historyColBy}</th>
                      <th className="text-left font-medium px-4 py-2">{t.admin.settings.historyColWhen}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => {
                      const delta = entry.newPrice - entry.oldPrice;
                      return (
                        <tr key={entry.id} className="border-b border-[rgba(42,48,72,0.5)] last:border-b-0">
                          <td className="px-4 py-2 font-mono font-semibold">
                            <span
                              className="inline-flex items-center gap-1.5"
                              style={{ color: STEEL_TYPE_COLOR[entry.steelType] }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: STEEL_TYPE_COLOR[entry.steelType] }}
                              />
                              {entry.steelType}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[var(--text-secondary)]">
                            {entry.oldPrice.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[var(--text-primary)]">
                            {entry.newPrice.toFixed(2)}
                          </td>
                          <td
                            className="px-4 py-2 text-right font-mono font-semibold"
                            style={{ color: delta >= 0 ? 'var(--accent-sum)' : 'var(--accent-hdg)' }}
                          >
                            {delta >= 0 ? '+' : ''}
                            {delta.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-[var(--text-secondary)]">
                            {entry.changedByName || entry.changedByEmail || '—'}
                          </td>
                          <td className="px-4 py-2 font-mono text-[var(--text-muted)]">
                            {new Date(entry.changedAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
