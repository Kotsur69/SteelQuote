'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import AdminLayout from '@/components/AdminLayout';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/currency';

// Pola trzymamy jako string, a nie number: pole musi pozwolić wpisać "4," albo wyczyścić
// zawartość w trakcie edycji. Konwersja i walidacja następuje przy zapisie — a serwer
// waliduje drugi raz (app/api/settings/route.ts), bo to on jest granicą zaufania.
type FormState = Record<keyof AppSettings, string>;

function toForm(s: AppSettings): FormState {
  return {
    eurPlnRate: String(s.eurPlnRate),
    pglBase: String(s.pglBase),
    transportBase: String(s.transportBase),
  };
}

export default function AdminSettingsPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(toForm(DEFAULT_SETTINGS));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eurPlnRate: form.eurPlnRate,
          pglBase: form.pglBase,
          transportBase: form.transportBase,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setForm(toForm(data.settings as AppSettings));
        setMessage({ type: 'success', text: t.admin.settings.saved });
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

  const fields: { key: keyof AppSettings; label: string; hint: string; unit: string; step: string }[] = [
    {
      key: 'eurPlnRate',
      label: t.admin.settings.eurPlnRate,
      hint: t.admin.settings.eurPlnRateHint,
      unit: 'PLN / 1 EUR',
      step: '0.0001',
    },
    {
      key: 'pglBase',
      label: t.admin.settings.pglBase,
      hint: t.admin.settings.pglBaseHint,
      unit: '€/t',
      step: '0.01',
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
                    <label htmlFor={field.key} className="flex-1 text-xs text-[var(--text-secondary)]">
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
        </div>
      )}
    </AdminLayout>
  );
}
