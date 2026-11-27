import React, { useRef, useState } from 'react';
import {
  Database,
  Download,
  FileSpreadsheet,
  History,
  Landmark,
  ListPlus,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatCentsToEuro, ObligationBreakdown } from '../finance';
import {
  AppStateV3,
  BudgetCategory,
  CustomObligationItem,
  CustomObligationScope,
  DEFAULT_KINDERGELD_CENTS,
  DEFAULT_WOHNGELD_CENTS,
  formatISODateGerman,
  formatYearMonthLabel,
  getSinkingFundMonthlyCents,
  getTransactionDateISO,
  getTransactionYearMonth,
  SinkingFundInterval,
  SinkingFundItem,
  SPECIAL_TASCHENGELD_BUDGET_ID,
  Transaction,
} from '../model';
import { CentInput } from './CentInput';

export interface LedgerAndSetupViewProps {
  state: AppStateV3;
  selectedYearMonth: string;
  obligations: ObligationBreakdown;
  onUpdateConfig: (newConfig: AppStateV3['config']) => void;
  onAddSinkingFundItem: (item: SinkingFundItem) => void;
  onUpdateSinkingFundItem: (item: SinkingFundItem) => void;
  onDeleteSinkingFundItem: (id: string) => void;
  onAddCustomObligation: (item: CustomObligationItem) => void;
  onUpdateCustomObligation: (item: CustomObligationItem) => void;
  onDeleteCustomObligation: (id: string) => void;
  onDeleteTransaction: (txId: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImportJsonText: (jsonText: string) => void;
  onResetDefaults: () => void;
}

const INTERVAL_OPTIONS: Array<{ value: SinkingFundInterval; label: string }> = [
  { value: 'MONTHLY', label: 'Monatlich (÷ 1)' },
  { value: 'QUARTERLY', label: 'Quartalsweise (÷ 3)' },
  { value: 'SEMI_ANNUAL', label: 'Halbjährlich (÷ 6)' },
  { value: 'ANNUAL', label: 'Jährlich (÷ 12)' },
];

function getTransactionBadge(tx: Transaction, budgets: BudgetCategory[]) {
  switch (tx.type) {
    case 'INCOME_SALARY':
      return {
        label: 'Gehaltseingang',
        color: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
        prefix: '+',
      };
    case 'INCOME_TIP':
      return {
        label: 'Schicht-Trinkgeld',
        color: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
        prefix: '+',
      };
    case 'DEPOSIT_CONFIRMED':
      return {
        label: 'Bankeinzahlung',
        color: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
        prefix: '⇄ ',
      };
    case 'EXPENSE_SHARED': {
      const clearingSuffix = tx.markedForCashClearing ? ' • Barkauf 50:50' : '';
      if (tx.budgetId === SPECIAL_TASCHENGELD_BUDGET_ID) {
        return {
          label: `Gemeinsam: Taschengeld (50:50)${clearingSuffix}`,
          color: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
          prefix: '-',
        };
      }
      const budget = budgets.find((b) => b.id === tx.budgetId);
      const budgetLabel = budget ? budget.name : tx.budgetId;
      return {
        label: `Alltag: ${budgetLabel}${clearingSuffix}`,
        color: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
        prefix: '-',
      };
    }
    case 'EXPENSE_PRIVATE_A':
      return {
        label: 'Privat A',
        color: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
        prefix: '-',
      };
  }
}

export const LedgerAndSetupView: React.FC<LedgerAndSetupViewProps> = ({
  state,
  selectedYearMonth,
  obligations,
  onUpdateConfig,
  onAddSinkingFundItem,
  onUpdateSinkingFundItem,
  onDeleteSinkingFundItem,
  onAddCustomObligation,
  onUpdateCustomObligation,
  onDeleteCustomObligation,
  onDeleteTransaction,
  onExportCsv,
  onExportJson,
  onImportJsonText,
  onResetDefaults,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [ledgerScope, setLedgerScope] = useState<'SELECTED_MONTH' | 'ALL_MONTHS'>('SELECTED_MONTH');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Neuen Sinking Fund anlegen
  const [newSfName, setNewSfName] = useState<string>('');
  const [newSfAmountCents, setNewSfAmountCents] = useState<number>(12_000);
  const [newSfInterval, setNewSfInterval] = useState<SinkingFundInterval>('ANNUAL');

  // Neuen eigenen Pflichtlast-Posten anlegen
  const [newCustomName, setNewCustomName] = useState<string>('');
  const [newCustomCents, setNewCustomCents] = useState<number>(0);
  const [newCustomScope, setNewCustomScope] = useState<CustomObligationScope>('SHARED_50_50');

  const scopedTransactions =
    ledgerScope === 'SELECTED_MONTH'
      ? state.transactions.filter((tx) => getTransactionYearMonth(tx) === selectedYearMonth)
      : state.transactions;

  const sortedTransactions = [...scopedTransactions]
    .filter((tx) => (filterType === 'ALL' ? true : tx.type === filterType))
    .sort((a, b) => {
      const dateCmp = getTransactionDateISO(b).localeCompare(getTransactionDateISO(a));
      return dateCmp !== 0 ? dateCmp : b.timestamp - a.timestamp;
    });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJsonText(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateSinkingFund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSfName.trim() || newSfAmountCents <= 0) {
      return;
    }
    onAddSinkingFundItem({
      id: `sf-${Date.now()}`,
      name: newSfName.trim(),
      amountCents: newSfAmountCents,
      interval: newSfInterval,
    });
    setNewSfName('');
    setNewSfAmountCents(12_000);
    setNewSfInterval('ANNUAL');
  };

  const handleCreateCustomObligation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomName.trim() || newCustomCents <= 0) {
      return;
    }
    onAddCustomObligation({
      id: `custom-obl-${Date.now()}`,
      name: newCustomName.trim(),
      monthlyCents: newCustomCents,
      scope: newCustomScope,
    });
    setNewCustomName('');
    setNewCustomCents(0);
    setNewCustomScope('SHARED_50_50');
  };

  return (
    <div className="space-y-5 pb-28">
      {/* 1. FIXKOSTEN, SINKING FUNDS & EIGENE PFLICHTLASTEN */}
      <section
        aria-label="5-Stufen Fixkosten-Konfiguration"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Settings className="h-4 w-4 text-emerald-400" />
              5-Stufen-Pflichtlast & Basis-Parameter
            </h2>
            <p className="text-xs text-slate-400">
              Strikt getrennte Betriebskosten, Tagesgeld-Rücklagen und eigene Pflichtposten. Private
              Abos verwaltest du unter „Budgets & Raten“.
            </p>
          </div>
          <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-mono font-bold text-emerald-300">
            Pflichtlast A: {formatCentsToEuro(obligations.gesamtPflichtlastACents)}
          </span>
        </div>

        {/* Basis-Parameter */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CentInput
            id="config-warmmiete"
            label="Warmmiete (Stufe 1)"
            cents={state.config.warmmieteCents}
            helperText="Monatliche Brutto-Warmmiete"
            onCommitCents={(warmmieteCents) =>
              onUpdateConfig({ ...state.config, warmmieteCents })
            }
          />

          <CentInput
            id="config-wohngeld"
            label="Wohngeld-Zuschuss (Stufe 1)"
            cents={state.config.wohngeldCents}
            helperText={`Standard-Vertragswert: ${formatCentsToEuro(DEFAULT_WOHNGELD_CENTS)}`}
            onCommitCents={(wohngeldCents) =>
              onUpdateConfig({ ...state.config, wohngeldCents })
            }
          />

          <CentInput
            id="config-operating-costs"
            label="Nebenkosten & Betriebsfixkosten (Stufe 1)"
            cents={state.config.operatingCostsCents}
            helperText="Strom, Gas, Internet & sonstige fixe Betriebskosten"
            onCommitCents={(operatingCostsCents) =>
              onUpdateConfig({ ...state.config, operatingCostsCents })
            }
          />

          <CentInput
            id="config-kindergeld"
            label="Kindergeld (Stufe 2)"
            cents={state.config.kindergeldCents}
            helperText={`Standard: ${formatCentsToEuro(DEFAULT_KINDERGELD_CENTS)} (finanziert 1:1 das Baby-Budget)`}
            onCommitCents={(kindergeldCents) =>
              onUpdateConfig({ ...state.config, kindergeldCents })
            }
          />
        </div>

        {/* Sinking Funds Einzelposten (Stufe 3) */}
        <div className="border-t border-slate-800/80 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Landmark className="h-4 w-4 text-sky-400" />
                Tagesgeld-Rücklagen / Sinking Funds (Stufe 3)
              </h3>
              <p className="text-xs text-slate-400">
                Turnus-Beträge (z. B. Kfz-Versicherung/Jahr, GEZ/Quartal) werden cent-genau in
                Monatsraten umgerechnet.
              </p>
            </div>
            <span className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-mono font-bold text-sky-300">
              Σ {formatCentsToEuro(obligations.sinkingFundsMonthlyCents)} / Mon.
            </span>
          </div>

          <div className="space-y-2">
            {state.sinkingFundItems.map((item) => {
              const monthlyRate = getSinkingFundMonthlyCents(item);
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      aria-label="Sinking-Fund Bezeichnung"
                      value={item.name}
                      onChange={(e) => onUpdateSinkingFundItem({ ...item, name: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs font-bold text-slate-100 hover:border-slate-800 focus:border-sky-500/60 focus:bg-slate-900 focus:outline-none"
                    />
                    <span className="shrink-0 rounded-lg bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[11px] font-mono font-bold text-sky-300">
                      → {formatCentsToEuro(monthlyRate)}/Mon.
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteSinkingFundItem(item.id)}
                      title="Sinking Fund löschen"
                      className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CentInput
                      id={`setup-sf-amount-${item.id}`}
                      label="Turnus-Betrag"
                      cents={item.amountCents}
                      onCommitCents={(amountCents) =>
                        onUpdateSinkingFundItem({ ...item, amountCents })
                      }
                      inputClassName="py-1.5 text-xs"
                    />
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`setup-sf-interval-${item.id}`}
                        className="text-xs font-medium text-slate-300 tracking-wide"
                      >
                        Turnus
                      </label>
                      <select
                        id={`setup-sf-interval-${item.id}`}
                        value={item.interval}
                        onChange={(e) =>
                          onUpdateSinkingFundItem({
                            ...item,
                            interval: e.target.value as SinkingFundInterval,
                          })
                        }
                        className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100"
                      >
                        {INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleCreateSinkingFund}
            className="rounded-2xl border border-slate-800/90 bg-slate-900/50 p-3 space-y-2.5"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              + Neuen Sinking-Fund-Posten anlegen
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                id="new-sf-name"
                type="text"
                value={newSfName}
                onChange={(e) => setNewSfName(e.target.value)}
                placeholder="z. B. Kfz-Versicherung, GEZ"
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100"
              />
              <CentInput
                id="new-sf-amount"
                cents={newSfAmountCents}
                onCommitCents={setNewSfAmountCents}
                inputClassName="py-2 text-xs"
              />
              <select
                id="new-sf-interval"
                value={newSfInterval}
                onChange={(e) => setNewSfInterval(e.target.value as SinkingFundInterval)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              id="btn-add-sinking-fund"
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Sinking Fund hinzufügen
            </button>
          </form>
        </div>

        {/* Eigene Pflichtlast-Posten (SHARED_50_50 oder PRIVATE_A) */}
        <div className="border-t border-slate-800/80 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <ListPlus className="h-4 w-4 text-emerald-400" />
                Eigene Pflichtlast-Posten
              </h3>
              <p className="text-xs text-slate-400">
                Gemeinsame Posten (50:50) fließen vor Stufe 4 ein, Privat-A-Posten (100 %) direkt in
                Stufe 5.
              </p>
            </div>
            {(obligations.customSharedObligationsCents > 0 ||
              obligations.customPrivateObligationsACents > 0) && (
              <span className="rounded-xl border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-[11px] font-mono text-slate-300">
                50:50: {formatCentsToEuro(obligations.customSharedObligationsCents)} • Privat A:{' '}
                {formatCentsToEuro(obligations.customPrivateObligationsACents)}
              </span>
            )}
          </div>

          {state.customObligations.length > 0 && (
            <div className="space-y-2">
              {state.customObligations.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/90 bg-slate-950/60 p-2.5"
                >
                  <input
                    type="text"
                    aria-label="Name Pflichtlast-Posten"
                    value={item.name}
                    onChange={(e) => onUpdateCustomObligation({ ...item, name: e.target.value })}
                    className="min-w-[120px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs font-semibold text-slate-100 hover:border-slate-800 focus:border-emerald-500/60 focus:bg-slate-900 focus:outline-none"
                  />
                  <select
                    aria-label="Zuordnung Pflichtlast-Posten"
                    value={item.scope}
                    onChange={(e) =>
                      onUpdateCustomObligation({
                        ...item,
                        scope: e.target.value as CustomObligationScope,
                      })
                    }
                    className="rounded-xl border border-slate-700/80 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="SHARED_50_50">Gemeinsam (50:50)</option>
                    <option value="PRIVATE_A">Privat A (100 %)</option>
                  </select>
                  <CentInput
                    id={`custom-obl-cents-${item.id}`}
                    cents={item.monthlyCents}
                    onCommitCents={(monthlyCents) =>
                      onUpdateCustomObligation({ ...item, monthlyCents })
                    }
                    className="w-28 shrink-0"
                    inputClassName="py-1.5 px-2.5 pr-7 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => onDeleteCustomObligation(item.id)}
                    title="Pflichtlast-Posten löschen"
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleCreateCustomObligation}
            className="rounded-2xl border border-slate-800/90 bg-slate-900/50 p-3 space-y-2.5"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              + Eigenen Pflichtlast-Posten hinzufügen
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                id="new-custom-obl-name"
                type="text"
                value={newCustomName}
                onChange={(e) => setNewCustomName(e.target.value)}
                placeholder="z. B. Kita-Beitrag, Garage..."
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100"
              />
              <CentInput
                id="new-custom-obl-cents"
                cents={newCustomCents}
                onCommitCents={setNewCustomCents}
                inputClassName="py-2 text-xs"
              />
              <select
                id="new-custom-obl-scope"
                value={newCustomScope}
                onChange={(e) => setNewCustomScope(e.target.value as CustomObligationScope)}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100"
              >
                <option value="SHARED_50_50">Gemeinsam (50:50)</option>
                <option value="PRIVATE_A">Privat A (100 %)</option>
              </select>
            </div>
            <button
              id="btn-add-custom-obligation"
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Pflichtlast hinzufügen
            </button>
          </form>
        </div>
      </section>

      {/* 2. EXPORTE (CSV MIT UTF-8 BOM) & MIGRATION */}
      <section
        aria-label="Datenexport und Backup"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-sky-400" />
          <h2 className="text-base font-bold text-slate-100">
            Zero-Cloud Exporte & Backup-Migration (V1/V2/V3)
          </h2>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Alle Daten liegen ausschließlich lokal in <code>localStorage</code>. Der CSV-Export nutzt
          UTF-8-BOM (<code>\uFEFF</code>) und Semikolon-Trennung für Excel/Calc.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <button
            id="btn-export-csv"
            type="button"
            onClick={onExportCsv}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-extrabold text-slate-950 hover:bg-emerald-400 transition"
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV-Export (UTF-8 BOM)
          </button>

          <button
            id="btn-export-json"
            type="button"
            onClick={onExportJson}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold text-slate-200 hover:border-sky-500/50 transition"
          >
            <Download className="h-4 w-4 text-sky-400" />
            JSON-Backup speichern
          </button>

          <button
            id="btn-import-json"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold text-slate-200 hover:border-amber-500/50 transition"
          >
            <Upload className="h-4 w-4 text-amber-400" />
            JSON importieren
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            id="btn-reset-defaults"
            type="button"
            onClick={onResetDefaults}
            className="flex items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-xs font-bold text-rose-300 hover:bg-rose-950/40 transition"
          >
            <RotateCcw className="h-4 w-4" />
            Demo-Daten zurücksetzen
          </button>
        </div>
      </section>

      {/* 3. APPEND-ONLY LEDGER (BUCHUNGSJOURNAL) */}
      <section
        aria-label="Buchungsjournal Ledger"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">
              Buchungsjournal (Event-Ledger)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Umschalter Aktiver Monat vs. Alle Monate */}
            <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setLedgerScope('SELECTED_MONTH')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  ledgerScope === 'SELECTED_MONTH'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {formatYearMonthLabel(selectedYearMonth)}
              </button>
              <button
                type="button"
                onClick={() => setLedgerScope('ALL_MONTHS')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  ledgerScope === 'ALL_MONTHS'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Alle Monate
              </button>
            </div>

            <select
              id="select-ledger-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">Alle Buchungstypen ({scopedTransactions.length})</option>
              <option value="INCOME_TIP">Nur Trinkgeld (INCOME_TIP)</option>
              <option value="INCOME_SALARY">Nur Gehalt (INCOME_SALARY)</option>
              <option value="DEPOSIT_CONFIRMED">Nur Einzahlungen (DEPOSIT_CONFIRMED)</option>
              <option value="EXPENSE_SHARED">Nur Gemeinsame Ausgaben (EXPENSE_SHARED)</option>
              <option value="EXPENSE_PRIVATE_A">Nur Privat A (EXPENSE_PRIVATE_A)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {sortedTransactions.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
              Keine Buchungen für diesen Filter vorhanden.
            </div>
          ) : (
            sortedTransactions.map((tx) => {
              const badge = getTransactionBadge(tx, state.budgets);
              const dateStr = formatISODateGerman(getTransactionDateISO(tx));

              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">{dateStr}</span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-slate-200">
                      {tx.note || 'Ohne Notiz'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm font-extrabold text-slate-100">
                      {badge.prefix}
                      {formatCentsToEuro(tx.cents)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx.id)}
                      title="Buchung stornieren / löschen"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
