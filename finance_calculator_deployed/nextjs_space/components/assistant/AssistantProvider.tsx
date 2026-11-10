'use client';

// Chat state of the assistant, held ABOVE the router (mounted in app/providers.tsx) so the
// conversation survives navigation between pages and is shared by the bubble panel and the
// full page /asystent (plan D17). Nothing is persisted: a reload clears the chat (plan D9).

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AnswerBlock } from '@/lib/assistant/blocks';
import { panelLang, STRINGS } from './strings';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  blocks: AnswerBlock[];
  /** Assistant turn still streaming. */
  pending: boolean;
  /** Tool running right now ("Sprawdzam dane..."). */
  working: boolean;
  /** Server id of the turn - the handle for feedback. null for errors and stopped turns. */
  turnId: number | null;
  cached: boolean;
  error: boolean;
}

interface AssistantState {
  messages: ChatMessage[];
  busy: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  send: (text: string) => void;
  stop: () => void;
  newChat: () => void;
}

const AssistantContext = createContext<AssistantState | null>(null);

export function useAssistant(): AssistantState {
  const state = useContext(AssistantContext);
  if (!state) throw new Error('useAssistant must be used inside AssistantProvider');
  return state;
}

type ServerEvent =
  | { type: 'text'; delta: string }
  | { type: 'reset' }
  | { type: 'tool'; name: string }
  | { type: 'final'; text: string; blocks: AnswerBlock[]; turnId: number | null; cached: boolean }
  | { type: 'error'; message: string };

/** Route + the offer open in the calculator, so "ta oferta" means something. */
function pageContext(): { path: string; offerId?: number } | undefined {
  const path = window.location.pathname;
  if (!/^\/[\w\-/]*$/.test(path)) return undefined;
  const edit = Number.parseInt(new URLSearchParams(window.location.search).get('edit') ?? '', 10);
  return path.startsWith('/calculator') && Number.isInteger(edit) && edit > 0 ? { path, offerId: edit } : { path };
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const lang = panelLang(language);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const patch = useCallback((id: number, change: (m: ChatMessage) => ChatMessage) => {
    setMessages((list) => list.map((m) => (m.id === id ? change(m) : m)));
  }, []);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || abortRef.current) return;

      // Only completed text turns go back to the server; it re-runs tools itself.
      const history = messagesRef.current
        .filter((m) => !m.pending && !m.error && m.text)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 6000) }));

      const blank = { blocks: [], pending: false, working: false, turnId: null, cached: false, error: false };
      const userMessage: ChatMessage = { ...blank, id: nextId.current++, role: 'user', text };
      const answerId = nextId.current++;
      const answer: ChatMessage = { ...blank, id: answerId, role: 'assistant', text: '', pending: true };
      setMessages((list) => [...list, userMessage, answer]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const finish = (change: (m: ChatMessage) => ChatMessage) => patch(answerId, (m) => ({ ...change(m), pending: false, working: false }));

      const apply = (event: ServerEvent) => {
        if (event.type === 'text') patch(answerId, (m) => ({ ...m, text: m.text + event.delta, working: false }));
        else if (event.type === 'reset') patch(answerId, (m) => ({ ...m, text: '' }));
        else if (event.type === 'tool') patch(answerId, (m) => ({ ...m, working: true }));
        else if (event.type === 'final') finish((m) => ({ ...m, text: event.text, blocks: event.blocks, turnId: event.turnId, cached: event.cached }));
        else finish((m) => ({ ...m, text: event.message, error: true }));
      };

      void (async () => {
        try {
          const response = await fetch('/api/assistant/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history, lang, page: pageContext() }),
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            finish((m) => ({ ...m, text: STRINGS[lang].networkError, error: true }));
            return;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
              if (!frame.startsWith('data: ')) continue;
              try {
                apply(JSON.parse(frame.slice(6)) as ServerEvent);
              } catch {
                // A malformed frame is skipped; the final event still settles the turn.
              }
            }
          }
          // The stream ended without a final event (connection cut).
          finish((m) => (m.pending ? { ...m, text: m.text || STRINGS[lang].networkError, error: !m.text } : m));
        } catch {
          const stopped = controller.signal.aborted;
          finish((m) => ({ ...m, text: stopped ? m.text || STRINGS[lang].stopped : STRINGS[lang].networkError, error: !stopped }));
        } finally {
          abortRef.current = null;
          setBusy(false);
        }
      })();
    },
    [lang, patch]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  const value = useMemo(
    () => ({ messages, busy, open, setOpen, send, stop, newChat }),
    [messages, busy, open, send, stop, newChat]
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
