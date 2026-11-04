'use client';

import { useEffect, useRef, useState } from 'react';

interface NumericFieldProps {
  value: number;
  onChange: (value: number) => void;
  parse?: (raw: string) => number;
  step?: string;
  min?: string;
  className?: string;
  /** Read-only for the current role (e.g. no permission to change the PGL base). */
  disabled?: boolean;
  title?: string;
  /**
   * Empty the field on focus so a new value can be typed without erasing the old
   * one first. The old value stays committed (and visible as a placeholder) until
   * a valid number is typed; leaving the field empty restores it.
   */
  clearOnFocus?: boolean;
  /**
   * Replaces the onChange(previous) call when an abandoned edit rolls back, for callers where
   * committing a value has side effects (the sheets field would otherwise snap typed tons).
   */
  onRevert?: () => void;
  /** Show the committed value on blur, so "3.5" under an integer parse does not stay on screen. */
  normalizeOnBlur?: boolean;
}

// Kontrolowany <input type="number"> w Reakcie, który przy pustym polu od razu
// wymusza wartość "0" (parseInt("")||0), gubi to, co user właśnie kasował/wpisywał.
// Tu commit do zewnętrznego stanu leci na bieżąco (żeby kalkulacja liczyła się
// live), ale WYŚWIETLANY tekst pola jest osobnym buforem, który reaguje na
// zewnętrzne zmiany tylko gdy pole nie jest aktualnie edytowane (fokus).
export default function NumericField({
  value,
  onChange,
  parse = raw => parseFloat(raw),
  step,
  min,
  className,
  disabled,
  title,
  clearOnFocus = false,
  onRevert,
  normalizeOnBlur = false,
}: NumericFieldProps) {
  const [text, setText] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  // Value at the moment the field gained focus - what an empty blur restores.
  // Empty or unparsable text is never committed, so totals never see NaN mid-edit.
  const valueAtFocusRef = useRef(value);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="number"
      value={text}
      step={step}
      min={min}
      disabled={disabled}
      title={title}
      placeholder={clearOnFocus ? String(value) : undefined}
      aria-disabled={disabled || undefined}
      className={`${className ?? ''}${disabled ? ' opacity-60 cursor-not-allowed' : ''}`}
      onFocus={() => {
        valueAtFocusRef.current = value;
        if (clearOnFocus) setText('');
      }}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        const parsed = parse(raw);
        if (!Number.isNaN(parsed)) {
          onChange(parsed);
        }
      }}
      onBlur={() => {
        if (text.trim() === '' || Number.isNaN(parse(text))) {
          // Typing "5" then erasing it already committed 5 - roll back to the
          // value the field had before this edit, not the last keystroke.
          const previous = valueAtFocusRef.current;
          setText(String(previous));
          if (onRevert) onRevert();
          else if (previous !== value) onChange(previous);
        } else if (normalizeOnBlur) {
          setText(String(value));
        }
      }}
    />
  );
}
