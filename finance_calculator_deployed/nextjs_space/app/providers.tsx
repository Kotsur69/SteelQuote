'use client';
import React, { useState, useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/lib/theme-context';
import { LangProvider } from '@/lib/lang-context';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="min-h-screen bg-skin-bg" />;
  return (
    <SessionProvider>
      <ThemeProvider>
        <LangProvider>
          {children}
        </LangProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
