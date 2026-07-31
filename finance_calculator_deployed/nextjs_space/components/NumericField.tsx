'use client';

import { useEffect, useRef, useState } from 'react';

interface NumericFieldProps {
  value: number;
  onChange: (value: number) => void;
  parse?: (raw: string) => number;
  step?: string;
  min?: string;
  className?: string;
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
}: NumericFieldProps) {
  const [text, setText] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

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
      className={className}
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
          setText(String(value));
        }
      }}
    />
  );
}
