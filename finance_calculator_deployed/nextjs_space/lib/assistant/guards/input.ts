// Input guard (docs/ai-assistant-plan.md 9.1 point 5): bounds and cleans what the user typed
// before it reaches the model. Injection phrasings are only FLAGGED for the log - the real
// defence is that every tool runs with the user's own permissions and the model cannot execute
// anything (section 7), so a hijacked model still cannot see or do more than the user.

export const MAX_MESSAGE_CHARS = 2000;

// Zero-width and bidi controls (used to hide instructions), plus C0/C1 controls except \n and \t.
const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤﻿\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

const INJECTION_PATTERNS: RegExp[] = [
  /zignoruj\s+(wszystkie\s+)?(poprzednie|powy[zż]sze|dotychczasowe)\s+(instrukcje|polecenia|zasady)/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/i,
  /ignore\s+all\s+rules/i,
  /jeste[sś]\s+teraz\s+(administratorem|adminem)/i,
  /you\s+are\s+now\s+(an?\s+)?(admin|administrator|developer)/i,
  /(prompt\s+systemowy|system\s+prompt)/i,
  /(klucz\s+api|api\s+key)/i,
];

export type InputCheck =
  | { ok: true; text: string; injectionSuspected: boolean }
  | { ok: false; reason: 'empty' | 'too_long' };

export function checkInput(raw: unknown): InputCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const text = raw.replace(INVISIBLE_RE, '').trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (text.length > MAX_MESSAGE_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true, text, injectionSuspected: INJECTION_PATTERNS.some((re) => re.test(text)) };
}
