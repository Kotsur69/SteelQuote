'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import type { Language } from '@/lib/translations';
import type { AccessTexts } from './types';
import { pl } from './pl';
import { en } from './en';
import { cs } from './cs';
import { de } from './de';

export type { AccessTexts };

export const ACCESS_TEXTS: Record<Language, AccessTexts> = { pl, en, cs, de };

/** Strings of the flow / role model in the active UI language. */
export function useAccessT(): AccessTexts {
  const { language } = useLanguage();
  return ACCESS_TEXTS[language] ?? pl;
}

/** Translated message for an API error body carrying a lib/access/errors.ts `code`. */
export function accessErrorText(t: AccessTexts, body: { code?: unknown; error?: unknown } | null, fallback: string): string {
  const code = body?.code;
  if (typeof code === 'string' && code in t.errors) return t.errors[code as keyof AccessTexts['errors']];
  return typeof body?.error === 'string' ? body.error : fallback;
}
