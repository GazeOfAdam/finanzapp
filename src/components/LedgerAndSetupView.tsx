import React, { useRef, useState } from 'react';
import {
  Database,
  Download,
  FileSpreadsheet,
  History,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatCentsToEuro, ObligationBreakdown } from '../finance';
import {
  AppStateV2,
  DEFAULT_KINDERGELD_CENTS,
  DEFAULT_WOHNGELD_CENTS,
  Transaction,
} from '../model';
import { CentInput } from './CentInput';

export interface LedgerAndSetupViewProps {
  state: AppStateV2;
  obligations: ObligationBreakdown;
  onUpdateConfig: (newConfig: AppStateV2['config']) => void;
  onDeleteTransaction: (txId: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImportJsonText: (jsonText: string) => void;
  onResetDefaults: () => void;
}

function getTransactionBadge(tx: Transaction) {
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
    case 'EXPENSE_SHARED':
      return {
        label: tx.markedForCashClearing ? 'Alltag (Barkauf 50:50)' : 'Alltagsbudget',
        color: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
        prefix: '-',
      };
    case 'EXPENSE_BUFFER':
      return {
        label: 'Gem.: 2× Puffer',
        color: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
        prefix: '-',
      };
    case 'EXPENSE_PRIVATE_A':
      return {
        label: `Privat A (${tx.category})`,
        color: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
        prefix: '-',
      };
  }
}

export const LedgerAndSetupView: React.FC<LedgerAndSetupViewProps> = ({
  state,
  obligations,
  onUpdateConfig,
  onDeleteTransaction,
  onExportCsv,
  onExportJson,
  onImportJsonText,
  onResetDefaults,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedTransactions = [...state.transactions]
    .filter((tx) => (filterType === 'ALL' ? true : tx.type === filterType))
    .sort((a, b) => b.timestamp - a.timestamp);

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

  return (
    <div className="space-y-5 pb-28">
      {/* 1. FIXKOSTEN & 5-STUFEN-SETUP */}
      <section
        aria-label="5-Stufen Fixkosten-Konfiguration"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Settings className="h-4 w-4 text-emerald-400" />
              5-Stufen-Pflichtlast & Basis-Parameter
            </h2>
            <p className="text-xs text-slate-400">
              Strikt getrennte Betriebskosten vs. Rücklagen (Sinking Funds). Alle Werte werden bei{' '}
              <code>onBlur</code> cent-genau geparst.
            </p>
          </div>
          <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-mono font-bold text-emerald-300">
            Pflichtlast A: {formatCentsToEuro(obligations.gesamtPflichtlastACents)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <CentInput
            id="config-sinking-funds"
            label="Gemeinsame Rücklagen / Sinking Funds (Stufe 3)"
            cents={state.config.sinkingFundsMonthlyCents}
            helperText="ING Tagesgeld: z. B. Kfz-Vers./12, GEZ/3, Hausrat/12"
            onCommitCents={(sinkingFundsMonthlyCents) =>
              onUpdateConfig({ ...state.config, sinkingFundsMonthlyCents })
            }
          />

          <CentInput
            id="config-private-abos"
            label="Private Abos Partner A (Stufe 5)"
            cents={state.config.privateSubscriptionsCents ?? 0}
            helperText="Mobilfunk, Streaming & rein private Fixkosten A"
            onCommitCents={(privateSubscriptionsCents) =>
              onUpdateConfig({ ...state.config, privateSubscriptionsCents })
            }
          />
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
            Zero-Cloud Exporte & V1/V2 Backup-Migration
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
            V1/V2 JSON importieren
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

          <select
            id="select-ledger-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
          >
            <option value="ALL">Alle Buchungstypen ({state.transactions.length})</option>
            <option value="INCOME_TIP">Nur Trinkgeld (INCOME_TIP)</option>
            <option value="INCOME_SALARY">Nur Gehalt (INCOME_SALARY)</option>
            <option value="DEPOSIT_CONFIRMED">Nur Einzahlungen (DEPOSIT_CONFIRMED)</option>
            <option value="EXPENSE_SHARED">Nur Alltagsbudgets (EXPENSE_SHARED)</option>
            <option value="EXPENSE_BUFFER">Nur 2× Puffer (EXPENSE_BUFFER)</option>
            <option value="EXPENSE_PRIVATE_A">Nur Privat A (EXPENSE_PRIVATE_A)</option>
          </select>
        </div>

        <div className="mt-4 space-y-2">
          {sortedTransactions.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
              Keine Buchungen für diesen Filter vorhanden.
            </div>
          ) : (
            sortedTransactions.map((tx) => {
              const badge = getTransactionBadge(tx);
              const dateStr = new Date(tx.timestamp).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });

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
