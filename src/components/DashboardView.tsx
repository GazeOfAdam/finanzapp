import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Baby,
  Banknote,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Heart,
  Landmark,
  Plus,
  RotateCcw,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  formatCentsToEuro,
  FullDashboardProjection,
  TrafficLightStatus,
} from '../finance';
import {
  formatISODateGerman,
  formatYearMonthLabel,
  getCurrentYearMonth,
  getLocalTodayISO,
  PayIn30Item,
  SinkingFundDepositRecord,
  SinkingFundInterval,
  SinkingFundItem,
} from '../model';
import { CentInput } from './CentInput';
import { ExpenseTargetType, QuickEntryMode } from './QuickEntrySheet';

export interface DashboardViewProps {
  projection: FullDashboardProjection;
  whatsAppReportText: string;
  onConfirmDeposit: () => void;
  onSettleCashClearing: () => void;
  onOpenQuickEntry: (
    mode: QuickEntryMode,
    expenseTarget?: ExpenseTargetType,
    budgetId?: string
  ) => void;
  onUpdateSinkingFundDeposit: (itemId: string, update: Partial<SinkingFundDepositRecord>) => void;
  onMarkAllSinkingFundsPaidBy: (partner: 'A' | 'B') => void;
  onAddSinkingFundItem: (item: SinkingFundItem) => void;
  onAddPayIn30Item: (item: PayIn30Item) => void;
  onMarkPayIn30Paid: (id: string) => void;
  onUnmarkPayIn30Paid: (id: string) => void;
  onDeletePayIn30Item: (id: string) => void;
  onCopyWhatsAppReport: () => void;
}

const INTERVAL_SHORT_LABELS: Record<SinkingFundInterval, string> = {
  MONTHLY: 'Monat',
  QUARTERLY: 'Quartal',
  SEMI_ANNUAL: 'Halbjahr',
  ANNUAL: 'Jahr',
};

function renderBudgetIcon(iconName: string) {
  switch (iconName) {
    case 'ShoppingCart':
      return <ShoppingCart className="h-4 w-4" />;
    case 'Sparkles':
      return <Sparkles className="h-4 w-4" />;
    case 'Baby':
      return <Baby className="h-4 w-4" />;
    case 'Car':
      return <Car className="h-4 w-4" />;
    case 'Heart':
      return <Heart className="h-4 w-4" />;
    default:
      return <Wallet className="h-4 w-4" />;
  }
}

function getTrafficLightStyles(status: TrafficLightStatus) {
  switch (status) {
    case 'GREEN':
      return {
        badgeBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
        cardBorder: 'border-emerald-500/35',
        glowBg: 'from-emerald-950/40 via-[#101726] to-[#101726]',
        dot: 'bg-emerald-400',
        label: 'Vollständig gedeckt',
      };
    case 'YELLOW':
      return {
        badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
        cardBorder: 'border-amber-500/40',
        glowBg: 'from-amber-950/35 via-[#101726] to-[#101726]',
        dot: 'bg-amber-400',
        label: 'Bargeld reserviert (Einzahlung offen)',
      };
    case 'RED':
      return {
        badgeBg: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
        cardBorder: 'border-rose-500/40',
        glowBg: 'from-rose-950/40 via-[#101726] to-[#101726]',
        dot: 'bg-rose-400',
        label: 'Pflicht-Soll ungedeckt',
      };
  }
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projection,
  whatsAppReportText,
  onConfirmDeposit,
  onSettleCashClearing,
  onOpenQuickEntry,
  onUpdateSinkingFundDeposit,
  onMarkAllSinkingFundsPaidBy,
  onAddSinkingFundItem,
  onAddPayIn30Item,
  onMarkPayIn30Paid,
  onUnmarkPayIn30Paid,
  onDeletePayIn30Item,
  onCopyWhatsAppReport,
}) => {
  const { selectedYearMonth, obligations, liquidity, budgets, tagesgeld, cashClearing, payIn30 } =
    projection;

  const [showFormulaDetails, setShowFormulaDetails] = useState<boolean>(false);
  const [expandedSfId, setExpandedSfId] = useState<string | null>(null);
  const [showAddSfForm, setShowAddSfForm] = useState<boolean>(false);
  const [newSfName, setNewSfName] = useState<string>('');
  const [newSfAmountCents, setNewSfAmountCents] = useState<number>(12_000);
  const [newSfInterval, setNewSfInterval] = useState<SinkingFundInterval>('ANNUAL');

  const [showAddPayIn30, setShowAddPayIn30] = useState<boolean>(false);
  const [newPay30Name, setNewPay30Name] = useState<string>('');
  const [newPay30Cents, setNewPay30Cents] = useState<number>(3_500);
  const [newPay30DueDate, setNewPay30DueDate] = useState<string>(() => {
    if (selectedYearMonth === getCurrentYearMonth()) {
      return getLocalTodayISO();
    }
    return `${selectedYearMonth}-15`;
  });

  const ampelStyle = getTrafficLightStyles(liquidity.ampelStatus);

  const coveredOnBankCents =
    liquidity.gesamtPflichtlastACents - liquidity.pflichtLueckeNachEinzahlungCents;
  const bankCoveragePercent =
    liquidity.gesamtPflichtlastACents > 0
      ? Math.min(100, Math.round((coveredOnBankCents * 100) / liquidity.gesamtPflichtlastACents))
      : 100;

  const totalCoverageIncludingReservedCents =
    coveredOnBankCents + liquidity.bargeldReserviertBankCents;
  const totalCoveragePercent =
    liquidity.gesamtPflichtlastACents > 0
      ? Math.min(
          100,
          Math.round(
            (totalCoverageIncludingReservedCents * 100) / liquidity.gesamtPflichtlastACents
          )
        )
      : 100;

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
    setShowAddSfForm(false);
  };

  const handleCreatePayIn30 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPay30Name.trim() || newPay30Cents <= 0 || !newPay30DueDate) {
      return;
    }
    onAddPayIn30Item({
      id: `pay30-${Date.now()}`,
      name: newPay30Name.trim(),
      cents: newPay30Cents,
      dueDate: newPay30DueDate,
    });
    setNewPay30Name('');
    setNewPay30Cents(3_500);
    setShowAddPayIn30(false);
  };

  const pocketSubtext = (() => {
    const parts: string[] = [];
    if (liquidity.carryoverToTaschengeldCents > 0) {
      parts.push(`Vormonat +${formatCentsToEuro(liquidity.carryoverToTaschengeldCents)}`);
    }
    if (liquidity.privatausgabenGesamtACents > 0) {
      parts.push(`Ausg. -${formatCentsToEuro(liquidity.privatausgabenGesamtACents)}`);
    }
    if (parts.length === 0) {
      return 'Gehalt + Trinkgeld Überschuss';
    }
    return parts.join(' • ');
  })();

  return (
    <div className="space-y-4 pb-28">
      {/* 1. KERNWERT: Ampel-Statuskarte mit 2x2-Grid inkl. Freies Taschengeld A */}
      <section
        aria-label="Pflichtlast-Ampel und Deckungsstatus"
        className={`rounded-3xl border ${ampelStyle.cardBorder} bg-gradient-to-br ${ampelStyle.glowBg} p-5 shadow-xl`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            1. Pflichtdeckung Partner A
          </span>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${ampelStyle.badgeBg}`}
          >
            <span className={`h-2 w-2 rounded-full ${ampelStyle.dot}`} />
            <span>{ampelStyle.label}</span>
          </div>
        </div>

        {/* 2x2 Kachel-Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {/* Oben links: Ungedecktes Pflicht-Soll */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Ungedecktes Pflicht-Soll
            </span>
            <span
              className={`mt-1 block text-xl font-extrabold font-mono tabular-nums ${
                liquidity.ungedecktesPflichtSollCents > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {formatCentsToEuro(liquidity.ungedecktesPflichtSollCents)}
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Fehlt real nach Bar-Reserve
            </span>
          </div>

          {/* Oben rechts: Reserviert für Bank */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Reserviert für Bank
            </span>
            <span className="mt-1 block text-xl font-extrabold font-mono tabular-nums text-amber-300">
              {formatCentsToEuro(liquidity.bargeldReserviertBankCents)}
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Bar zuhause (Trinkgeld)
            </span>
          </div>

          {/* Unten links: Gesamt-Pflichtlast A */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Gesamt-Pflichtlast A
            </span>
            <span className="mt-1 block text-xl font-extrabold font-mono tabular-nums text-slate-100">
              {formatCentsToEuro(liquidity.gesamtPflichtlastACents)}
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Offen auf Bank: {formatCentsToEuro(liquidity.pflichtLueckeNachEinzahlungCents)}
            </span>
          </div>

          {/* Unten rechts: Freies Taschengeld A */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Freies Taschengeld A
            </span>
            <span
              className={`mt-1 block text-xl font-extrabold font-mono tabular-nums ${
                liquidity.freiesTaschengeldCents >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatCentsToEuro(liquidity.freiesTaschengeldCents)}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-slate-500" title={pocketSubtext}>
              {pocketSubtext}
            </span>
          </div>
        </div>

        {/* Transparenter Vormonats-Überschuss (Carryover) Hinweis */}
        {liquidity.carryoverFromPrevMonthCents > 0 && (
          <div className="mt-3 rounded-2xl border border-sky-500/35 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200">
            <span className="font-bold">
              Vormonats-Übertrag: +{formatCentsToEuro(liquidity.carryoverFromPrevMonthCents)}
            </span>{' '}
            <span className="text-sky-300/90">
              ({formatCentsToEuro(liquidity.carryoverToTagesgeldCents)} → Tagesgeld-Anteil A
              {liquidity.carryoverToTaschengeldCents > 0
                ? `, ${formatCentsToEuro(liquidity.carryoverToTaschengeldCents)} → Start-Taschengeld`
                : ''}
              )
            </span>
          </div>
        )}

        {/* Zweistufiger Deckungsbalken (Bankkonto grün + Bar reserviert gelb) */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-300">
            <span>
              Bank-Deckung: <strong>{bankCoveragePercent}%</strong> (inkl. Bar-Reserve:{' '}
              <strong>{totalCoveragePercent}%</strong>)
            </span>
            <span className="font-mono text-slate-400">
              {formatCentsToEuro(totalCoverageIncludingReservedCents)} /{' '}
              {formatCentsToEuro(liquidity.gesamtPflichtlastACents)}
            </span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
            <div
              className="absolute left-0 top-0 h-full bg-amber-400/80 transition-all duration-300"
              style={{ width: `${totalCoveragePercent}%` }}
            />
            <div
              className="absolute left-0 top-0 h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${bankCoveragePercent}%` }}
            />
          </div>
        </div>

        {/* 1-Klick Einzahlung bestätigen (DEPOSIT_CONFIRMED) */}
        {liquidity.bargeldReserviertBankCents > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs">
              <div className="font-bold text-amber-200 flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-amber-400" />
                {formatCentsToEuro(liquidity.bargeldReserviertBankCents)} Trinkgeld liegen für die
                Bank bereit
              </div>
              <p className="text-amber-300/80 text-[11px] mt-0.5">
                Mit Klick auf „Einzahlung bestätigen“ wird das reservierte Bargeld auf das Bankkonto
                gebucht und die Pflichtlücke gesenkt.
              </p>
            </div>
            <button
              id="btn-confirm-deposit"
              type="button"
              onClick={onConfirmDeposit}
              className="shrink-0 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-md hover:bg-amber-300 active:scale-[0.99] transition"
            >
              Einzahlung bestätigen ({formatCentsToEuro(liquidity.bargeldReserviertBankCents)})
            </button>
          </div>
        )}

        {/* Ausklappbare 5-Stufen-Pflichtlast-Formel */}
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <button
            id="btn-toggle-5-stages"
            type="button"
            onClick={() => setShowFormulaDetails((prev) => !prev)}
            className="flex w-full items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <span>Entflechtete 5-Stufen-Pflichtlast anzeigen</span>
            {showFormulaDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showFormulaDetails && (
            <div className="mt-3 space-y-2 rounded-2xl bg-slate-950/80 p-3.5 text-xs border border-slate-800/80 font-mono">
              <div className="flex justify-between text-slate-300">
                <span>1. NettoWohnen (Warmmiete - Wohngeld + NK):</span>
                <span>{formatCentsToEuro(obligations.stufe1NettoWohnenCents)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>
                  2. NettoAlltag (Σ Budgets - Kindergeld
                  {obligations.totalBudgetOverrunCents > 0
                    ? ` + ${formatCentsToEuro(obligations.totalBudgetOverrunCents)} Überziehung`
                    : ''}
                  ):
                </span>
                <span>{formatCentsToEuro(obligations.stufe2NettoAlltagCents)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>3. Gemeinsame Rücklagen (Tagesgeld):</span>
                <span>{formatCentsToEuro(obligations.stufe3GemeinsameRuecklagenCents)}</span>
              </div>
              {obligations.customSharedObligationsCents > 0 && (
                <div className="flex justify-between text-slate-300">
                  <span>+ Eigene Pflichtlasten (50:50):</span>
                  <span>{formatCentsToEuro(obligations.customSharedObligationsCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-emerald-300 pt-1.5 border-t border-slate-800 font-semibold">
                <span>4. Gemeinschaftsanteil A (50 % gerundet):</span>
                <span>{formatCentsToEuro(obligations.stufe4GemeinschaftsanteilACents)}</span>
              </div>
              <div className="flex justify-between text-amber-300 font-semibold">
                <span>5. Private Pflicht A (Raten + Abos + Eigene + PayIn30):</span>
                <span>{formatCentsToEuro(obligations.stufe5PrivatePflichtACents)}</span>
              </div>
              <div className="flex justify-between text-slate-100 pt-1.5 border-t border-slate-800 font-bold text-sm">
                <span>= GesamtPflichtlastA:</span>
                <span>{formatCentsToEuro(obligations.gesamtPflichtlastACents)}</span>
              </div>
              {liquidity.carryoverToTagesgeldCents > 0 && (
                <div className="flex justify-between text-sky-300 pt-1 border-t border-slate-800/70">
                  <span>- Vormonats-Übertrag auf Tagesgeld A:</span>
                  <span>-{formatCentsToEuro(liquidity.carryoverToTagesgeldCents)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 2. Alltagsbudgets & Wochen-Pacer */}
      <section
        aria-label="Gemeinsame Alltagsbudgets und Wochen-Pacer"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              Gemeinsame Alltagsbudgets & Wochen-Pacer
            </h2>
            <p className="text-xs text-slate-400">
              Kindergeld ({formatCentsToEuro(obligations.kindergeldCents)}) deckt 1:1 das Baby-Budget
            </p>
          </div>
          <div className="flex items-center gap-2">
            {obligations.totalBudgetOverrunCents > 0 && (
              <span className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-xs font-mono font-bold text-rose-300">
                Überzogen: +{formatCentsToEuro(obligations.totalBudgetOverrunCents)}
              </span>
            )}
            <span className="rounded-xl bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-300 border border-slate-800">
              Σ Limit: {formatCentsToEuro(obligations.sumAlltagsbudgetsCents)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {budgets.map((budget) => {
            const isOverBudget = budget.overrunCents > 0;
            const barColor = isOverBudget
              ? 'bg-rose-500'
              : budget.utilizationPercent >= 85
                ? 'bg-amber-400'
                : 'bg-emerald-500';

            return (
              <div
                key={budget.id}
                className={`flex flex-col justify-between rounded-2xl border p-3.5 ${
                  isOverBudget
                    ? 'border-rose-500/45 bg-rose-950/15'
                    : 'border-slate-800/90 bg-slate-950/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-emerald-400">
                        {renderBudgetIcon(budget.icon)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-xs font-bold text-slate-100">{budget.name}</h3>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatCentsToEuro(budget.spentCents)} /{' '}
                          {formatCentsToEuro(budget.monthlyLimitCents)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenQuickEntry('EXPENSE', 'SHARED_BUDGET', budget.id)}
                      className="shrink-0 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      + Buchen
                    </button>
                  </div>

                  {/* Fortschrittsbalken */}
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                    <div
                      className={`h-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${Math.min(100, budget.utilizationPercent)}%` }}
                    />
                  </div>

                  <div className="mt-1.5 flex justify-between text-[11px]">
                    <span className="text-slate-400">{budget.utilizationPercent}% genutzt</span>
                    <span
                      className={`font-mono font-semibold ${
                        isOverBudget ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      Rest: {formatCentsToEuro(budget.remainingCents)}
                    </span>
                  </div>

                  {/* Klarer Überziehungs-Hinweis (50% auf Pflichtlast A) */}
                  {isOverBudget && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Überzogen um {formatCentsToEuro(budget.overrunCents)} • 50 % auf Pflichtlast
                        A
                      </span>
                    </div>
                  )}
                </div>

                {/* Optionaler Wochen-Pacer (KW-Soll vs. KW-Ist) */}
                {budget.hasWeeklyPacer && (
                  <div className="mt-2.5 rounded-xl border border-slate-800/80 bg-slate-900/70 px-2.5 py-2 text-[11px]">
                    <div className="flex items-center justify-between font-semibold text-slate-300">
                      <span>KW-Pacer (Woche):</span>
                      <span
                        className={`font-mono ${
                          budget.weeklyRemainingCents >= 0 ? 'text-emerald-400' : 'text-amber-300'
                        }`}
                      >
                        KW-Rest: {formatCentsToEuro(budget.weeklyRemainingCents)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>KW-Soll: {formatCentsToEuro(budget.weeklyTargetCents)}</span>
                      <span>KW-Ist: {formatCentsToEuro(budget.weeklySpentCents)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. TAGESGELDKONTO-PFLICHTLASTEN (SINKING FUNDS) direkt unter den Alltagsbudgets */}
      <section
        aria-label="Tagesgeldkonto Pflichtlasten Sinking Funds"
        className="rounded-3xl border border-sky-500/25 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-sky-400" />
              <h2 className="text-sm font-bold text-slate-100">
                Tagesgeldkonto-Pflichtlasten (Sinking Funds)
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Monatliche Pflichtrücklagen (50:50) • Kein Ausgabenbudget
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-mono font-semibold text-sky-300">
              Offen: {formatCentsToEuro(tagesgeld.remainingTotalCents)}
            </span>
            <button
              id="btn-toggle-add-sf-dashboard"
              type="button"
              onClick={() => setShowAddSfForm((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-sky-500/50"
            >
              <Plus className="h-3.5 w-3.5" /> Posten
            </button>
          </div>
        </div>

        {/* Gesamtbalken Tagesgeld-Einzahlungen im gewählten Monat */}
        <div className="mt-3.5 rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              Monatsziel ({formatYearMonthLabel(selectedYearMonth)}):{' '}
              <span className="font-mono text-sky-300">
                {formatCentsToEuro(tagesgeld.monthlyTargetTotalCents)}
              </span>
            </span>
            <span className="font-mono text-slate-400">
              Eingezahlt: {formatCentsToEuro(tagesgeld.paidTotalCents)} ({tagesgeld.progressPercent}
              %)
            </span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                tagesgeld.remainingTotalCents === 0 ? 'bg-emerald-500' : 'bg-sky-500'
              }`}
              style={{ width: `${tagesgeld.progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2">
              <div className="min-w-0">
                <span className="block text-[11px] text-slate-400">Partner A (50 %)</span>
                <span className="font-mono font-semibold text-slate-200">
                  {formatCentsToEuro(tagesgeld.paidByATotalCents)} /{' '}
                  {formatCentsToEuro(tagesgeld.partnerATargetCents)}
                </span>
              </div>
              {tagesgeld.remainingPartnerACents > 0 && tagesgeld.items.length > 0 ? (
                <button
                  id="btn-mark-all-sf-a"
                  type="button"
                  onClick={() => onMarkAllSinkingFundsPaidBy('A')}
                  className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
                >
                  A voll
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <Check className="h-3 w-3" /> Gedeckt
                </span>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2">
              <div className="min-w-0">
                <span className="block text-[11px] text-slate-400">Partner B (50 %)</span>
                <span className="font-mono font-semibold text-slate-200">
                  {formatCentsToEuro(tagesgeld.paidByBTotalCents)} /{' '}
                  {formatCentsToEuro(tagesgeld.partnerBTargetCents)}
                </span>
              </div>
              {tagesgeld.remainingPartnerBCents > 0 && tagesgeld.items.length > 0 ? (
                <button
                  id="btn-mark-all-sf-b"
                  type="button"
                  onClick={() => onMarkAllSinkingFundsPaidBy('B')}
                  className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25"
                >
                  B voll
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <Check className="h-3 w-3" /> Bezahlt
                </span>
              )}
            </div>
          </div>

          {tagesgeld.carryoverToTagesgeldCents > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-[11px] text-emerald-200">
              Vormonats-Überschuss deckt bereits{' '}
              <strong className="font-mono">
                {formatCentsToEuro(tagesgeld.carryoverToTagesgeldCents)}
              </strong>{' '}
              von Partner A&apos;s Tagesgeld-Pflichtanteil ab.
            </div>
          )}

          {tagesgeld.ingRolloverCreditCents > 0 && (
            <div className="text-[11px] text-slate-400 font-mono">
              Inkl. ING Rollover-Gutschrift: -{formatCentsToEuro(tagesgeld.ingRolloverCreditCents)}
            </div>
          )}
        </div>

        {/* Schnellformular für neuen Sinking-Fund-Posten */}
        {showAddSfForm && (
          <form
            onSubmit={handleCreateSinkingFund}
            className="mt-3 space-y-2.5 rounded-2xl border border-slate-700 bg-slate-900/90 p-3.5"
          >
            <div className="text-xs font-bold text-slate-200">
              Neuen Tagesgeld-Posten (Sinking Fund) hinzufügen
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <input
                type="text"
                value={newSfName}
                onChange={(e) => setNewSfName(e.target.value)}
                placeholder="z. B. Kfz-Steuer, GEZ"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100"
              />
              <CentInput
                id="dashboard-new-sf-amount"
                cents={newSfAmountCents}
                onCommitCents={setNewSfAmountCents}
              />
              <select
                value={newSfInterval}
                onChange={(e) => setNewSfInterval(e.target.value as SinkingFundInterval)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100"
              >
                <option value="MONTHLY">Monatlich (÷ 1)</option>
                <option value="QUARTERLY">Quartalsweise (÷ 3)</option>
                <option value="SEMI_ANNUAL">Halbjährlich (÷ 6)</option>
                <option value="ANNUAL">Jährlich (÷ 12)</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-sky-500 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400"
            >
              Sinking Fund anlegen
            </button>
          </form>
        )}

        {/* Einzelposten mit Fortschrittsbalken und Partner-A/B-Einzahlungssteuerung */}
        <div className="mt-3 space-y-2">
          {tagesgeld.items.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4 text-center text-xs text-slate-400">
              Keine Tagesgeld-Pflichtposten angelegt. Füge oben oder unter „Setup & Export“ Posten
              hinzu.
            </div>
          ) : (
            tagesgeld.items.map((sf) => {
              const isExpanded = expandedSfId === sf.item.id;
              const isPaidA = sf.paidByACents >= sf.shareACents && sf.shareACents > 0;
              const isPaidB = sf.paidByBCents >= sf.shareBCents && sf.shareBCents > 0;

              return (
                <div
                  key={sf.item.id}
                  className="rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-slate-100">
                          {sf.item.name}
                        </span>
                        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                          {formatCentsToEuro(sf.item.amountCents)} /{' '}
                          {INTERVAL_SHORT_LABELS[sf.item.interval]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-400">
                        Rate: <strong className="text-slate-200">{formatCentsToEuro(sf.monthlyCents)}</strong>{' '}
                        • Offen:{' '}
                        <strong
                          className={
                            sf.remainingCents === 0 ? 'text-emerald-400' : 'text-sky-300'
                          }
                        >
                          {formatCentsToEuro(sf.remainingCents)}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSinkingFundDeposit(sf.item.id, {
                            paidByACents: isPaidA ? 0 : sf.shareACents,
                          })
                        }
                        title={`Partner A Anteil (${formatCentsToEuro(sf.shareACents)}) umschalten`}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                          isPaidA
                            ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                            : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        A {isPaidA ? '✓' : formatCentsToEuro(sf.shareACents, false)}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSinkingFundDeposit(sf.item.id, {
                            paidByBCents: isPaidB ? 0 : sf.shareBCents,
                          })
                        }
                        title={`Partner B Anteil (${formatCentsToEuro(sf.shareBCents)}) umschalten`}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                          isPaidB
                            ? 'border-sky-500/50 bg-sky-500/20 text-sky-300'
                            : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        B {isPaidB ? '✓' : formatCentsToEuro(sf.shareBCents, false)}
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedSfId(isExpanded ? null : sf.item.id)}
                        title="Teilbeträge bearbeiten"
                        className="rounded-lg border border-slate-800 bg-slate-900 p-1 text-slate-400 hover:text-slate-200"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Mini-Balken pro Posten */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
                    <div
                      className={`h-full transition-all duration-300 ${
                        sf.remainingCents === 0 ? 'bg-emerald-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${sf.progressPercent}%` }}
                    />
                  </div>

                  {/* Teilbetrags-Eingabe (CentInput) bei Bedarf */}
                  {isExpanded && (
                    <div className="grid grid-cols-2 gap-2.5 pt-1.5 border-t border-slate-800/80">
                      <CentInput
                        id={`sf-deposit-a-${sf.item.id}`}
                        label={`Eingezahlt Partner A (Soll: ${formatCentsToEuro(sf.shareACents)})`}
                        cents={sf.paidByACents}
                        onCommitCents={(paidByACents) =>
                          onUpdateSinkingFundDeposit(sf.item.id, { paidByACents })
                        }
                      />
                      <CentInput
                        id={`sf-deposit-b-${sf.item.id}`}
                        label={`Eingezahlt Partner B (Soll: ${formatCentsToEuro(sf.shareBCents)})`}
                        cents={sf.paidByBCents}
                        onCommitCents={(paidByBCents) =>
                          onUpdateSinkingFundDeposit(sf.item.id, { paidByBCents })
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 4. Kleinanzeigen- & Barkauf-Verrechnung + Pay-in-30 Fälligkeiten */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Kleinanzeigen- & Barkauf-Verrechnung */}
        <section
          aria-label="Kleinanzeigen und Barkauf-Verrechnung"
          className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Kleinanzeigen- & Barkauf-Saldo
                </h2>
              </div>
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-mono text-slate-400 border border-slate-800">
                {cashClearing.openTransactions.length} offen
              </span>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3.5">
              <span className="block text-[11px] text-slate-400">Netto-Ausgleichssaldo (50:50)</span>
              <div
                className={`mt-1 text-lg font-extrabold font-mono tabular-nums ${
                  cashClearing.netBalanceACents > 0
                    ? 'text-emerald-400'
                    : cashClearing.netBalanceACents < 0
                      ? 'text-amber-300'
                      : 'text-slate-300'
                }`}
              >
                {cashClearing.statusLabel}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
                <div>Ausgelegt A: {formatCentsToEuro(cashClearing.paidByACents)}</div>
                <div>Ausgelegt B: {formatCentsToEuro(cashClearing.paidByBCents)}</div>
              </div>
            </div>

            {cashClearing.openTransactions.length > 0 && (
              <ul className="mt-2.5 space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {cashClearing.openTransactions.map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between rounded-xl bg-slate-900/70 px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate text-slate-300">
                      {tx.note || 'Barkauf 50:50'} (
                      {tx.paymentMethod === 'CASH_B' ? 'Bar B' : 'Bar A'})
                    </span>
                    <span className="font-mono font-semibold text-slate-200 shrink-0 ml-2">
                      {formatCentsToEuro(tx.cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            id="btn-settle-cash-clearing"
            type="button"
            disabled={cashClearing.openTransactions.length === 0}
            onClick={onSettleCashClearing}
            className="mt-4 w-full rounded-2xl border border-emerald-500/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 disabled:pointer-events-none transition"
          >
            Offene Posten ausgleichen (1-Klick)
          </button>
        </section>

        {/* Pay-in-30 Fälligkeiten (Privat A 100%) mit getrenntem Bezahlt & Löschen */}
        <section
          aria-label="Pay-in-30 Fälligkeiten"
          className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-bold text-slate-100">Pay-in-30 (Privat A)</h2>
              </div>
              <button
                id="btn-toggle-add-payin30"
                type="button"
                onClick={() => {
                  setNewPay30DueDate(
                    selectedYearMonth === getCurrentYearMonth()
                      ? getLocalTodayISO()
                      : `${selectedYearMonth}-15`
                  );
                  setShowAddPayIn30((prev) => !prev);
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-sky-500/50"
              >
                <Plus className="h-3.5 w-3.5" /> Neu
              </button>
            </div>

            {showAddPayIn30 && (
              <form
                onSubmit={handleCreatePayIn30}
                className="mt-3 space-y-2.5 rounded-2xl border border-slate-700 bg-slate-900/90 p-3"
              >
                <input
                  type="text"
                  value={newPay30Name}
                  onChange={(e) => setNewPay30Name(e.target.value)}
                  placeholder="Bezeichnung (z. B. Klarna, PayPal 30)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                />
                <div className="grid grid-cols-2 gap-2">
                  <CentInput
                    id="input-new-payin30-cents"
                    label="Betrag"
                    cents={newPay30Cents}
                    onCommitCents={setNewPay30Cents}
                  />
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="input-new-payin30-date"
                      className="text-xs font-medium text-slate-300"
                    >
                      Fällig am
                    </label>
                    <input
                      id="input-new-payin30-date"
                      type="date"
                      value={newPay30DueDate}
                      onChange={(e) => setNewPay30DueDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-slate-100"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-sky-500 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400"
                >
                  Pay-in-30 speichern
                </button>
              </form>
            )}

            <div className="mt-3 space-y-2">
              {payIn30.length === 0 ? (
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 p-4 text-center text-xs text-slate-400">
                  Keine Pay-in-30 Verbindlichkeiten in {formatYearMonthLabel(selectedYearMonth)}.
                </div>
              ) : (
                payIn30.map((item) => {
                  const badgeClass = item.isPaidInSelectedMonth
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : item.ampelStatus === 'RED'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                      : item.ampelStatus === 'YELLOW'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';

                  const statusText = item.isPaidInSelectedMonth
                    ? 'Bezahlt'
                    : item.isOverdueFromPrevMonth
                      ? 'Überfällig (Vormonat)'
                      : item.daysUntilDue < 0
                        ? `${Math.abs(item.daysUntilDue)} T. überfällig`
                        : item.daysUntilDue === 0
                          ? 'Heute fällig!'
                          : `in ${item.daysUntilDue} Tagen`;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 rounded-2xl border p-3 ${
                        item.isPaidInSelectedMonth
                          ? 'border-emerald-500/30 bg-emerald-950/15'
                          : 'border-slate-800/90 bg-slate-950/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`truncate text-xs font-bold ${
                              item.isPaidInSelectedMonth
                                ? 'text-slate-300 line-through decoration-emerald-500/60'
                                : 'text-slate-100'
                            }`}
                          >
                            {item.name}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}
                          >
                            {statusText}
                          </span>
                        </div>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          Fällig: {formatISODateGerman(item.dueDate)}
                          {item.isPaidInSelectedMonth && ' • Im Monat blockiert'}
                          {item.isOverdueFromPrevMonth && ' • Nicht doppelt gezählt'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-sm font-bold text-slate-100 mr-1">
                          {formatCentsToEuro(item.cents)}
                        </span>
                        {item.isPaidInSelectedMonth ? (
                          <button
                            id={`btn-unmark-payin30-${item.id}`}
                            type="button"
                            onClick={() => onUnmarkPayIn30Paid(item.id)}
                            title="Bezahlt-Status rückgängig machen"
                            className="rounded-lg p-1.5 text-emerald-400 hover:bg-amber-500/20 hover:text-amber-300"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            id={`btn-pay-payin30-${item.id}`}
                            type="button"
                            onClick={() => onMarkPayIn30Paid(item.id)}
                            title="Als bezahlt bestätigen (bleibt in diesem Monat blockiert)"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          id={`btn-delete-payin30-${item.id}`}
                          type="button"
                          onClick={() => onDeletePayIn30Item(item.id)}
                          title="Vollständig löschen (Fehleintrag)"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Summe Pay-in-30 (in PrivatePflichtA):</span>
            <span className="font-mono font-bold text-slate-200">
              {formatCentsToEuro(obligations.payIn30DueCents)}
            </span>
          </div>
        </section>
      </div>

      {/* 5. Partner-Sharing (1-Klick WhatsApp-Report) */}
      <section
        aria-label="WhatsApp Partner-Report"
        className="rounded-3xl border border-slate-800 bg-[#101726] p-5 shadow-lg"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-100">
                Partner-Sharing (1-Klick WhatsApp-Report)
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Monatsstatus ({formatYearMonthLabel(selectedYearMonth)}) inkl. Restbudgets & offenem
              Tagesgeld-Anteil B.
            </p>
          </div>
          <button
            id="btn-copy-whatsapp-report"
            type="button"
            onClick={onCopyWhatsAppReport}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-md shadow-emerald-500/15 hover:bg-emerald-400 active:scale-[0.99] transition"
          >
            <ClipboardCheck className="h-4 w-4" />
            WhatsApp-Status kopieren
          </button>
        </div>

        <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-800/90 bg-slate-950/80 p-3.5 font-mono text-xs leading-relaxed text-slate-200">
          {whatsAppReportText}
        </pre>
      </section>
    </div>
  );
};
