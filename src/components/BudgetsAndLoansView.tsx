import React, { useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Landmark,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  BudgetProjection,
  formatCentsToEuro,
  getLoanMonthStatus,
  ObligationBreakdown,
} from '../finance';
import {
  BudgetCategory,
  formatYearMonthLabel,
  formatYearMonthShort,
  PrivateLoan,
  PrivateSubscriptionItem,
  shiftYearMonth,
} from '../model';
import { CentInput } from './CentInput';

export interface BudgetsAndLoansViewProps {
  selectedYearMonth: string;
  budgets: BudgetProjection[];
  privateLoans: PrivateLoan[];
  privateSubscriptions: PrivateSubscriptionItem[];
  obligations: ObligationBreakdown;
  totalBudgetSurplusCents: number;
  onSelectYearMonth: (ym: string) => void;
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
  onConfirmLoanPayment: (loanId: string) => void;
  onUndoLoanPayment: (loanId: string) => void;
  onToggleLoanPause: (loanId: string) => void;
  onDeleteLoan: (loanId: string) => void;
  onAddSubscription: (item: PrivateSubscriptionItem) => void;
  onUpdateSubscription: (item: PrivateSubscriptionItem) => void;
  onDeleteSubscription: (subId: string) => void;
}

const ICON_OPTIONS = [
  { value: 'ShoppingCart', label: 'Einkaufswagen' },
  { value: 'Sparkles', label: 'Drogerie / Glanz' },
  { value: 'Baby', label: 'Baby / Kind' },
  { value: 'Car', label: 'Auto / Mobilität' },
  { value: 'Heart', label: 'Familie / Freizeit' },
  { value: 'Wallet', label: 'Standard-Wallet' },
];

function buildLoanOverviewMonths(loan: PrivateLoan, selectedYearMonth: string): string[] {
  const monthSet = new Set<string>();
  for (let offset = -4; offset <= 1; offset++) {
    monthSet.add(shiftYearMonth(selectedYearMonth, offset));
  }
  for (const ym of Object.keys(loan.monthlyRecords)) {
    monthSet.add(ym);
  }
  return Array.from(monthSet).sort();
}

export const BudgetsAndLoansView: React.FC<BudgetsAndLoansViewProps> = ({
  selectedYearMonth,
  budgets,
  privateLoans,
  privateSubscriptions,
  obligations,
  totalBudgetSurplusCents,
  onSelectYearMonth,
  onAddBudget,
  onUpdateBudget,
  onDeleteBudget,
  onRolloverToIng,
  onReallocateBudget,
  onAddLoan,
  onUpdateLoan,
  onConfirmLoanPayment,
  onUndoLoanPayment,
  onToggleLoanPause,
  onDeleteLoan,
  onAddSubscription,
  onUpdateSubscription,
  onDeleteSubscription,
}) => {
  // Aufklappbare Monatsübersicht je Darlehen (standardmäßig offen oder umschaltbar)
  const [collapsedHistoryIds, setCollapsedHistoryIds] = useState<Record<string, boolean>>({});

  // Neues Darlehen anlegen
  const [newLoanName, setNewLoanName] = useState<string>('');
  const [newLoanRateCents, setNewLoanRateCents] = useState<number>(8_000);
  const [newLoanTotalCents, setNewLoanTotalCents] = useState<number>(96_000);
  const [newLoanRemainingCents, setNewLoanRemainingCents] = useState<number>(96_000);

  // Neues Privat-Abo anlegen (kompakter Einzeiler)
  const [newSubName, setNewSubName] = useState<string>('');
  const [newSubCents, setNewSubCents] = useState<number>(0);

  // Neues Budget anlegen
  const [newBudgetName, setNewBudgetName] = useState<string>('');
  const [newBudgetLimitCents, setNewBudgetLimitCents] = useState<number>(15_000);
  const [newBudgetIcon, setNewBudgetIcon] = useState<string>('ShoppingCart');
  const [newBudgetWeeklyPacer, setNewBudgetWeeklyPacer] = useState<boolean>(true);

  // Rollover-Steuerung
  const [rolloverMode, setRolloverMode] = useState<'ING_TAGESGELD' | 'REALLOCATE'>('REALLOCATE');
  const [rolloverSourceId, setRolloverSourceId] = useState<string>(budgets[0]?.id ?? '');
  const [rolloverTargetId, setRolloverTargetId] = useState<string>(budgets[1]?.id ?? '');
  const [rolloverAmountCents, setRolloverAmountCents] = useState<number>(2_500);

  const effectiveSourceId = budgets.some((b) => b.id === rolloverSourceId)
    ? rolloverSourceId
    : (budgets[0]?.id ?? '');
  const effectiveTargetId = budgets.some(
    (b) => b.id === rolloverTargetId && b.id !== effectiveSourceId
  )
    ? rolloverTargetId
    : (budgets.find((b) => b.id !== effectiveSourceId)?.id ?? '');

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
      monthlyRecords: {},
    });
    setNewLoanName('');
    setNewLoanRateCents(8_000);
    setNewLoanTotalCents(96_000);
    setNewLoanRemainingCents(96_000);
  };

  const handleCreateSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim() || newSubCents <= 0) {
      return;
    }
    onAddSubscription({
      id: `sub-${Date.now()}`,
      name: newSubName.trim(),
      monthlyCents: newSubCents,
    });
    setNewSubName('');
    setNewSubCents(0);
  };

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
    if (!effectiveSourceId || rolloverAmountCents <= 0) {
      return;
    }
    if (rolloverMode === 'ING_TAGESGELD') {
      onRolloverToIng(effectiveSourceId, rolloverAmountCents);
    } else if (effectiveTargetId && effectiveTargetId !== effectiveSourceId) {
      onReallocateBudget(effectiveSourceId, effectiveTargetId, rolloverAmountCents);
    }
  };

  const selectedSourceBudget = budgets.find((b) => b.id === effectiveSourceId) ?? budgets[0];

  return (
    <div className="space-y-5 pb-28">
      {/* 1. DARLEHENS-MANAGER INKL. RATENBESTÄTIGUNG, PAUSIERUNG & MONATSÜBERSICHT */}
      <section
        aria-label="Darlehens-Manager mit Monatsübersicht und Ratenbestätigung"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Private Darlehen & Monatsraten ({formatYearMonthLabel(selectedYearMonth)})
            </h2>
            <p className="text-xs text-slate-400">
              Bezahlte Raten senken die Restschuld und bleiben im Bezahlmonat in der Pflichtlast.
              Stundungen senken nur den gewählten Monat.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs font-mono">
            <span className="text-slate-400">Raten {formatYearMonthShort(selectedYearMonth)}: </span>
            <strong className="text-amber-300">
              {formatCentsToEuro(obligations.activePrivateLoanRatesCents)}
            </strong>
          </div>
        </div>

        {/* Transparentes Pausierungs-Banner */}
        {obligations.pausedLoansCount > 0 && (
          <div className="mt-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs">
            <div className="font-bold text-amber-200">
              {obligations.pausedLoansCount} Darlehen in {formatYearMonthLabel(selectedYearMonth)}{' '}
              ausgesetzt (Entlastung: {formatCentsToEuro(obligations.pausedLoansMonthlyReliefCents)})
            </div>
            <p className="mt-0.5 text-amber-300/80 text-[11px]">
              Die ausgesetzten Raten mindern nur die Pflichtlast in{' '}
              {formatYearMonthLabel(selectedYearMonth)}. Die Restschuld (
              {formatCentsToEuro(obligations.totalLoanRemainingDebtCents)}) bleibt unverändert.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {privateLoans.map((loan) => {
            const monthStatus = getLoanMonthStatus(loan, selectedYearMonth);
            const monthRecord = loan.monthlyRecords[selectedYearMonth];
            const confirmedPaidCents =
              monthStatus === 'PAID'
                ? (monthRecord?.paidCents ?? loan.monthlyRateCents)
                : 0;
            const dueThisMonthCents = Math.min(loan.monthlyRateCents, loan.remainingCents);
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
                : 100;

            const overviewMonths = buildLoanOverviewMonths(loan, selectedYearMonth);
            const isHistoryOpen = !collapsedHistoryIds[loan.id];

            return (
              <div
                key={loan.id}
                className={`rounded-2xl border p-4 transition ${
                  monthStatus === 'PAID'
                    ? 'border-emerald-500/40 bg-emerald-950/15'
                    : monthStatus === 'PAUSED'
                      ? 'border-amber-500/40 bg-amber-950/15'
                      : 'border-slate-800/90 bg-slate-950/60'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100">{loan.name}</h3>
                      {monthStatus === 'PAID' ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                          <Check className="h-3 w-3" />
                          Bezahlt ({formatCentsToEuro(confirmedPaidCents)})
                        </span>
                      ) : monthStatus === 'PAUSED' ? (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                          Ausgesetzt ({formatYearMonthShort(selectedYearMonth)})
                        </span>
                      ) : loan.remainingCents === 0 ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          Vollständig getilgt
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                          Offen ({formatCentsToEuro(dueThisMonthCents)})
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400 font-mono">
                      Restschuld: {formatCentsToEuro(loan.remainingCents)} von{' '}
                      {formatCentsToEuro(loan.totalAmountCents)} ({paidPercent}% getilgt)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteLoan(loan.id)}
                    className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:border-rose-500/40 hover:text-rose-400"
                    title="Darlehen löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Aktions-Buttons für den gewählten Monat */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {monthStatus === 'PAID' ? (
                    <button
                      id={`btn-undo-loan-pay-${loan.id}`}
                      type="button"
                      onClick={() => onUndoLoanPayment(loan.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Zahlung stornieren ({formatYearMonthShort(selectedYearMonth)})
                    </button>
                  ) : (
                    <>
                      {loan.remainingCents > 0 && (
                        <button
                          id={`btn-pay-loan-${loan.id}`}
                          type="button"
                          onClick={() => onConfirmLoanPayment(loan.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 transition"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Monatsrate bezahlt ({formatCentsToEuro(dueThisMonthCents)})
                        </button>
                      )}

                      {(loan.remainingCents > 0 || monthStatus === 'PAUSED') && (
                        <button
                          id={`btn-pause-loan-${loan.id}`}
                          type="button"
                          onClick={() => onToggleLoanPause(loan.id)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                            monthStatus === 'PAUSED'
                              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                              : 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                          }`}
                        >
                          {monthStatus === 'PAUSED' ? (
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
                      )}
                    </>
                  )}
                </div>

                {/* Parameter: Rate & Restschuld */}
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
                    label="Aktuelle Restschuld (EUR)"
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

                {/* Kompakte / aufklappbare Monatsübersicht je Darlehen */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedHistoryIds((prev) => ({
                        ...prev,
                        [loan.id]: !prev[loan.id],
                      }))
                    }
                    className="flex w-full items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                  >
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      Monatsübersicht & Zahlungshistorie
                    </span>
                    {isHistoryOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {isHistoryOpen && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {overviewMonths.map((ym) => {
                        const status = getLoanMonthStatus(loan, ym);
                        const rec = loan.monthlyRecords[ym];
                        const isSelected = ym === selectedYearMonth;

                        const pillClass =
                          status === 'PAID'
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                            : status === 'PAUSED'
                              ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                              : 'border-slate-700/80 bg-slate-900/70 text-slate-400';

                        const statusWord =
                          status === 'PAID'
                            ? `Bezahlt (${formatCentsToEuro(rec?.paidCents ?? loan.monthlyRateCents)})`
                            : status === 'PAUSED'
                              ? 'Ausgesetzt'
                              : 'Offen';

                        return (
                          <button
                            key={ym}
                            type="button"
                            onClick={() => onSelectYearMonth(ym)}
                            title={`${formatYearMonthLabel(ym)}: ${statusWord}`}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-mono font-semibold transition hover:brightness-110 ${pillClass} ${
                              isSelected ? 'ring-2 ring-sky-400/70 ring-offset-1 ring-offset-slate-950' : ''
                            }`}
                          >
                            <span>{formatYearMonthShort(ym)}</span>
                            <span>
                              {status === 'PAID' ? '✓' : status === 'PAUSED' ? '⏸' : '•'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                placeholder="z. B. Auto-Rate an Partnerin"
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

      {/* 2. PRIVATE ABOS (PARTNER A) – direkt unterhalb Private Darlehen als kompakte Einzeiler */}
      <section
        aria-label="Private Abos Partner A"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Repeat className="h-4 w-4 text-rose-400" />
              Private Abos (Partner A)
            </h2>
            <p className="text-xs text-slate-400">
              100 % in Stufe 5 (Private Pflicht A) – z. B. Mobilfunk, Streaming, Fitness.
            </p>
          </div>
          <span className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-1 text-xs font-mono text-rose-300 font-bold">
            Σ {formatCentsToEuro(obligations.privateAbosCents)} / Mon.
          </span>
        </div>

        <div className="mt-3.5 space-y-2">
          {privateSubscriptions.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-center text-xs text-slate-400">
              Keine privaten Abos erfasst.
            </div>
          ) : (
            privateSubscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-2 rounded-xl border border-slate-800/90 bg-slate-950/60 px-2.5 py-2"
              >
                <input
                  id={`sub-name-${sub.id}`}
                  type="text"
                  aria-label="Abo-Bezeichnung"
                  value={sub.name}
                  onChange={(e) => onUpdateSubscription({ ...sub, name: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-slate-100 hover:border-slate-800 focus:border-emerald-500/70 focus:bg-slate-900 focus:outline-none"
                />
                <CentInput
                  id={`sub-cents-${sub.id}`}
                  cents={sub.monthlyCents}
                  onCommitCents={(monthlyCents) =>
                    onUpdateSubscription({ ...sub, monthlyCents })
                  }
                  className="w-28 shrink-0"
                  inputClassName="py-1.5 px-2.5 pr-7 text-xs"
                />
                <button
                  type="button"
                  onClick={() => onDeleteSubscription(sub.id)}
                  title="Abo löschen"
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Kompakte Einzeiler-Eingabe für neues Abo */}
        <form onSubmit={handleCreateSubscription} className="mt-3 flex items-center gap-2">
          <input
            id="new-sub-name"
            type="text"
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            placeholder="Neues Abo (z. B. Spotify, Handy...)"
            className="min-w-0 flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          <CentInput
            id="new-sub-cents"
            cents={newSubCents}
            onCommitCents={setNewSubCents}
            className="w-28 shrink-0"
            inputClassName="py-2 px-2.5 pr-7 text-xs"
          />
          <button
            id="btn-add-subscription"
            type="submit"
            title="Abo hinzufügen"
            className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 transition"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Neu</span>
          </button>
        </form>
      </section>

      {/* 3. DYNAMISCHER BUDGET-MANAGER */}
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
              Basis-Monatslimits (gelten für jeden Monat) anpassen und KW-Pacer aktivieren.
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
                    Verbraucht ({formatYearMonthShort(selectedYearMonth)}):{' '}
                    {formatCentsToEuro(budget.spentCents)} • Überschuss:{' '}
                    {formatCentsToEuro(budget.surplusCents)}
                  </span>
                  {budget.adjustmentCents !== 0 && (
                    <span className="block text-[11px] font-mono text-sky-300 mt-0.5">
                      Monats-Reallokation: {budget.adjustmentCents > 0 ? '+' : ''}
                      {formatCentsToEuro(budget.adjustmentCents)} → Effektiv:{' '}
                      {formatCentsToEuro(budget.monthlyLimitCents)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateBudget({
                        id: budget.id,
                        name: budget.name,
                        monthlyLimitCents: budget.baseMonthlyLimitCents,
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
                        monthlyLimitCents: budget.baseMonthlyLimitCents,
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
                  label="Basis-Monatslimit (EUR)"
                  cents={budget.baseMonthlyLimitCents}
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

      {/* 4. BUDGET-REALLOKATION & ROLLOVER (für den aktiven Monat) */}
      <section
        aria-label="Budget-Rollover und Reallokation"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-sky-400" />
              Budget-Reallokation & Rollover ({formatYearMonthLabel(selectedYearMonth)})
            </h2>
            <p className="text-xs text-slate-400">
              Übertrage Überschüsse innerhalb von {formatYearMonthLabel(selectedYearMonth)} zwischen
              Alltagsbudgets oder als Tagesgeld-Gutschrift. Ungenutzte Budgets verfallen zum
              Monatsende.
            </p>
          </div>
          <span className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-mono text-sky-300">
            Rest-Überschuss: {formatCentsToEuro(totalBudgetSurplusCents)}
          </span>
        </div>

        <form onSubmit={handleExecuteRollover} className="mt-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
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
              Übertrag in Alltagsbudget
            </button>
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
              Gutschrift Tagesgeld
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="rollover-source" className="text-xs font-medium text-slate-300">
                Quell-Budget (Überschuss)
              </label>
              <select
                id="rollover-source"
                value={effectiveSourceId}
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
                  value={effectiveTargetId}
                  onChange={(e) => setRolloverTargetId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-slate-100"
                >
                  {budgets
                    .filter((b) => b.id !== effectiveSourceId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col justify-center rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
                <span className="text-slate-400">
                  Tagesgeld-Gutschrift ({formatYearMonthShort(selectedYearMonth)}):
                </span>
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
              ? 'Auf Tagesgeld gutschreiben (senkt Gemeinsame Rücklagen)'
              : 'Überschuss umverteilen'}
          </button>
        </form>
      </section>
    </div>
  );
};
