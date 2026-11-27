import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  LayoutDashboard,
  PlusCircle,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  X,
} from 'lucide-react';
import { BudgetsAndLoansView } from './components/BudgetsAndLoansView';
import { DashboardView } from './components/DashboardView';
import { LedgerAndSetupView } from './components/LedgerAndSetupView';
import {
  ExpenseTargetType,
  QuickEntryMode,
  QuickEntrySheet,
} from './components/QuickEntrySheet';
import {
  confirmPrivateLoanPayment,
  formatCentsToEuro,
  generateWhatsAppReport,
  markPayIn30Paid,
  projectDashboard,
  reallocateBudgetSurplus,
  rolloverBudgetToIngTagesgeld,
  settleOpenCashClearing,
  split5050Cents,
  togglePrivateLoanPause,
  undoPrivateLoanPayment,
  unmarkPayIn30Paid,
  updateSinkingFundDeposit,
} from './finance';
import {
  AppStateV3,
  BudgetCategory,
  CustomObligationItem,
  dateStringToTimestamp,
  formatYearMonthLabel,
  getCurrentYearMonth,
  getLastDayOfYearMonthISO,
  getLocalTodayISO,
  getSinkingFundMonthlyCents,
  getTransactionYearMonth,
  PayIn30Item,
  PrivateLoan,
  PrivateSubscriptionItem,
  shiftYearMonth,
  SinkingFundDepositRecord,
  SinkingFundItem,
  Transaction,
} from './model';
import {
  downloadJsonBackup,
  downloadTransactionsCsv,
  loadAppStateFromStorage,
  parseAndMigrateJsonBackup,
  resetAppStateInStorage,
  saveAppStateToStorage,
} from './storage';

type ActiveTab = 'DASHBOARD' | 'BUDGETS_LOANS' | 'LEDGER_SETUP';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const App: React.FC = () => {
  const [state, setState] = useState<AppStateV3>(() => loadAppStateFromStorage());
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() => getCurrentYearMonth());
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD');

  // Quick Entry Sheet State
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState<boolean>(false);
  const [quickEntryMode, setQuickEntryMode] = useState<QuickEntryMode>('INCOME');
  const [quickExpenseTarget, setQuickExpenseTarget] =
    useState<ExpenseTargetType>('SHARED_BUDGET');
  const [quickBudgetId, setQuickBudgetId] = useState<string | undefined>(undefined);

  // PWA Install Prompt State
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
    );
  });
  const [showInstallGuideModal, setShowInstallGuideModal] = useState<boolean>(false);

  // Toast Feedback State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentCalendarMonth = getCurrentYearMonth();

  useEffect(() => {
    saveAppStateToStorage(state);
  }, [state]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandalone(true);
      setShowInstallGuideModal(false);
      showToast('FlowPilot erfolgreich als App installiert!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setToastMessage(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleInstallPwaClick = async () => {
    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredInstallPrompt(null);
      }
    } else {
      setShowInstallGuideModal(true);
    }
  };

  const projection = useMemo(
    () => projectDashboard(state, selectedYearMonth),
    [state, selectedYearMonth]
  );
  const whatsAppReportText = useMemo(
    () => generateWhatsAppReport(state, selectedYearMonth),
    [state, selectedYearMonth]
  );

  const handleOpenQuickEntry = (
    mode: QuickEntryMode,
    expenseTarget: ExpenseTargetType = 'SHARED_BUDGET',
    budgetId?: string
  ) => {
    setQuickEntryMode(mode);
    setQuickExpenseTarget(expenseTarget);
    setQuickBudgetId(budgetId ?? state.budgets[0]?.id);
    setIsQuickEntryOpen(true);
  };

  const handleAddTransaction = (tx: Transaction) => {
    setState((prev) => ({
      ...prev,
      transactions: [...prev.transactions, tx],
    }));
    const txYm = getTransactionYearMonth(tx);
    const monthSuffix =
      txYm !== selectedYearMonth ? ` (${formatYearMonthLabel(txYm)})` : '';
    if (tx.type === 'INCOME_TIP') {
      showToast(`Trinkgeld (+${formatCentsToEuro(tx.cents)}) verbucht${monthSuffix}.`);
    } else if (tx.type === 'INCOME_SALARY') {
      showToast(`Gehalt (+${formatCentsToEuro(tx.cents)}) verbucht${monthSuffix}.`);
    } else {
      showToast(`Ausgabe (${formatCentsToEuro(tx.cents)}) gespeichert${monthSuffix}.`);
    }
  };

  const handleConfirmDeposit = () => {
    const reserved = projection.liquidity.bargeldReserviertBankCents;
    if (reserved <= 0) {
      return;
    }
    const isCurrentMonth = selectedYearMonth === currentCalendarMonth;
    const depositDate = isCurrentMonth
      ? getLocalTodayISO()
      : getLastDayOfYearMonthISO(selectedYearMonth);

    const maxMonthTimestamp = projection.monthTransactions.reduce(
      (max, tx) => Math.max(max, tx.timestamp),
      0
    );
    const baseTimestamp = isCurrentMonth
      ? Date.now()
      : dateStringToTimestamp(depositDate);
    const depositTimestamp = Math.max(baseTimestamp, maxMonthTimestamp + 1_000);

    const depositTx: Transaction = {
      id: `tx-deposit-${Date.now()}`,
      timestamp: depositTimestamp,
      date: depositDate,
      cents: reserved,
      type: 'DEPOSIT_CONFIRMED',
      note: 'Bestätigte Bareinzahlung auf Bankkonto',
    };
    setState((prev) => ({
      ...prev,
      transactions: [...prev.transactions, depositTx],
    }));
    showToast(`Einzahlung über ${formatCentsToEuro(reserved)} bestätigt! Pflichtlücke gesenkt.`);
  };

  const handleSettleCashClearing = () => {
    setState((prev) => settleOpenCashClearing(prev, selectedYearMonth));
    showToast('Offene Barausgleich-Posten (50:50) als ausgeglichen markiert.');
  };

  const handleCopyWhatsAppReport = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(whatsAppReportText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = whatsAppReportText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      showToast('📊 WhatsApp-Report in die Zwischenablage kopiert!');
    } catch {
      showToast('Kopieren fehlgeschlagen – bitte Text manuell markieren.');
    }
  };

  // Sinking Funds & Tagesgeld-Einzahlungen Handler
  const handleUpdateSinkingFundDeposit = (
    itemId: string,
    update: Partial<SinkingFundDepositRecord>
  ) => {
    setState((prev) => updateSinkingFundDeposit(prev, selectedYearMonth, itemId, update));
  };

  const handleMarkAllSinkingFundsPaidBy = (partner: 'A' | 'B') => {
    setState((prev) => {
      let next = prev;
      for (const item of prev.sinkingFundItems) {
        const share = split5050Cents(getSinkingFundMonthlyCents(item));
        next = updateSinkingFundDeposit(
          next,
          selectedYearMonth,
          item.id,
          partner === 'A' ? { paidByACents: share } : { paidByBCents: share }
        );
      }
      return next;
    });
    showToast(
      `Tagesgeld-Anteil Partner ${partner} für ${formatYearMonthLabel(selectedYearMonth)} als eingezahlt markiert.`
    );
  };

  const handleAddSinkingFundItem = (item: SinkingFundItem) => {
    setState((prev) => ({
      ...prev,
      sinkingFundItems: [...prev.sinkingFundItems, item],
    }));
    showToast(`Tagesgeld-Posten „${item.name}“ hinzugefügt.`);
  };

  const handleUpdateSinkingFundItem = (updated: SinkingFundItem) => {
    setState((prev) => ({
      ...prev,
      sinkingFundItems: prev.sinkingFundItems.map((i) => (i.id === updated.id ? updated : i)),
    }));
  };

  const handleDeleteSinkingFundItem = (id: string) => {
    setState((prev) => ({
      ...prev,
      sinkingFundItems: prev.sinkingFundItems.filter((i) => i.id !== id),
    }));
    showToast('Tagesgeld-Posten entfernt.');
  };

  // Eigene Pflichtlast-Posten Handler
  const handleAddCustomObligation = (item: CustomObligationItem) => {
    setState((prev) => ({
      ...prev,
      customObligations: [...prev.customObligations, item],
    }));
    showToast(`Pflichtlast „${item.name}“ hinzugefügt.`);
  };

  const handleUpdateCustomObligation = (updated: CustomObligationItem) => {
    setState((prev) => ({
      ...prev,
      customObligations: prev.customObligations.map((i) => (i.id === updated.id ? updated : i)),
    }));
  };

  const handleDeleteCustomObligation = (id: string) => {
    setState((prev) => ({
      ...prev,
      customObligations: prev.customObligations.filter((i) => i.id !== id),
    }));
    showToast('Pflichtlast-Posten entfernt.');
  };

  // Pay-in-30 Handler (getrennt: Bezahlt bestätigen / rückgängig vs. Löschen)
  const handleAddPayIn30Item = (item: PayIn30Item) => {
    setState((prev) => ({
      ...prev,
      payIn30Items: [...prev.payIn30Items, item],
    }));
    showToast(`Pay-in-30 „${item.name}“ (${formatCentsToEuro(item.cents)}) angelegt.`);
  };

  const handleMarkPayIn30Paid = (id: string) => {
    setState((prev) => markPayIn30Paid(prev, id, selectedYearMonth));
    showToast(
      `Pay-in-30 als bezahlt markiert (bleibt in ${formatYearMonthLabel(selectedYearMonth)} blockiert).`
    );
  };

  const handleUnmarkPayIn30Paid = (id: string) => {
    setState((prev) => unmarkPayIn30Paid(prev, id));
    showToast('Pay-in-30 wieder auf offen gesetzt.');
  };

  const handleDeletePayIn30Item = (id: string) => {
    setState((prev) => ({
      ...prev,
      payIn30Items: prev.payIn30Items.filter((item) => item.id !== id),
    }));
    showToast('Pay-in-30 Eintrag vollständig gelöscht.');
  };

  // Budget & Rollover Handler
  const handleAddBudget = (budget: BudgetCategory) => {
    setState((prev) => ({
      ...prev,
      budgets: [...prev.budgets, budget],
    }));
    showToast(`Budget „${budget.name}“ hinzugefügt.`);
  };

  const handleUpdateBudget = (updated: BudgetCategory) => {
    setState((prev) => ({
      ...prev,
      budgets: prev.budgets.map((b) => (b.id === updated.id ? updated : b)),
    }));
  };

  const handleDeleteBudget = (budgetId: string) => {
    setState((prev) => ({
      ...prev,
      budgets: prev.budgets.filter((b) => b.id !== budgetId),
    }));
    showToast('Budget gelöscht.');
  };

  const handleRolloverToIng = (sourceBudgetId: string, amountCents: number) => {
    setState((prev) =>
      rolloverBudgetToIngTagesgeld(prev, sourceBudgetId, amountCents, selectedYearMonth)
    );
    showToast(
      `Rollover: ${formatCentsToEuro(amountCents)} auf Tagesgeld (${formatYearMonthLabel(selectedYearMonth)}) gutgeschrieben.`
    );
  };

  const handleReallocateBudget = (
    sourceBudgetId: string,
    targetBudgetId: string,
    amountCents: number
  ) => {
    setState((prev) =>
      reallocateBudgetSurplus(
        prev,
        sourceBudgetId,
        targetBudgetId,
        amountCents,
        selectedYearMonth
      )
    );
    showToast(
      `${formatCentsToEuro(amountCents)} in ${formatYearMonthLabel(selectedYearMonth)} erfolgreich umverteilt.`
    );
  };

  // Loan Handler (pro Monat)
  const handleAddLoan = (loan: PrivateLoan) => {
    setState((prev) => ({
      ...prev,
      privateLoans: [...prev.privateLoans, loan],
    }));
    showToast(`Darlehen „${loan.name}“ angelegt.`);
  };

  const handleUpdateLoan = (updated: PrivateLoan) => {
    setState((prev) => ({
      ...prev,
      privateLoans: prev.privateLoans.map((l) => (l.id === updated.id ? updated : l)),
    }));
  };

  const handleConfirmLoanPayment = (loanId: string) => {
    setState((prev) => confirmPrivateLoanPayment(prev, loanId, selectedYearMonth));
    showToast(
      `Monatsrate (${formatYearMonthLabel(selectedYearMonth)}) bestätigt & Restschuld gesenkt.`
    );
  };

  const handleUndoLoanPayment = (loanId: string) => {
    setState((prev) => undoPrivateLoanPayment(prev, loanId, selectedYearMonth));
    showToast('Ratenzahlung storniert & Restschuld wiederhergestellt.');
  };

  const handleToggleLoanPause = (loanId: string) => {
    setState((prev) => togglePrivateLoanPause(prev, loanId, selectedYearMonth));
    showToast(
      `Darlehens-Status für ${formatYearMonthLabel(selectedYearMonth)} aktualisiert (Restschuld unverändert).`
    );
  };

  const handleDeleteLoan = (loanId: string) => {
    setState((prev) => ({
      ...prev,
      privateLoans: prev.privateLoans.filter((l) => l.id !== loanId),
    }));
    showToast('Darlehen entfernt.');
  };

  // Private Abos Handler
  const handleAddSubscription = (item: PrivateSubscriptionItem) => {
    setState((prev) => ({
      ...prev,
      privateSubscriptionItems: [...prev.privateSubscriptionItems, item],
    }));
    showToast(`Abo „${item.name}“ (${formatCentsToEuro(item.monthlyCents)}) hinzugefügt.`);
  };

  const handleUpdateSubscription = (updated: PrivateSubscriptionItem) => {
    setState((prev) => ({
      ...prev,
      privateSubscriptionItems: prev.privateSubscriptionItems.map((s) =>
        s.id === updated.id ? updated : s
      ),
    }));
  };

  const handleDeleteSubscription = (subId: string) => {
    setState((prev) => ({
      ...prev,
      privateSubscriptionItems: prev.privateSubscriptionItems.filter((s) => s.id !== subId),
    }));
    showToast('Abo entfernt.');
  };

  // Config & Ledger Handler
  const handleUpdateConfig = (newConfig: AppStateV3['config']) => {
    setState((prev) => ({
      ...prev,
      config: newConfig,
    }));
  };

  const handleDeleteTransaction = (txId: string) => {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((tx) => tx.id !== txId),
    }));
    showToast('Buchung aus dem Ledger entfernt.');
  };

  const handleExportCsv = () => {
    downloadTransactionsCsv(state);
    showToast('CSV-Export (UTF-8-BOM) gestartet.');
  };

  const handleExportJson = () => {
    downloadJsonBackup(state);
    showToast('JSON-Backup heruntergeladen.');
  };

  const handleImportJsonText = (jsonText: string) => {
    try {
      const migrated = parseAndMigrateJsonBackup(jsonText);
      setState(migrated);
      showToast('Backup erfolgreich importiert und auf Schema V3 migriert!');
    } catch {
      showToast('Fehler: Ungültige JSON-Backup-Datei.');
    }
  };

  const handleResetDefaults = () => {
    const fresh = resetAppStateInStorage();
    setState(fresh);
    setSelectedYearMonth(getCurrentYearMonth());
    showToast('Auf V3-Standardwerte zurückgesetzt.');
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      {/* Top App Bar + Monatswahl */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#090d16]/95 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-black text-sm">
                FP
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-100">
                  FlowPilot Partner A
                </h1>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldCheck
                    className={`h-3.5 w-3.5 shrink-0 ${
                      projection.liquidity.invariants.valid
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  />
                  <span className="truncate">Cent-genau • Offline PWA</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isStandalone && (
                <button
                  id="btn-install-pwa"
                  type="button"
                  onClick={handleInstallPwaClick}
                  title="Als App auf dem Smartphone installieren"
                  className="flex items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline sm:inline">Installieren</span>
                </button>
              )}

              {/* Navigations-Tabs */}
              <nav
                aria-label="Hauptnavigation"
                className="flex items-center gap-1 rounded-2xl bg-slate-900 p-1 border border-slate-800"
              >
                <button
                  id="nav-tab-dashboard"
                  type="button"
                  onClick={() => setActiveTab('DASHBOARD')}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                    activeTab === 'DASHBOARD'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </button>
                <button
                  id="nav-tab-budgets-loans"
                  type="button"
                  onClick={() => setActiveTab('BUDGETS_LOANS')}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                    activeTab === 'BUDGETS_LOANS'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Budgets & Raten</span>
                </button>
                <button
                  id="nav-tab-ledger-setup"
                  type="button"
                  onClick={() => setActiveTab('LEDGER_SETUP')}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                    activeTab === 'LEDGER_SETUP'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Setup & Export</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Globale Monatswahl (< November 2026 > + Schnellbutton zurück zum aktuellen Monat) */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-800/90 bg-slate-900/70 px-2 py-1">
            <button
              id="btn-prev-month"
              type="button"
              onClick={() => setSelectedYearMonth((ym) => shiftYearMonth(ym, -1))}
              aria-label="Vorheriger Monat"
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-slate-100">
                <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                {formatYearMonthLabel(selectedYearMonth)}
              </span>

              {selectedYearMonth !== currentCalendarMonth && (
                <button
                  id="btn-jump-current-month"
                  type="button"
                  onClick={() => setSelectedYearMonth(currentCalendarMonth)}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/25 transition"
                >
                  Aktueller Monat
                </button>
              )}
            </div>

            <button
              id="btn-next-month"
              type="button"
              onClick={() => setSelectedYearMonth((ym) => shiftYearMonth(ym, 1))}
              aria-label="Nächster Monat"
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Visuelles Toast-Feedback */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-28 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-2xl border border-emerald-500/50 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-emerald-200 shadow-2xl backdrop-blur-md"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* PWA Installations-Anleitung Modal */}
      {showInstallGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <Smartphone className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-100">
                  Auf Google Pixel / Smartphone installieren
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuideModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                <div className="font-bold text-emerald-300">
                  Android / Google Pixel (Chrome):
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>
                    Tippe oben rechts in Chrome auf das <strong>Drei-Punkte-Menü (⋮)</strong>.
                  </li>
                  <li>
                    Wähle <strong>„App installieren“</strong> oder{' '}
                    <strong>„Zum Startbildschirm hinzufügen“</strong>.
                  </li>
                  <li>
                    Bestätige mit <strong>Installieren</strong> – FlowPilot startet danach als
                    eigenständige Vollbild-App (offlinefähig via Service Worker).
                  </li>
                </ol>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                <div className="font-bold text-sky-300">iOS (Safari):</div>
                <p>
                  Tippe unten auf das <strong>Teilen-Symbol</strong> und wähle{' '}
                  <strong>„Zum Home-Bildschirm“</strong>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowInstallGuideModal(false)}
              className="w-full rounded-2xl bg-emerald-500 py-3 text-xs font-extrabold text-slate-950"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}

      {/* Hauptinhalt */}
      <main className="mx-auto max-w-2xl px-4 pt-4">
        {activeTab === 'DASHBOARD' && (
          <DashboardView
            projection={projection}
            whatsAppReportText={whatsAppReportText}
            onConfirmDeposit={handleConfirmDeposit}
            onSettleCashClearing={handleSettleCashClearing}
            onOpenQuickEntry={handleOpenQuickEntry}
            onUpdateSinkingFundDeposit={handleUpdateSinkingFundDeposit}
            onMarkAllSinkingFundsPaidBy={handleMarkAllSinkingFundsPaidBy}
            onAddSinkingFundItem={handleAddSinkingFundItem}
            onAddPayIn30Item={handleAddPayIn30Item}
            onMarkPayIn30Paid={handleMarkPayIn30Paid}
            onUnmarkPayIn30Paid={handleUnmarkPayIn30Paid}
            onDeletePayIn30Item={handleDeletePayIn30Item}
            onCopyWhatsAppReport={handleCopyWhatsAppReport}
          />
        )}

        {activeTab === 'BUDGETS_LOANS' && (
          <BudgetsAndLoansView
            selectedYearMonth={selectedYearMonth}
            budgets={projection.budgets}
            privateLoans={state.privateLoans}
            privateSubscriptions={state.privateSubscriptionItems}
            obligations={projection.obligations}
            totalBudgetSurplusCents={projection.totalBudgetSurplusCents}
            onSelectYearMonth={setSelectedYearMonth}
            onAddBudget={handleAddBudget}
            onUpdateBudget={handleUpdateBudget}
            onDeleteBudget={handleDeleteBudget}
            onRolloverToIng={handleRolloverToIng}
            onReallocateBudget={handleReallocateBudget}
            onAddLoan={handleAddLoan}
            onUpdateLoan={handleUpdateLoan}
            onConfirmLoanPayment={handleConfirmLoanPayment}
            onUndoLoanPayment={handleUndoLoanPayment}
            onToggleLoanPause={handleToggleLoanPause}
            onDeleteLoan={handleDeleteLoan}
            onAddSubscription={handleAddSubscription}
            onUpdateSubscription={handleUpdateSubscription}
            onDeleteSubscription={handleDeleteSubscription}
          />
        )}

        {activeTab === 'LEDGER_SETUP' && (
          <LedgerAndSetupView
            state={state}
            selectedYearMonth={selectedYearMonth}
            obligations={projection.obligations}
            onUpdateConfig={handleUpdateConfig}
            onAddSinkingFundItem={handleAddSinkingFundItem}
            onUpdateSinkingFundItem={handleUpdateSinkingFundItem}
            onDeleteSinkingFundItem={handleDeleteSinkingFundItem}
            onAddCustomObligation={handleAddCustomObligation}
            onUpdateCustomObligation={handleUpdateCustomObligation}
            onDeleteCustomObligation={handleDeleteCustomObligation}
            onDeleteTransaction={handleDeleteTransaction}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onImportJsonText={handleImportJsonText}
            onResetDefaults={handleResetDefaults}
          />
        )}
      </main>

      {/* Daumen-Schnelleingabe-Bar (Google Pixel Bottom Bar): + Einnahmen & + Ausgabe */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#090d16]/95 backdrop-blur-lg safe-bottom">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            id="btn-thumb-add-income"
            type="button"
            onClick={() => handleOpenQuickEntry('INCOME')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-[0.98] transition"
          >
            <Coins className="h-4 w-4" />
            <span>+ Einnahmen</span>
          </button>

          <button
            id="btn-thumb-add-expense"
            type="button"
            onClick={() => handleOpenQuickEntry('EXPENSE', 'SHARED_BUDGET')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/15 py-3.5 text-sm font-extrabold text-amber-300 shadow-lg hover:bg-amber-500/25 active:scale-[0.98] transition"
          >
            <PlusCircle className="h-4 w-4" />
            <span>+ Ausgabe</span>
          </button>
        </div>
      </div>

      {/* Schnelleingabe Bottom-Sheet */}
      <QuickEntrySheet
        isOpen={isQuickEntryOpen}
        initialMode={quickEntryMode}
        initialExpenseTarget={quickExpenseTarget}
        initialBudgetId={quickBudgetId}
        selectedYearMonth={selectedYearMonth}
        budgets={state.budgets}
        freiesTaschengeldCents={projection.liquidity.freiesTaschengeldCents}
        pflichtLueckeNachEinzahlungCents={projection.liquidity.pflichtLueckeNachEinzahlungCents}
        bargeldReserviertBankCents={projection.liquidity.bargeldReserviertBankCents}
        ungedecktesPflichtSollCents={projection.liquidity.ungedecktesPflichtSollCents}
        onClose={() => setIsQuickEntryOpen(false)}
        onAddTransaction={handleAddTransaction}
      />
    </div>
  );
};

export default App;
