import React, { useEffect, useState } from 'react';
import {
  Banknote,
  Calendar,
  CheckSquare,
  Coins,
  CreditCard,
  Layers,
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
import {
  BudgetCategory,
  dateStringToTimestamp,
  formatYearMonthLabel,
  getCurrentYearMonth,
  getLocalTodayISO,
  PaymentMethod,
  SPECIAL_TASCHENGELD_BUDGET_ID,
  Transaction,
} from '../model';

export type QuickEntryMode = 'INCOME' | 'EXPENSE';
export type IncomeSubType = 'TIP' | 'SALARY';
export type ExpenseTargetType = 'SHARED_BUDGET' | 'PRIVATE_A';

export interface QuickEntrySheetProps {
  isOpen: boolean;
  initialMode: QuickEntryMode;
  initialIncomeType?: IncomeSubType;
  initialExpenseTarget?: ExpenseTargetType;
  initialBudgetId?: string;
  selectedYearMonth: string;
  budgets: BudgetCategory[];
  freiesTaschengeldCents: number;
  pflichtLueckeNachEinzahlungCents: number;
  bargeldReserviertBankCents: number;
  ungedecktesPflichtSollCents: number;
  onClose: () => void;
  onAddTransaction: (tx: Transaction) => void;
}

function getDefaultDateForMonth(selectedYearMonth: string): string {
  const todayISO = getLocalTodayISO();
  if (selectedYearMonth === getCurrentYearMonth()) {
    return todayISO;
  }
  return `${selectedYearMonth}-01`;
}

export const QuickEntrySheet: React.FC<QuickEntrySheetProps> = ({
  isOpen,
  initialMode,
  initialIncomeType = 'TIP',
  initialExpenseTarget = 'SHARED_BUDGET',
  initialBudgetId,
  selectedYearMonth,
  budgets,
  freiesTaschengeldCents,
  pflichtLueckeNachEinzahlungCents,
  bargeldReserviertBankCents,
  ungedecktesPflichtSollCents,
  onClose,
  onAddTransaction,
}) => {
  const [incomeType, setIncomeType] = useState<IncomeSubType>(initialIncomeType);
  const [expenseTarget, setExpenseTarget] = useState<ExpenseTargetType>(initialExpenseTarget);

  // Entkoppelte Betragseingabe: lokal als String, geparst bei onBlur in integer Cents
  const [rawAmountStr, setRawAmountStr] = useState<string>('');
  const [committedCents, setCommittedCents] = useState<number>(0);

  const [dateStr, setDateStr] = useState<string>(() => getDefaultDateForMonth(selectedYearMonth));
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    initialBudgetId ?? budgets[0]?.id ?? SPECIAL_TASCHENGELD_BUDGET_ID
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('GIRO_SHARED');
  const [markedForCashClearing, setMarkedForCashClearing] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIncomeType(initialIncomeType);
      setExpenseTarget(initialExpenseTarget);
      setSelectedBudgetId(initialBudgetId ?? budgets[0]?.id ?? SPECIAL_TASCHENGELD_BUDGET_ID);
      setDateStr(getDefaultDateForMonth(selectedYearMonth));
      setRawAmountStr('');
      setCommittedCents(0);
      setMarkedForCashClearing(false);
      setPaymentMethod('GIRO_SHARED');
      setNote('');
      setValidationError(null);
    }
  }, [
    isOpen,
    initialMode,
    initialIncomeType,
    initialExpenseTarget,
    initialBudgetId,
    selectedYearMonth,
    budgets,
  ]);

  if (!isOpen) {
    return null;
  }

  const isIncomeMode = initialMode === 'INCOME';
  const isSpecialTaschengeld =
    !isIncomeMode &&
    expenseTarget === 'SHARED_BUDGET' &&
    selectedBudgetId === SPECIAL_TASCHENGELD_BUDGET_ID;

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
      rawAmountStr.trim().length === 0
        ? 0
        : parsedNow !== null && parsedNow > 0
          ? Math.round(parsedNow)
          : committedCents;

    if (finalCents <= 0) {
      setValidationError('Bitte gib einen gültigen Betrag größer als 0,00 € ein.');
      return;
    }

    const safeDate =
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : getDefaultDateForMonth(selectedYearMonth);

    const todayISO = getLocalTodayISO();
    const timestamp =
      safeDate === todayISO ? Date.now() : dateStringToTimestamp(safeDate);
    const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const trimmedNote = note.trim().length > 0 ? note.trim() : undefined;

    if (isIncomeMode) {
      if (incomeType === 'TIP') {
        onAddTransaction({
          id,
          timestamp,
          date: safeDate,
          cents: finalCents,
          type: 'INCOME_TIP',
          note: trimmedNote ?? 'Schicht-Trinkgeld',
        });
      } else {
        onAddTransaction({
          id,
          timestamp,
          date: safeDate,
          cents: finalCents,
          type: 'INCOME_SALARY',
          note: trimmedNote ?? 'Gehaltseingang',
        });
      }
    } else if (expenseTarget === 'SHARED_BUDGET') {
      const targetBudget = selectedBudgetId || budgets[0]?.id || SPECIAL_TASCHENGELD_BUDGET_ID;
      onAddTransaction({
        id,
        timestamp,
        date: safeDate,
        cents: finalCents,
        type: 'EXPENSE_SHARED',
        budgetId: targetBudget,
        paymentMethod,
        markedForCashClearing,
        note: trimmedNote,
      });
    } else {
      onAddTransaction({
        id,
        timestamp,
        date: safeDate,
        cents: finalCents,
        type: 'EXPENSE_PRIVATE_A',
        note: trimmedNote,
      });
    }

    onClose();
  };

  // Live Waterfall Vorschau für Trinkgeld & Gehalt
  const remainingUncoveredBeforeNewTip = Math.max(
    0,
    pflichtLueckeNachEinzahlungCents - bargeldReserviertBankCents
  );
  const newTipToReserve = Math.min(livePreviewCents, remainingUncoveredBeforeNewTip);
  const newTipToPocketMoney = Math.max(0, livePreviewCents - remainingUncoveredBeforeNewTip);

  const newSalaryToObligation = Math.min(livePreviewCents, ungedecktesPflichtSollCents);
  const newSalaryToPocketMoney = Math.max(0, livePreviewCents - ungedecktesPflichtSollCents);

  // Live Vorschau für gemeinsame Taschengeld-Ausgabe (50:50)
  const sharedTaschengeldShareA = split5050Cents(livePreviewCents);
  const projectedPocketAfterShared = freiesTaschengeldCents - sharedTaschengeldShareA;

  const pickedMonth = dateStr.slice(0, 7);
  const isDifferentMonth =
    pickedMonth.length === 7 && pickedMonth !== selectedYearMonth;

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
                isIncomeMode
                  ? incomeType === 'TIP'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-sky-500/15 text-sky-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              {isIncomeMode ? (
                incomeType === 'TIP' ? (
                  <Coins className="h-5 w-5" />
                ) : (
                  <Banknote className="h-5 w-5" />
                )
              ) : (
                <Wallet className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 id="quick-entry-sheet-title" className="text-base font-bold text-slate-100">
                {isIncomeMode
                  ? incomeType === 'TIP'
                    ? 'Einnahme: Trinkgeld erfassen'
                    : 'Einnahme: Gehalt erfassen'
                  : 'Ausgabe erfassen'}
              </h2>
              <p className="text-xs text-slate-400">
                Monat: {formatYearMonthLabel(selectedYearMonth)} • Cent-genau bei onBlur
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

        {/* Im Einnahmen-Modus: nur Trinkgeld vs. Gehalt */}
        {isIncomeMode && (
          <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-900/90 p-1 border border-slate-800/80">
            <button
              id="tab-quick-tip"
              type="button"
              onClick={() => setIncomeType('TIP')}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                incomeType === 'TIP'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Trinkgeld
            </button>
            <button
              id="tab-quick-salary"
              type="button"
              onClick={() => setIncomeType('SALARY')}
              className={`rounded-xl py-2 text-xs font-semibold transition ${
                incomeType === 'SALARY'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Gehalt
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Betrag & Datum */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
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
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 pr-11 text-2xl font-bold font-mono tabular-nums text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
                  €
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-entry-date-input"
                className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                <Calendar className="h-3.5 w-3.5" />
                Datum
              </label>
              <input
                id="quick-entry-date-input"
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3.5 text-sm font-mono text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {isDifferentMonth && (
            <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 px-3 py-2 text-[11px] text-sky-200">
              Hinweis: Diese Buchung wird dem Monat{' '}
              <strong>{formatYearMonthLabel(pickedMonth)}</strong> zugeordnet.
            </div>
          )}

          {/* Live Waterfall Vorschau für Trinkgeld */}
          {isIncomeMode && incomeType === 'TIP' && livePreviewCents > 0 && !isDifferentMonth && (
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
            </div>
          )}

          {/* Live Vorschau für Gehalt */}
          {isIncomeMode && incomeType === 'SALARY' && livePreviewCents > 0 && !isDifferentMonth && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-3.5 text-xs space-y-1.5">
              <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5" />
                Gehalts-Anrechnung ({formatCentsToEuro(livePreviewCents)}):
              </div>
              <div className="flex justify-between text-slate-300">
                <span>1. Deckt Pflichtlast direkt am Girokonto:</span>
                <span className="font-mono font-semibold text-sky-300">
                  +{formatCentsToEuro(newSalaryToObligation)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>2. Ungenutztes Gehalt → Taschengeld A:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  +{formatCentsToEuro(newSalaryToPocketMoney)}
                </span>
              </div>
            </div>
          )}

          {/* Ausgaben-Optionen: nur 2 Tabs (Gemeinsame Ausgaben & Privat A) */}
          {!isIncomeMode && (
            <div className="space-y-3.5">
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Ausgaben-Zuordnung
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="btn-target-shared-budget"
                    type="button"
                    onClick={() => setExpenseTarget('SHARED_BUDGET')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold transition ${
                      expenseTarget === 'SHARED_BUDGET'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    <span>Gemeinsame Ausgaben</span>
                  </button>
                  <button
                    id="btn-target-private-a"
                    type="button"
                    onClick={() => setExpenseTarget('PRIVATE_A')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-semibold transition ${
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

              {/* Alltagsbudget + Taschengeld (50:50) Auswahl */}
              {expenseTarget === 'SHARED_BUDGET' && (
                <>
                  <div>
                    <label
                      htmlFor="select-budget-category"
                      className="mb-1.5 block text-xs font-medium text-slate-300"
                    >
                      Budget / Topf wählen
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
                      <option value={SPECIAL_TASCHENGELD_BUDGET_ID}>
                        Taschengeld (50:50) – direkt vom Taschengeld A
                      </option>
                    </select>
                  </div>

                  {/* Live-Vorschau für Taschengeld (50:50) */}
                  {isSpecialTaschengeld && livePreviewCents > 0 && !isDifferentMonth && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs space-y-1">
                      <div className="flex justify-between text-slate-300">
                        <span>Dein 50-%-Anteil (vom Taschengeld A):</span>
                        <span className="font-mono font-semibold text-rose-300">
                          -{formatCentsToEuro(sharedTaschengeldShareA)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Freies Taschengeld A danach:</span>
                        <span
                          className={`font-mono font-semibold ${
                            projectedPocketAfterShared >= 0 ? 'text-emerald-300' : 'text-rose-400'
                          }`}
                        >
                          {formatCentsToEuro(projectedPocketAfterShared)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Zahlungsweg für gemeinsame Ausgaben */}
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
                            if (pm.id === 'GIRO_SHARED') {
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

                  {/* Checkbox markedForCashClearing */}
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
                        Kleinanzeigen- & Barkauf-Verrechnung (50:50)
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Erfasst den 50-%-Ausgleichsanspruch zwischen Partner A und Partner B direkt
                        im Barausgleich-Saldo.
                      </p>
                    </div>
                  </button>
                </>
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
                isIncomeMode
                  ? incomeType === 'TIP'
                    ? 'z. B. Spätschicht Samstag'
                    : 'z. B. Gehalt 15. des Monats'
                  : expenseTarget === 'PRIVATE_A'
                    ? 'z. B. Kaffee, Mittagessen, Kino...'
                    : 'z. B. Rewe, Kleinanzeigen, Drogerie...'
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
              {isIncomeMode
                ? incomeType === 'TIP'
                  ? 'Trinkgeld buchen'
                  : 'Gehalt buchen'
                : 'Ausgabe buchen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
