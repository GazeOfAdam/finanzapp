import React, { useState } from 'react';
import {
  ArrowRight,
  Landmark,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  BudgetProjection,
  formatCentsToEuro,
  ObligationBreakdown,
} from '../finance';
import { BudgetCategory, PrivateLoan } from '../model';
import { CentInput } from './CentInput';

export interface BudgetsAndLoansViewProps {
  budgets: BudgetProjection[];
  privateLoans: PrivateLoan[];
  obligations: ObligationBreakdown;
  totalBudgetSurplusCents: number;
  onAddBudget: (budget: BudgetCategory) => void;
  onUpdateBudget: (budget: BudgetCategory) => void;
  onDeleteBudget: (budgetId: string) => void;
  onRolloverToIng: (sourceBudgetId: string, amountCents: number) => void;
  onReallocateBudget: (
    sourceBudgetId: string,
    targetBudgetId: string,
    amountCents: number
  ) => void;
  onAddLoan: (loan: PrivateLoan) => void;
  onUpdateLoan: (loan: PrivateLoan) => void;
  onToggleLoanPause: (loanId: string) => void;
  onDeleteLoan: (loanId: string) => void;
}

const ICON_OPTIONS = [
  { value: 'ShoppingCart', label: 'Einkaufswagen' },
  { value: 'Sparkles', label: 'Drogerie / Glanz' },
  { value: 'Baby', label: 'Baby / Kind' },
  { value: 'Car', label: 'Auto / Mobilität' },
  { value: 'Heart', label: 'Familie / Freizeit' },
  { value: 'Wallet', label: 'Standard-Wallet' },
];

export const BudgetsAndLoansView: React.FC<BudgetsAndLoansViewProps> = ({
  budgets,
  privateLoans,
  obligations,
  totalBudgetSurplusCents,
  onAddBudget,
  onUpdateBudget,
  onDeleteBudget,
  onRolloverToIng,
  onReallocateBudget,
  onAddLoan,
  onUpdateLoan,
  onToggleLoanPause,
  onDeleteLoan,
}) => {
  // Neues Budget anlegen
  const [newBudgetName, setNewBudgetName] = useState<string>('');
  const [newBudgetLimitCents, setNewBudgetLimitCents] = useState<number>(15_000);
  const [newBudgetIcon, setNewBudgetIcon] = useState<string>('ShoppingCart');
  const [newBudgetWeeklyPacer, setNewBudgetWeeklyPacer] = useState<boolean>(true);

  // Rollover-Steuerung
  const [rolloverMode, setRolloverMode] = useState<'ING_TAGESGELD' | 'REALLOCATE'>('ING_TAGESGELD');
  const [rolloverSourceId, setRolloverSourceId] = useState<string>(budgets[0]?.id ?? '');
  const [rolloverTargetId, setRolloverTargetId] = useState<string>(budgets[1]?.id ?? '');
  const [rolloverAmountCents, setRolloverAmountCents] = useState<number>(2_500);

  // Neues Darlehen anlegen
  const [newLoanName, setNewLoanName] = useState<string>('');
  const [newLoanRateCents, setNewLoanRateCents] = useState<number>(8_000);
  const [newLoanTotalCents, setNewLoanTotalCents] = useState<number>(96_000);
  const [newLoanRemainingCents, setNewLoanRemainingCents] = useState<number>(96_000);

  const handleCreateBudget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBudgetName.trim() || newBudgetLimitCents <= 0) {
      return;
    }
    onAddBudget({
      id: `budget-${Date.now()}`,
      name: newBudgetName.trim(),
      monthlyLimitCents: newBudgetLimitCents,
      icon: newBudgetIcon,
      color: 'emerald',
      hasWeeklyPacer: newBudgetWeeklyPacer,
    });
    setNewBudgetName('');
    setNewBudgetLimitCents(15_000);
  };

  const handleExecuteRollover = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolloverSourceId || rolloverAmountCents <= 0) {
      return;
    }
    if (rolloverMode === 'ING_TAGESGELD') {
      onRolloverToIng(rolloverSourceId, rolloverAmountCents);
    } else if (rolloverTargetId && rolloverTargetId !== rolloverSourceId) {
      onReallocateBudget(rolloverSourceId, rolloverTargetId, rolloverAmountCents);
    }
  };

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoanName.trim() || newLoanRateCents <= 0) {
      return;
    }
    onAddLoan({
      id: `loan-${Date.now()}`,
      name: newLoanName.trim(),
      monthlyRateCents: newLoanRateCents,
      totalAmountCents: Math.max(newLoanTotalCents, newLoanRemainingCents),
      remainingCents: newLoanRemainingCents,
      isPausedThisMonth: false,
    });
    setNewLoanName('');
    setNewLoanRateCents(8_000);
    setNewLoanTotalCents(96_000);
    setNewLoanRemainingCents(96_000);
  };

  const selectedSourceBudget = budgets.find((b) => b.id === rolloverSourceId) ?? budgets[0];

  return (
    <div className="space-y-5 pb-28">
      {/* 1. DARLEHENS-MANAGER INKL. PAUSIERUNG */}
      <section
        aria-label="Darlehens-Manager und Monats-Pausierung"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Private Darlehen & Raten-Pausierung
            </h2>
            <p className="text-xs text-slate-400">
              „Diesen Monat aussetzen“ senkt sofort die monatliche Pflichtlast; die Restschuld
              bleibt unverändert.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Aktive Monatsraten: </span>
            <strong className="text-amber-300">
              {formatCentsToEuro(obligations.activePrivateLoanRatesCents)}
            </strong>
          </div>
        </div>

        {/* Transparentes Rückstands-/Pausierungs-Banner */}
        {obligations.pausedLoansCount > 0 && (
          <div className="mt-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs">
            <div className="font-bold text-amber-200">
              {obligations.pausedLoansCount} Darlehen für diesen Monat ausgesetzt (Entlastung:{' '}
              {formatCentsToEuro(obligations.pausedLoansMonthlyReliefCents)})
            </div>
            <p className="mt-0.5 text-amber-300/80 text-[11px]">
              Die ausgesetzten Raten mindern nur die laufende Monats-Pflichtlast A. Die Basisschuld
              ({formatCentsToEuro(obligations.totalLoanRemainingDebtCents)}) bleibt vollständig
              erhalten.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {privateLoans.map((loan) => {
            const paidPercent =
              loan.totalAmountCents > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      Math.round(
                        ((loan.totalAmountCents - loan.remainingCents) * 100) /
                          loan.totalAmountCents
                      )
                    )
                  )
                : 0;

            return (
              <div
                key={loan.id}
                className={`rounded-2xl border p-4 transition ${
                  loan.isPausedThisMonth
                    ? 'border-amber-500/40 bg-amber-950/15'
                    : 'border-slate-800/90 bg-slate-950/60'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100">{loan.name}</h3>
                      {loan.isPausedThisMonth ? (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                          Pausiert (Rückstand: {formatCentsToEuro(loan.monthlyRateCents)})
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          Aktiv in Pflichtlast A
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400 font-mono">
                      Restschuld: {formatCentsToEuro(loan.remainingCents)} von{' '}
                      {formatCentsToEuro(loan.totalAmountCents)} ({paidPercent}% getilgt)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      id={`btn-pause-loan-${loan.id}`}
                      type="button"
                      onClick={() => onToggleLoanPause(loan.id)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                        loan.isPausedThisMonth
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                          : 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                      }`}
                    >
                      {loan.isPausedThisMonth ? (
                        <>
                          <PlayCircle className="h-3.5 w-3.5" />
                          Rate reaktivieren
                        </>
                      ) : (
                        <>
                          <PauseCircle className="h-3.5 w-3.5" />
                          Diesen Monat aussetzen
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteLoan(loan.id)}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:border-rose-500/40 hover:text-rose-400"
                      title="Darlehen löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <CentInput
                    id={`loan-rate-${loan.id}`}
                    label="Monatliche Rate (EUR)"
                    cents={loan.monthlyRateCents}
                    onCommitCents={(newRate) =>
                      onUpdateLoan({ ...loan, monthlyRateCents: newRate })
                    }
                  />
                  <CentInput
                    id={`loan-remaining-${loan.id}`}
                    label="Aktuelle Restschuld / Basisschuld (EUR)"
                    cents={loan.remainingCents}
                    onCommitCents={(newRem) =>
                      onUpdateLoan({
                        ...loan,
                        remainingCents: newRem,
                        totalAmountCents: Math.max(loan.totalAmountCents, newRem),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Neues Darlehen hinzufügen */}
        <form
          onSubmit={handleCreateLoan}
          className="mt-4 rounded-2xl border border-slate-800/90 bg-slate-900/50 p-4 space-y-3"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            Neues Privatdarlehen anlegen
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-loan-name" className="text-xs font-medium text-slate-300">
                Bezeichnung
              </label>
              <input
                id="new-loan-name"
                type="text"
                value={newLoanName}
                onChange={(e) => setNewLoanName(e.target.value)}
                placeholder="z. B. Familienkredit"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100"
              />
            </div>
            <CentInput
              id="new-loan-rate"
              label="Monatsrate"
              cents={newLoanRateCents}
              onCommitCents={setNewLoanRateCents}
            />
            <CentInput
              id="new-loan-remaining"
              label="Restschuld Gesamt"
              cents={newLoanRemainingCents}
              onCommitCents={(val) => {
                setNewLoanRemainingCents(val);
                setNewLoanTotalCents(val);
              }}
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
          >
            Darlehen hinzufügen
          </button>
        </form>
      </section>

      {/* 2. DYNAMISCHER BUDGET-MANAGER */}
      <section
        aria-label="Dynamischer Budget-Manager"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400" />
              Dynamische Alltagsbudgets verwalten
            </h2>
            <p className="text-xs text-slate-400">
              Budgets anlegen, Monatslimits (via onBlur Cent-Parser) anpassen und KW-Pacer
              aktivieren.
            </p>
          </div>
          <span className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-1 text-xs font-mono text-slate-300">
            NettoAlltag (Stufe 2): {formatCentsToEuro(obligations.stufe2NettoAlltagCents)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {budgets.map((budget) => (
            <div
              key={budget.id}
              className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{budget.name}</h3>
                  <span className="text-xs font-mono text-slate-400">
                    Verbraucht: {formatCentsToEuro(budget.spentCents)} • Überschuss:{' '}
                    {formatCentsToEuro(budget.surplusCents)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateBudget({
                        id: budget.id,
                        name: budget.name,
                        monthlyLimitCents: budget.monthlyLimitCents,
                        icon: budget.icon,
                        color: budget.color,
                        hasWeeklyPacer: !budget.hasWeeklyPacer,
                      })
                    }
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      budget.hasWeeklyPacer
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-700 bg-slate-900 text-slate-400'
                    }`}
                  >
                    KW-Pacer: {budget.hasWeeklyPacer ? 'Aktiv' : 'Aus'}
                  </button>

                  {budgets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteBudget(budget.id)}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:border-rose-500/40 hover:text-rose-400"
                      title="Budget löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`budget-name-${budget.id}`}
                    className="text-xs font-medium text-slate-300"
                  >
                    Budget-Name
                  </label>
                  <input
                    id={`budget-name-${budget.id}`}
                    type="text"
                    value={budget.name}
                    onChange={(e) =>
                      onUpdateBudget({
                        id: budget.id,
                        name: e.target.value,
                        monthlyLimitCents: budget.monthlyLimitCents,
                        icon: budget.icon,
                        color: budget.color,
                        hasWeeklyPacer: budget.hasWeeklyPacer,
                      })
                    }
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100"
                  />
                </div>

                <CentInput
                  id={`budget-limit-${budget.id}`}
                  label="Monatslimit (EUR)"
                  cents={budget.monthlyLimitCents}
                  onCommitCents={(newLimit) =>
                    onUpdateBudget({
                      id: budget.id,
                      name: budget.name,
                      monthlyLimitCents: newLimit,
                      icon: budget.icon,
                      color: budget.color,
                      hasWeeklyPacer: budget.hasWeeklyPacer,
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        {/* Neues Budget anlegen */}
        <form
          onSubmit={handleCreateBudget}
          className="mt-4 rounded-2xl border border-slate-800/90 bg-slate-900/50 p-4 space-y-3"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            Neues Alltagsbudget anlegen
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-budget-name" className="text-xs font-medium text-slate-300">
                Kategorie-Name
              </label>
              <input
                id="new-budget-name"
                type="text"
                value={newBudgetName}
                onChange={(e) => setNewBudgetName(e.target.value)}
                placeholder="z. B. Haustier, Kleidung"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100"
              />
            </div>

            <CentInput
              id="new-budget-limit"
              label="Monatslimit (EUR)"
              cents={newBudgetLimitCents}
              onCommitCents={setNewBudgetLimitCents}
            />

            <div className="flex flex-col gap-1">
              <label htmlFor="new-budget-icon" className="text-xs font-medium text-slate-300">
                Symbol
              </label>
              <select
                id="new-budget-icon"
                value={newBudgetIcon}
                onChange={(e) => setNewBudgetIcon(e.target.value)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100"
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newBudgetWeeklyPacer}
                onChange={(e) => setNewBudgetWeeklyPacer(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500"
              />
              Wochen-Pacer (KW-Soll vs. KW-Ist) aktivieren
            </label>

            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
            >
              Budget erstellen
            </button>
          </div>
        </form>
      </section>

      {/* 3. BUDGET-ROLLOVER & REALLOKATION */}
      <section
        aria-label="Budget-Rollover und Reallokation"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-sky-400" />
              Monatsende: Budget-Rollover & Reallokation
            </h2>
            <p className="text-xs text-slate-400">
              Unverbrauchte Überschüsse auf ING Tagesgeld gutschreiben (Modus A) oder in anderes
              Budget übertragen (Modus B).
            </p>
          </div>
          <span className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-mono text-sky-300">
            Gesamt-Überschuss: {formatCentsToEuro(totalBudgetSurplusCents)}
          </span>
        </div>

        <form onSubmit={handleExecuteRollover} className="mt-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRolloverMode('ING_TAGESGELD')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                rolloverMode === 'ING_TAGESGELD'
                  ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400'
              }`}
            >
              <Landmark className="h-4 w-4" />
              Modus A: Gutschrift ING Tagesgeld
            </button>
            <button
              type="button"
              onClick={() => setRolloverMode('REALLOCATE')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                rolloverMode === 'REALLOCATE'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400'
              }`}
            >
              <ArrowRight className="h-4 w-4" />
              Modus B: Übertrag in Alltagsbudget
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="rollover-source" className="text-xs font-medium text-slate-300">
                Quell-Budget (Überschuss)
              </label>
              <select
                id="rollover-source"
                value={rolloverSourceId}
                onChange={(e) => setRolloverSourceId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-slate-100"
              >
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (Frei: {formatCentsToEuro(b.surplusCents)})
                  </option>
                ))}
              </select>
            </div>

            {rolloverMode === 'REALLOCATE' ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="rollover-target" className="text-xs font-medium text-slate-300">
                  Ziel-Budget
                </label>
                <select
                  id="rollover-target"
                  value={rolloverTargetId}
                  onChange={(e) => setRolloverTargetId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-slate-100"
                >
                  {budgets
                    .filter((b) => b.id !== rolloverSourceId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col justify-center rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
                <span className="text-slate-400">Aktuelle ING Rollover-Gutschrift:</span>
                <span className="font-mono font-bold text-sky-300">
                  {formatCentsToEuro(obligations.ingRolloverCreditCents)}
                </span>
              </div>
            )}

            <CentInput
              id="rollover-amount-input"
              label={`Betrag (Max: ${formatCentsToEuro(selectedSourceBudget?.surplusCents ?? 0)})`}
              cents={rolloverAmountCents}
              onCommitCents={setRolloverAmountCents}
            />
          </div>

          <button
            type="submit"
            className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition"
          >
            {rolloverMode === 'ING_TAGESGELD'
              ? 'Auf ING Tagesgeld gutschreiben (senkt Gemeinsame Rücklagen)'
              : 'Überschuss umverteilen'}
          </button>
        </form>
      </section>
    </div>
  );
};
