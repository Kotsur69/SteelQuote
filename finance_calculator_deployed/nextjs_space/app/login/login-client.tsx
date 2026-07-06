'use client';
import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Mail, Lock, User, Loader2, Calculator, Sun, Moon, Globe } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';
import { useLang } from '@/lib/lang-context';
import { t } from '@/lib/translations';

export default function LoginClient() {
  const { dark, toggle } = useTheme();
  const { lang, setLang } = useLang();
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError('');
    setLoading(true);

    try {
      if (isSignup) {
        if (password !== confirmPassword) {
          setError(t('passwordMismatch', lang));
          setLoading(false);
          return;
        }
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res?.json?.();
        if (!res?.ok) {
          setError(data?.error ?? t('signupError', lang));
          setLoading(false);
          return;
        }
        const result = await signIn('credentials', { email, password, redirect: false });
        if (result?.ok) {
          router.replace('/');
        } else {
          setError(t('loginAfterSignupError', lang));
        }
      } else {
        const result = await signIn('credentials', { email, password, redirect: false });
        if (result?.ok) {
          router.replace('/');
        } else {
          setError(t('loginError', lang));
        }
      }
    } catch (err: any) {
      setError(err?.message ?? t('genericError', lang));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-skin-bg px-4 relative">
      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
          className="p-2.5 rounded-lg border border-brd text-txt-secondary hover:border-brd-hi transition bg-skin-card flex items-center gap-1"
          title={t('language', lang)}
        >
          <Globe size={18} />
          <span className="text-xs font-medium">{lang?.toUpperCase?.()}</span>
        </button>
        <button
          onClick={toggle}
          className="p-2.5 rounded-lg border border-brd text-txt-secondary hover:border-brd-hi transition bg-skin-card"
          title={dark ? t('lightMode', lang) : t('darkMode', lang)}
        >
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent text-white mb-4 shadow-lg">
            <Calculator size={32} />
          </div>
          <h1 className="text-2xl font-bold text-txt-primary">{t('appTitle', lang)}</h1>
          <p className="text-txt-muted mt-1">{t('loginSubtitle', lang)}</p>
        </div>

        <div className="bg-skin-card rounded-2xl shadow-xl p-8 border border-brd">
          <div className="flex mb-6 bg-skin-panel rounded-lg p-1">
            <button
              onClick={() => { setIsSignup(false); setError(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                !isSignup ? 'bg-accent text-white shadow' : 'text-txt-secondary'
              }`}
            >
              <LogIn size={16} className="inline mr-1" /> {t('login', lang)}
            </button>
            <button
              onClick={() => { setIsSignup(true); setError(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                isSignup ? 'bg-accent text-white shadow' : 'text-txt-secondary'
              }`}
            >
              <UserPlus size={16} className="inline mr-1" /> {t('signup', lang)}
            </button>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-4 p-3 rounded-lg bg-accent-sum/10 text-accent-sum text-sm"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                <input
                  type="text"
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e?.target?.value ?? '')}
                  placeholder={t('name', lang)}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-brd bg-skin-input text-txt-primary focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
                />
              </div>
            )}
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e?.target?.value ?? '')}
                placeholder={t('email', lang)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-brd bg-skin-input text-txt-primary focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
              />
            </div>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
              <input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e?.target?.value ?? '')}
                placeholder={t('password', lang)}
                required
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-brd bg-skin-input text-txt-primary focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
              />
            </div>
            {isSignup && (
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e?.target?.value ?? '')}
                  placeholder={t('confirmPassword', lang)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-brd bg-skin-input text-txt-primary focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-accent hover:opacity-90 text-white font-medium transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : isSignup ? <UserPlus size={18} /> : <LogIn size={18} />}
              {isSignup ? t('createAccount', lang) : t('login', lang)}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
