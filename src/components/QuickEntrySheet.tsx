import React, { useEffect, useState } from 'react';
import {
  Banknote,
  CheckSquare,
  Coins,
  CreditCard,
  Layers,
  ShieldAlert,
  Sparkles,
  Square,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  formatCentsToEuro,
  formatCentsToInputString,
  parseEuroInputToCents,
  split5050Cents,
} from '../finance';
import { BudgetCategory, PaymentMethod, Transaction } from '../model';

export type QuickEntryMode = 'TIP' | 'EXPENSE' | 'SALARY';
export type ExpenseTargetType = 'SHARED_BUDGET' | 'SHARED_BUFFER' | 'PRIVATE_A';

export interface QuickEntrySheetProps {
  isOpen: boolean;
  initialMode: QuickEntryMode;
  initialExpenseTarget?: ExpenseTargetType;
  initialBudgetId?: string;
  budgets: BudgetCategory[];
  freiesTaschengeldCents: number;
  verfuegbarerPufferCents: number;
  pflichtLueckeNachEinzahlungCents: number;
  bargeldReserviertBankCents: number;
  onClose: () => void;
  onAddTransaction: (tx: Transaction) => void;
}

const QUICK_PRESET_CENTS_TIP = [2_500, 5_000, 8_500, 12_000, 15_000];
const QUICK_PRESET_CENTS_EXPENSE = [1_000, 2_500, 4_500, 7_500, 10_000];

const PRIVATE_CATEGORIES = [
  'Gastronomie & Snacks',
  'Freizeit & Ausgehen',
  'Kleidung & Pflege',
  'Mobilität Privat',
  'Sonstiges Privat',
];

export const QuickEntrySheet: React.FC<QuickEntrySheetProps> = ({
  isOpen,
  initialMode,
  initialExpenseTarget = 'SHARED_BUDGET',
  initialBudgetId,
  budgets,
  freiesTaschengeldCents,
  verfuegbarerPufferCents,
  pflichtLueckeNachEinzahlungCents,
  bargeldReserviertBankCents,
  onClose,
  onAddTransaction,
}) => {
  const [mode, setMode] = useState<QuickEntryMode>(initialMode);
  const [expenseTarget, setExpenseTarget] = useState<ExpenseTargetType>(initialExpenseTarget);

  // Entkoppelte Betragseingabe: lokal als String, geparst bei onBlur in integer Cents
  const [rawAmountStr, setRawAmountStr] = useState<string>('');
  const [committedCents, setCommittedCents] = useState<number>(0);

  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    initialBudgetId ?? budgets[0]?.id ?? ''
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('GIRO_SHARED');
  const [markedForCashClearing, setMarkedForCashClearing] = useState<boolean>(false);
  const [privateCategory, setPrivateCategory] = useState<string>(PRIVATE_CATEGORIES[0]);
  const [note, setNote] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setExpenseTarget(initialExpenseTarget);
      setSelectedBudgetId(initialBudgetId ?? budgets[0]?.id ?? '');
      setRawAmountStr('');
      setCommittedCents(0);
      setMarkedForCashClearing(false);
      setPaymentMethod(initialExpenseTarget === 'SHARED_BUFFER' ? 'CASH_A' : 'GIRO_SHARED');
      setNote('');
      setValidationError(null);
    }
  }, [isOpen, initialMode, initialExpenseTarget, initialBudgetId, budgets]);

  if (!isOpen) {
    return null;
  }

  const handleAmountBlur = () => {
    const parsed = parseEuroInputToCents(rawAmountStr);
    if (parsed === null || parsed <= 0) {
      if (rawAmountStr.trim().length === 0) {
        setCommittedCents(0);
      }
      return;
    }
    const safeCents = Math.max(0, Math.round(parsed));
    setCommittedCents(safeCents);
    setRawAmountStr(formatCentsToInputString(safeCents));
    setValidationError(null);
  };

  const applyPresetCents = (presetCents: number) => {
    setCommittedCents(presetCents);
    setRawAmountStr(formatCentsToInputString(presetCents));
    setValidationError(null);
  };

  // Für Live-Vorschau: falls Benutzer noch im Feld ist, nutze geparsten Wert oder committedCents
  const livePreviewCents = (() => {
    const parsed = parseEuroInputToCents(rawAmountStr);
    if (parsed !== null && parsed > 0) {
      return Math.round(parsed);
    }
    return committedCents;
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedNow = parseEuroInputToCents(rawAmountStr);
    const finalCents =
      parsedNow !== null && parsedNow > 0 ? Math.round(parsedNow) : committedCents;

    if (finalCents <= 0) {
      setValidationError('Bitte gib einen gültigen Betrag größer als 0,00 € ein.');
      return;
    }

    const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = Date.now();
    const trimmedNote = note.trim().length > 0 ? note.trim() : undefined;

    if (mode === 'TIP') {
      onAddTransaction({
        id,
        timestamp,
        cents: finalCents,
        type: 'INCOME_TIP',
        note: trimmedNote ?? 'Schicht-Trinkgeld',
      });
    } else if (mode === 'SALARY') {
      onAddTransaction({
        id,
        timestamp,
        cents: finalCents,
        type: 'INCOME_SALARY',
        note: trimmedNote ?? 'Gehaltseingang',
      });
    } else {
      if (expenseTarget === 'SHARED_BUDGET') {
        const targetBudget = selectedBudgetId || budgets[0]?.id || 'budget-default';
        onAddTransaction({
          id,
          timestamp,
          cents: finalCents,
          type: 'EXPENSE_SHARED',
          budgetId: targetBudget,
          paymentMethod,
          markedForCashClearing,
          note: trimmedNote,
        });
      } else if (expenseTarget === 'SHARED_BUFFER') {
        onAddTransaction({
          id,
          timestamp,
          cents: finalCents,
          type: 'EXPENSE_BUFFER',
          paymentMethod,
          note: trimmedNote ?? 'Spontankauf Puffer (50:50)',
        });
      } else {
        onAddTransaction({
          id,
          timestamp,
          cents: finalCents,
          type: 'EXPENSE_PRIVATE_A',
          category: privateCategory,
          note: trimmedNote,
        });
      }
    }

    onClose();
  };

  // Berechne Live-Waterfall-Vorschau für Trinkgeld
  const remainingUncoveredBeforeNewTip = Math.max(
    0,
    pflichtLueckeNachEinzahlungCents - bargeldReserviertBankCents
  );
  const newTipToReserve = Math.min(livePreviewCents, remainingUncoveredBeforeNewTip);
  const newTipToPocketMoney = Math.max(0, livePreviewCents - remainingUncoveredBeforeNewTip);

  // Berechne Live-Puffer-Vorschau für EXPENSE_BUFFER
  const bufferShareACents = split5050Cents(livePreviewCents);
  const projectedPocketMoneyAfterBuffer = freiesTaschengeldCents - bufferShareACents;
  const projectedBufferAfterExpense = 2 * projectedPocketMoneyAfterBuffer;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-entry-sheet-title"
    >
      <div className="w-full max-w-lg rounded-t-3xl border border-slate-800 bg-[#101726] p-5 shadow-2xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                mode === 'TIP'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : mode === 'SALARY'
                    ? 'bg-sky-500/15 text-sky-400'
                    : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              {mode === 'TIP' ? (
                <Coins className="h-5 w-5" />
              ) : mode === 'SALARY' ? (
                <Banknote className="h-5 w-5" />
              ) : (
                <Wallet className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 id="quick-entry-sheet-title" className="text-base font-bold text-slate-100">
                {mode === 'TIP'
                  ? 'Schicht-Trinkgeld erfassen'
                  : mode === 'SALARY'
                    ? 'Gehaltseingang buchen'
                    : 'Ausgabe schnell erfassen'}
              </h2>
              <p className="text-xs text-slate-400">
                Komma-tolerante Eingabe • Cent-genaue Berechnung bei onBlur
              </p>
            </div>
          </div>
          <button
            id="btn-close-quick-entry"
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modus-Umschalter */}
        <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-900/90 p-1 border border-slate-800/80">
          <button
            id="tab-quick-tip"
            type="button"
            onClick={() => setMode('TIP')}
            className={`rounded-xl py-2 text-xs font-semibold transition ${
              mode === 'TIP'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            + Trinkgeld
          </button>
          <button
            id="tab-quick-expense"
            type="button"
            onClick={() => setMode('EXPENSE')}
            className={`rounded-xl py-2 text-xs font-semibold transition ${
              mode === 'EXPENSE'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            + Ausgabe
          </button>
          <button
            id="tab-quick-salary"
            type="button"
            onClick={() => setMode('SALARY')}
            className={`rounded-xl py-2 text-xs font-semibold transition ${
              mode === 'SALARY'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            + Gehalt
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Entkoppeltes Betragsfeld */}
          <div>
            <label
              htmlFor="quick-entry-amount-input"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Betrag in Euro (z. B. 45,50)
            </label>
            <div className="relative">
              <input
                id="quick-entry-amount-input"
                type="text"
                inputMode="decimal"
                autoFocus
                value={rawAmountStr}
                placeholder="0,00"
                onChange={(e) => {
                  setRawAmountStr(e.target.value);
                  setValidationError(null);
                }}
                onBlur={handleAmountBlur}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3.5 pr-12 text-2xl font-bold font-mono tabular-nums text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
                €
              </span>
            </div>

            {/* Schnellwahl-Chips */}
            {mode !== 'SALARY' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(mode === 'TIP' ? QUICK_PRESET_CENTS_TIP : QUICK_PRESET_CENTS_EXPENSE).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyPresetCents(preset)}
                      className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-xs font-mono text-slate-300 hover:border-emerald-500/60 hover:bg-slate-800"
                    >
                      {formatCentsToEuro(preset)}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Live Waterfall Vorschau für Trinkgeld */}
          {mode === 'TIP' && livePreviewCents > 0 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs space-y-1.5">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Live Waterfall-Zuteilung ({formatCentsToEuro(livePreviewCents)}):
              </div>
              <div className="flex justify-between text-slate-300">
                <span>1. Reserviert für Pflichtlücke (Bank):</span>
                <span className="font-mono font-semibold text-amber-300">
                  +{formatCentsToEuro(newTipToReserve)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>2. Direkt ins freie Taschengeld A:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  +{formatCentsToEuro(newTipToPocketMoney)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400 pt-1 border-t border-emerald-500/20">
                <span>Neuer 2× Spontan-Puffer:</span>
                <span className="font-mono text-slate-200">
                  {formatCentsToEuro(verfuegbarerPufferCents + 2 * newTipToPocketMoney)}
                </span>
              </div>
            </div>
          )}

          {/* Ausgaben-Optionen */}
          {mode === 'EXPENSE' && (
            <div className="space-y-3.5">
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Ausgaben-Zuordnung
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    id="btn-target-shared-budget"
                    type="button"
                    onClick={() => setExpenseTarget('SHARED_BUDGET')}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-medium transition ${
                      expenseTarget === 'SHARED_BUDGET'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    <span>Alltagsbudget</span>
                  </button>
                  <button
                    id="btn-target-shared-buffer"
                    type="button"
                    onClick={() => setExpenseTarget('SHARED_BUFFER')}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-medium transition ${
                      expenseTarget === 'SHARED_BUFFER'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                        : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Gem.: Puffer</span>
                  </button>
                  <button
                    id="btn-target-private-a"
                    type="button"
                    onClick={() => setExpenseTarget('PRIVATE_A')}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-medium transition ${
                      expenseTarget === 'PRIVATE_A'
                        ? 'border-rose-500 bg-rose-500/15 text-rose-300'
                        : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <User className="h-4 w-4" />
                    <span>Privat A</span>
                  </button>
                </div>
              </div>

              {/* Alltagsbudget Auswahl */}
              {expenseTarget === 'SHARED_BUDGET' && (
                <div>
                  <label
                    htmlFor="select-budget-category"
                    className="mb-1.5 block text-xs font-medium text-slate-300"
                  >
                    Alltagsbudget wählen
                  </label>
                  <select
                    id="select-budget-category"
                    value={selectedBudgetId}
                    onChange={(e) => setSelectedBudgetId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {budgets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (Limit: {formatCentsToEuro(b.monthlyLimitCents)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Zahlungsweg für Gemeinschaftsausgaben & Puffer */}
              {(expenseTarget === 'SHARED_BUDGET' || expenseTarget === 'SHARED_BUFFER') && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">
                    Zahlungsweg
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'GIRO_SHARED', label: 'Gem.-Konto Giro' },
                        { id: 'CASH_A', label: 'Bargeld Partner A' },
                        { id: 'CASH_B', label: 'Bargeld Partner B' },
                        { id: 'GIRO_PRIVATE_A', label: 'Privat-Giro A' },
                      ] as const
                    ).map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(pm.id);
                          if (pm.id === 'CASH_A' || pm.id === 'CASH_B') {
                            // Bei Barzahlung in Alltagsbudget oft für Barausgleich relevant
                          } else if (pm.id === 'GIRO_SHARED') {
                            setMarkedForCashClearing(false);
                          }
                        }}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          paymentMethod === pm.id
                            ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-200'
                            : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{pm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Checkbox markedForCashClearing (Kleinanzeigen- & Barkauf-Verrechnung ohne Sub-Formular) */}
              {expenseTarget === 'SHARED_BUDGET' && (
                <button
                  id="checkbox-cash-clearing"
                  type="button"
                  onClick={() => setMarkedForCashClearing((prev) => !prev)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                    markedForCashClearing
                      ? 'border-amber-500/70 bg-amber-500/10 text-amber-200'
                      : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {markedForCashClearing ? (
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  ) : (
                    <Square className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  )}
                  <div className="text-xs">
                    <div className="font-semibold">
                      Kleinanzeigen- & Barkauf-Verrechnung (`markedForCashClearing`)
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Erfasst den 50%-Ausgleichsanspruch zwischen Partner A und Partner B direkt im
                      Barausgleich-Saldo.
                    </p>
                  </div>
                </button>
              )}

              {/* Live Invariant 2 Vorschau für Puffer-Ausgaben */}
              {expenseTarget === 'SHARED_BUFFER' && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs space-y-1.5">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    Invariante 2: Echtzeit-Puffer-Kopplung
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Dein 50%-Anteil (mindert Taschengeld A):</span>
                    <span className="font-mono font-semibold text-rose-300">
                      -{formatCentsToEuro(bufferShareACents)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Freies Taschengeld A danach:</span>
                    <span className="font-mono font-semibold text-slate-100">
                      {formatCentsToEuro(projectedPocketMoneyAfterBuffer)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300 pt-1 border-t border-amber-500/20">
                    <span>Verfügbarer 2× Puffer danach:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {formatCentsToEuro(projectedBufferAfterExpense)}
                    </span>
                  </div>
                </div>
              )}

              {/* Privatkategorie Partner A */}
              {expenseTarget === 'PRIVATE_A' && (
                <div>
                  <label
                    htmlFor="select-private-category"
                    className="mb-1.5 block text-xs font-medium text-slate-300"
                  >
                    Kategorie (Privat Partner A)
                  </label>
                  <select
                    id="select-private-category"
                    value={privateCategory}
                    onChange={(e) => setPrivateCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {PRIVATE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Notizfeld */}
          <div>
            <label htmlFor="quick-entry-note" className="mb-1 block text-xs font-medium text-slate-300">
              Notiz (optional)
            </label>
            <input
              id="quick-entry-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === 'TIP'
                  ? 'z. B. Spätschicht Samstag'
                  : mode === 'SALARY'
                    ? 'z. B. Gehalt 15. des Monats'
                    : 'z. B. Kleinanzeigen, Drogerie, Bäcker...'
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {validationError && (
            <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {validationError}
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-800/80 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              Abbrechen
            </button>
            <button
              id="btn-submit-quick-entry"
              type="submit"
              className="flex-[2] rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-[0.99] transition"
            >
              {mode === 'TIP'
                ? 'Trinkgeld buchen'
                : mode === 'SALARY'
                  ? 'Gehalt buchen'
                  : 'Ausgabe buchen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
