'use client';

// The conversation itself: message list, suggestions on the empty state, composer. Used by the
// bubble panel and by the full page /asystent - both read the same state from AssistantProvider.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Square, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { AnswerBlocks } from './AnswerBlocks';
import { useAssistant, type ChatMessage } from './AssistantProvider';
import { panelLang, STRINGS, type PanelStrings } from './strings';

const MAX_CHARS = 2000;

/** Model text is rendered as text. The only formatting honoured is **bold** - no HTML, no links. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}

function Feedback({ turnId, strings }: { turnId: number; strings: PanelStrings }) {
  const [rating, setRating] = useState<1 | -1 | null>(null);

  const rate = (value: 1 | -1) => {
    setRating(value);
    void fetch('/api/assistant/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnId, rating: value }),
    }).catch(() => setRating(null));
  };

  const button = (value: 1 | -1, label: string, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={rating === value}
      onClick={() => rate(value)}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:bg-[var(--accent-tint-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${rating === value ? 'text-accent' : 'text-txt-muted'}`}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );

  return (
    <div className="mt-1 flex items-center gap-1">
      {button(1, strings.helpful, ThumbsUp)}
      {button(-1, strings.notHelpful, ThumbsDown)}
      <span role="status" className="text-xs text-txt-muted">{rating !== null ? strings.thanks : ''}</span>
    </div>
  );
}

type MessageProps = {
  message: ChatMessage;
  strings: PanelStrings;
  onChoose: ((value: string) => void) | null;
};

function Message({ message, strings, onChoose }: MessageProps) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <p className="m-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[var(--accent-tint-strong)] px-3.5 py-2 text-sm leading-relaxed text-txt-primary">
          <span className="sr-only">{strings.you}: </span>
          {message.text}
        </p>
      </li>
    );
  }

  const waiting = message.pending && !message.text;
  return (
    <li className="min-w-0">
      <span className="sr-only">{strings.assistant}: </span>
      {waiting ? (
        <p className="m-0 flex items-center gap-2 text-sm text-txt-muted">
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent motion-safe:animate-pulse" />
          {strings.thinking}
        </p>
      ) : (
        <p className={`m-0 whitespace-pre-wrap break-words text-sm leading-relaxed ${message.error ? 'text-[#c0392b] dark:text-[#ff8a80]' : 'text-txt-primary'}`} role={message.error ? 'alert' : undefined}>
          <RichText text={message.text} />
          {message.pending && message.working && <span className="ml-2 text-txt-muted">{strings.thinking}</span>}
        </p>
      )}
      <AnswerBlocks blocks={message.blocks} strings={strings} onChoose={onChoose} />
      {!message.pending && message.turnId !== null && (
        <div className="flex items-center gap-2">
          <Feedback turnId={message.turnId} strings={strings} />
          {message.cached && <span className="text-xs text-txt-muted">{strings.cached}</span>}
        </div>
      )}
    </li>
  );
}

type ChatProps = {
  /** Focus the composer when the chat appears (the panel was just opened). */
  autoFocus?: boolean;
};

export function AssistantChat({ autoFocus = false }: ChatProps) {
  const { language } = useLanguage();
  const strings = STRINGS[panelLang(language)];
  const { messages, busy, send, stop } = useAssistant();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Follow the answer while it streams.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (text: string) => {
    if (busy || !text.trim()) return;
    send(text);
    setDraft('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter makes a new line; never while an IME composition is open.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  };

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-3">
            <h2 className="m-0 text-lg font-semibold text-txt-primary">{strings.emptyTitle}</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {strings.suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="min-h-[44px] w-full cursor-pointer rounded-md border border-brd bg-[var(--bg-input)] px-3 text-left text-sm text-txt-secondary transition-colors duration-150 hover:border-brd-hi hover:text-txt-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-5 p-0">
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                strings={strings}
                // Only the newest answer's buttons act: an old question is no longer pending.
                onChoose={message.id === lastId && !busy ? submit : null}
              />
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-brd px-3 pb-2 pt-3">
        <div className="flex items-end gap-2 rounded-xl border border-brd-hi bg-[var(--bg-input)] p-1.5 focus-within:border-accent">
          <label htmlFor="assistant-input" className="sr-only">{strings.inputLabel}</label>
          <textarea
            id="assistant-input"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleKeyDown}
            rows={Math.min(5, Math.max(1, draft.split('\n').length))}
            placeholder={strings.placeholder}
            // Empty: one clipped placeholder line, no scrollbar. With text: grows, then scrolls.
            className={`max-h-32 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-txt-primary placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-txt-muted focus:outline-none sm:text-sm ${draft ? 'overflow-y-auto' : 'overflow-hidden'}`}
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label={strings.stop}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-brd-hi text-txt-secondary transition-colors duration-150 hover:text-txt-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Square aria-hidden className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label={strings.send}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40"
              style={{ background: 'var(--am-gradient)' }}
            >
              <ArrowUp aria-hidden className="h-5 w-5" />
            </button>
          )}
        </div>
        <p className="m-0 mt-1.5 px-1 text-[11px] leading-snug text-txt-muted">{strings.notice}</p>
      </form>
    </div>
  );
}
