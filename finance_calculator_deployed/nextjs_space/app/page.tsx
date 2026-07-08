'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage, LanguageSelector } from '@/contexts/LanguageContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t.login.loginError);
        setLoading(false);
        return;
      }

      router.push('/calculator');
    } catch {
      setError(t.login.connectionError);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-[#1e2333] border border-[#2a3048] rounded-lg p-8 shadow-xl">
          {/* Header with Logo and Language Selector */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-[#3b8ef5] to-[#e8a020] rounded-lg flex items-center justify-center">
                <span className="text-white font-mono font-bold text-lg">SSC</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-[#e8ecf5]">
                  {t.login.title}
                </h1>
                <p className="text-sm text-[#7b88aa] font-mono">
                  {t.login.subtitle}
                </p>
              </div>
            </div>
            <LanguageSelector />
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold tracking-wider uppercase text-[#7b88aa] mb-2">
                {t.login.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#141720] border border-[#2a3048] rounded px-4 py-3 text-[#e8ecf5] font-mono text-sm focus:border-[#3b8ef5] focus:outline-none transition-colors"
                placeholder={t.login.emailPlaceholder}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold tracking-wider uppercase text-[#7b88aa] mb-2">
                {t.login.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#141720] border border-[#2a3048] rounded px-4 py-3 text-[#e8ecf5] font-mono text-sm focus:border-[#3b8ef5] focus:outline-none transition-colors"
                placeholder={t.login.passwordPlaceholder}
                required
              />
            </div>

            {error && (
              <div className="bg-[rgba(245,71,90,0.1)] border border-[rgba(245,71,90,0.4)] rounded px-4 py-3 text-[#f5475a] text-sm font-mono">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-[#e8a020] to-[#f0c040] text-[#0d1220] font-mono font-bold text-sm tracking-wider rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? t.login.loggingIn : t.login.loginButton}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[#4a536b] font-mono">
            {t.login.copyright}
          </p>
        </div>
      </div>
    </div>
  );
}
