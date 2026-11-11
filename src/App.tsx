import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  LayoutDashboard,
  PlusCircle,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
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
  formatCentsToEuro,
  generateWhatsAppReport,
  projectDashboard,
  reallocateBudgetSurplus,
  rolloverBudgetToIngTagesgeld,
  settleOpenCashClearing,
  togglePrivateLoanPause,
} from './finance';
import {
  AppStateV2,
  BudgetCategory,
  PayIn30Item,
  PrivateLoan,
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

export const App: React.FC = () => {
  const [state, setState] = useState<AppStateV2>(() => loadAppStateFromStorage());
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD');

  // Quick Entry Sheet State
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState<boolean>(false);
  const [quickEntryMode, setQuickEntryMode] = useState<QuickEntryMode>('TIP');
  const [quickExpenseTarget, setQuickExpenseTarget] =
    useState<ExpenseTargetType>('SHARED_BUDGET');
  const [quickBudgetId, setQuickBudgetId] = useState<string | undefined>(undefined);

  // Toast Feedback State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    saveAppStateToStorage(state);
  }, [state]);

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

  const projection = useMemo(() => projectDashboard(state), [state]);
  const whatsAppReportText = useMemo(() => generateWhatsAppReport(state), [state]);

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
    if (tx.type === 'INCOME_TIP') {
      showToast(`Trinkgeld (+${formatCentsToEuro(tx.cents)}) im Waterfall verbucht.`);
    } else if (tx.type === 'INCOME_SALARY') {
      showToast(`Gehalt (+${formatCentsToEuro(tx.cents)}) auf Pflichtlast angerechnet.`);
    } else {
      showToast(`Ausgabe (${formatCentsToEuro(tx.cents)}) gespeichert.`);
    }
  };

  const handleConfirmDeposit = () => {
    const reserved = projection.liquidity.bargeldReserviertBankCents;
    if (reserved <= 0) {
      return;
    }
    const depositTx: Transaction = {
      id: `tx-deposit-${Date.now()}`,
      timestamp: Date.now(),
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
    setState((prev) => settleOpenCashClearing(prev));
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

  // Pay-in-30 Handler
  const handleAddPayIn30Item = (item: PayIn30Item) => {
    setState((prev) => ({
      ...prev,
      payIn30Items: [...prev.payIn30Items, item],
    }));
    showToast(`Pay-in-30 „${item.name}“ (${formatCentsToEuro(item.cents)}) angelegt.`);
  };

  const handleRemovePayIn30Item = (id: string) => {
    setState((prev) => ({
      ...prev,
      payIn30Items: prev.payIn30Items.filter((item) => item.id !== id),
    }));
    showToast('Pay-in-30 Verbindlichkeit erledigt.');
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
    setState((prev) => rolloverBudgetToIngTagesgeld(prev, sourceBudgetId, amountCents));
    showToast(
      `Rollover Modus A: ${formatCentsToEuro(amountCents)} auf ING Tagesgeld gutgeschrieben.`
    );
  };

  const handleReallocateBudget = (
    sourceBudgetId: string,
    targetBudgetId: string,
    amountCents: number
  ) => {
    setState((prev) =>
      reallocateBudgetSurplus(prev, sourceBudgetId, targetBudgetId, amountCents)
    );
    showToast(`Rollover Modus B: ${formatCentsToEuro(amountCents)} erfolgreich umverteilt.`);
  };

  // Loan Handler
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

  const handleToggleLoanPause = (loanId: string) => {
    setState((prev) => togglePrivateLoanPause(prev, loanId));
    showToast('Darlehens-Status aktualisiert (Basisschuld unverändert).');
  };

  const handleDeleteLoan = (loanId: string) => {
    setState((prev) => ({
      ...prev,
      privateLoans: prev.privateLoans.filter((l) => l.id !== loanId),
    }));
    showToast('Darlehen entfernt.');
  };

  // Config & Ledger Handler
  const handleUpdateConfig = (newConfig: AppStateV2['config']) => {
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
      showToast('Backup erfolgreich importiert und auf Schema V2 migriert!');
    } catch {
      showToast('Fehler: Ungültige JSON-Backup-Datei.');
    }
  };

  const handleResetDefaults = () => {
    const fresh = resetAppStateInStorage();
    setState(fresh);
    showToast('Auf V2-Standardwerte zurückgesetzt.');
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-black text-sm">
              FP
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-slate-100">
                FlowPilot Partner A
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {projection.liquidity.invariants.valid
                    ? 'Invarianten 1 & 2 verifiziert • Offline PWA'
                    : 'Invarianz-Prüfung aktiv'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigations-Tabs */}
          <nav aria-label="Hauptnavigation" className="flex items-center gap-1 rounded-2xl bg-slate-900 p-1 border border-slate-800">
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
      </header>

      {/* Visuelles Toast-Feedback */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-2xl border border-emerald-500/50 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-emerald-200 shadow-2xl backdrop-blur-md"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
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
            onAddPayIn30Item={handleAddPayIn30Item}
            onRemovePayIn30Item={handleRemovePayIn30Item}
            onCopyWhatsAppReport={handleCopyWhatsAppReport}
          />
        )}

        {activeTab === 'BUDGETS_LOANS' && (
          <BudgetsAndLoansView
            budgets={projection.budgets}
            privateLoans={state.privateLoans}
            obligations={projection.obligations}
            totalBudgetSurplusCents={projection.totalBudgetSurplusCents}
            onAddBudget={handleAddBudget}
            onUpdateBudget={handleUpdateBudget}
            onDeleteBudget={handleDeleteBudget}
            onRolloverToIng={handleRolloverToIng}
            onReallocateBudget={handleReallocateBudget}
            onAddLoan={handleAddLoan}
            onUpdateLoan={handleUpdateLoan}
            onToggleLoanPause={handleToggleLoanPause}
            onDeleteLoan={handleDeleteLoan}
          />
        )}

        {activeTab === 'LEDGER_SETUP' && (
          <LedgerAndSetupView
            state={state}
            obligations={projection.obligations}
            onUpdateConfig={handleUpdateConfig}
            onDeleteTransaction={handleDeleteTransaction}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            onImportJsonText={handleImportJsonText}
            onResetDefaults={handleResetDefaults}
          />
        )}
      </main>

      {/* Daumen-Schnelleingabe-Bar (Google Pixel Bottom Bar) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#090d16]/95 backdrop-blur-lg safe-bottom">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            id="btn-thumb-add-tip"
            type="button"
            onClick={() => handleOpenQuickEntry('TIP')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-[0.98] transition"
          >
            <Coins className="h-4 w-4" />
            <span>+ Trinkgeld</span>
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
        budgets={state.budgets}
        freiesTaschengeldCents={projection.liquidity.freiesTaschengeldCents}
        verfuegbarerPufferCents={projection.liquidity.verfuegbarerPufferCents}
        pflichtLueckeNachEinzahlungCents={projection.liquidity.pflichtLueckeNachEinzahlungCents}
        bargeldReserviertBankCents={projection.liquidity.bargeldReserviertBankCents}
        onClose={() => setIsQuickEntryOpen(false)}
        onAddTransaction={handleAddTransaction}
      />
    </div>
  );
};

export default App;
