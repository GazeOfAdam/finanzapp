import React, { useEffect, useState } from 'react';
import { formatCentsToInputString, parseEuroInputToCents } from '../finance';

export interface CentInputProps {
  id: string;
  label?: string;
  cents: number;
  onCommitCents: (newCents: number) => void;
  placeholder?: string;
  helperText?: string;
  minCents?: number;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

/**
 * Entkoppeltes Euro-Eingabefeld gemäß Systemvertrag (Abschnitt 2):
 * Hält die Benutzereingabe während des Tippens lokal als `string` (Komma-Toleranz, freies Tippen)
 * und parst erst bei kontrolliertem `onBlur` (oder Enter) via `parseEuroInputToCents` in ganzzahlige Cent.
 */
export const CentInput: React.FC<CentInputProps> = ({
  id,
  label,
  cents,
  onCommitCents,
  placeholder = '0,00',
  helperText,
  minCents = 0,
  className = '',
  inputClassName = '',
  autoFocus = false,
}) => {
  const [rawText, setRawText] = useState<string>(() => formatCentsToInputString(cents));
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setRawText(formatCentsToInputString(cents));
      setHasError(false);
    }
  }, [cents, isFocused]);

  const commitCurrentValue = () => {
    setIsFocused(false);
    const parsed = parseEuroInputToCents(rawText);
    if (parsed === null) {
      // Bei ungültiger Eingabe auf letzten gültigen Cent-Stand zurücksetzen
      setRawText(formatCentsToInputString(cents));
      setHasError(false);
      return;
    }
    const clamped = Math.max(minCents, Math.round(parsed));
    setHasError(false);
    setRawText(formatCentsToInputString(clamped));
    if (clamped !== cents) {
      onCommitCents(clamped);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setRawText(formatCentsToInputString(cents));
      setHasError(false);
      e.currentTarget.blur();
    }
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-300 tracking-wide">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoFocus={autoFocus}
          value={rawText}
          placeholder={placeholder}
          onFocus={(e) => {
            setIsFocused(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setRawText(e.target.value);
            const preview = parseEuroInputToCents(e.target.value);
            setHasError(e.target.value.trim().length > 0 && preview === null);
          }}
          onBlur={commitCurrentValue}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-xl bg-slate-900/90 border px-3.5 py-2.5 pr-9 text-sm font-mono tabular-nums text-slate-100 placeholder-slate-500 transition focus:outline-none focus:ring-2 ${
            hasError
              ? 'border-rose-500/70 focus:ring-rose-500/40'
              : 'border-slate-700/80 focus:border-emerald-500/80 focus:ring-emerald-500/30'
          } ${inputClassName}`}
        />
        <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400">
          €
        </span>
      </div>
      {helperText && (
        <span className="text-[11px] text-slate-400 leading-tight">{helperText}</span>
      )}
    </div>
  );
};
