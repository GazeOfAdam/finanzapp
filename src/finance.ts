import {
  AppStateV3,
  BudgetCategory,
  getCurrentYearMonth,
  getLastDayOfYearMonthISO,
  getLocalTodayISO,
  getSinkingFundMonthlyCents,
  getTransactionDateISO,
  getTransactionYearMonth,
  getYearMonthFromTimestampUTC,
  isValidYearMonth,
  LoanMonthStatus,
  PayIn30Item,
  shiftYearMonth,
  SinkingFundDepositRecord,
  SinkingFundItem,
  SPECIAL_TASCHENGELD_BUDGET_ID,
  SystemInvariantCheckResult,
  Transaction,
} from './model';

export type TrafficLightStatus = 'RED' | 'YELLOW' | 'GREEN';

export interface ObligationBreakdown {
  warmmieteCents: number;
  wohngeldCents: number;
  operatingCostsCents: number;
  stufe1NettoWohnenCents: number;

  sumAlltagsbudgetsCents: number;
  kindergeldCents: number;
  totalBudgetOverrunCents: number;
  stufe2NettoAlltagCents: number;

  sinkingFundsMonthlyCents: number;
  ingRolloverCreditCents: number;
  stufe3GemeinsameRuecklagenCents: number;

  customSharedObligationsCents: number;
  sumSharedObligationsCents: number;
  stufe4GemeinschaftsanteilACents: number;
  sinkingFundsShareACents: number;

  activePrivateLoanRatesCents: number;
  pausedLoansCount: number;
  pausedLoansMonthlyReliefCents: number;
  totalLoanRemainingDebtCents: number;
  privateAbosCents: number;
  customPrivateObligationsACents: number;
  payIn30DueCents: number;
  stufe5PrivatePflichtACents: number;

  gesamtPflichtlastACents: number;
}

export interface LiquidityProjection {
  gesamtPflichtlastACents: number;
  carryoverFromPrevMonthCents: number;
  carryoverToTagesgeldCents: number;
  carryoverToTaschengeldCents: number;
  effectivePflichtlastACents: number;
  gehaltCents: number;
  unusedSalaryCents: number;
  pflichtLueckeVorEinzahlungCents: number;
  erfasstesTrinkgeldCents: number;
  bargeldReserviertBankCents: number;
  eingezahltesBargeldCents: number;
  pflichtLueckeNachEinzahlungCents: number;
  ungedecktesPflichtSollCents: number;
  reinePrivatausgabenACents: number;
  sharedTaschengeldGesamtCents: number;
  sharedTaschengeldAnteilACents: number;
  privatausgabenGesamtACents: number;
  freiesTaschengeldVorAusgabenCents: number;
  freiesTaschengeldCents: number;
  ampelStatus: TrafficLightStatus;
  invariants: SystemInvariantCheckResult;
}

export interface BudgetProjection extends BudgetCategory {
  baseMonthlyLimitCents: number;
  adjustmentCents: number;
  spentCents: number;
  remainingCents: number;
  surplusCents: number;
  overrunCents: number;
  utilizationPercent: number;
  weeklyTargetCents: number;
  weeklySpentCents: number;
  weeklyRemainingCents: number;
}

export interface SinkingFundItemProjection {
  item: SinkingFundItem;
  monthlyCents: number;
  shareACents: number;
  shareBCents: number;
  paidByACents: number;
  paidByBCents: number;
  paidTotalCents: number;
  remainingCents: number;
  progressPercent: number;
}

export interface TagesgeldProjection {
  items: SinkingFundItemProjection[];
  rawSinkingFundsTotalCents: number;
  ingRolloverCreditCents: number;
  monthlyTargetTotalCents: number;
  partnerATargetCents: number;
  partnerBTargetCents: number;
  paidByATotalCents: number;
  paidByBTotalCents: number;
  paidTotalCents: number;
  remainingTotalCents: number;
  remainingPartnerACents: number;
  remainingPartnerBCents: number;
  carryoverToTagesgeldCents: number;
  progressPercent: number;
}

export interface CashClearingProjection {
  openTransactions: Extract<Transaction, { type: 'EXPENSE_SHARED' }>[];
  paidByACents: number;
  paidByBCents: number;
  claimAFromBCents: number;
  claimBFromACents: number;
  netBalanceACents: number; // > 0: B schuldet A | < 0: A schuldet B | 0: ausgeglichen
  statusLabel: string;
}

export interface PayIn30Projection extends PayIn30Item {
  daysUntilDue: number;
  ampelStatus: TrafficLightStatus;
  isPaidInSelectedMonth: boolean;
  isOverdueFromPrevMonth: boolean;
  isCountedInSelectedMonth: boolean;
}

export interface FullDashboardProjection {
  selectedYearMonth: string;
  obligations: ObligationBreakdown;
  liquidity: LiquidityProjection;
  budgets: BudgetProjection[];
  totalBudgetSurplusCents: number;
  totalBudgetOverrunCents: number;
  tagesgeld: TagesgeldProjection;
  cashClearing: CashClearingProjection;
  payIn30: PayIn30Projection[];
  totalSharedExpensesCents: number;
  partnerBShareOfExpensesCents: number;
  monthTransactions: Transaction[];
}

/**
 * Konvertiert einen Benutzereingabe-String (mit Komma- oder Punkt-Toleranz)
 * rein ganzzahlig ohne Gleitkomma-Rundungsfehler in Cent.
 * Gibt `null` zurück, wenn die Eingabe leer oder ungültig ist.
 */
export function parseEuroInputToCents(rawInput: string): number | null {
  if (typeof rawInput !== 'string') {
    return null;
  }

  // Entferne Währungssymbole und Leerzeichen
  const cleaned = rawInput.replace(/[€\s\u00A0]/g, '').trim();
  if (cleaned.length === 0) {
    return null;
  }

  const isNegative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/^[+-]/, '');
  if (unsigned.length === 0) {
    return null;
  }

  let normalized = unsigned;
  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Beide Trennzeichen vorhanden: das weiter rechts stehende ist das Dezimaltrennzeichen
    if (lastComma > lastDot) {
      normalized = unsigned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = unsigned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Nur Komma vorhanden -> Dezimaltrennzeichen
    const parts = unsigned.split(',');
    if (parts.length > 2) {
      return null;
    }
    normalized = `${parts[0]}.${parts[1] ?? ''}`;
  } else if (lastDot !== -1) {
    const parts = unsigned.split('.');
    if (parts.length > 2) {
      // Mehrere Punkte wie "1.200.000" -> Tausendertrennzeichen
      normalized = unsigned.replace(/\./g, '');
    }
  }

  if (!/^\d*(\.\d*)?$/.test(normalized) || normalized === '.') {
    return null;
  }

  const [wholePartRaw, fracPartRaw = ''] = normalized.split('.');
  const wholeEuros = wholePartRaw.length > 0 ? parseInt(wholePartRaw, 10) : 0;
  if (!Number.isSafeInteger(wholeEuros)) {
    return null;
  }

  const paddedFrac = `${fracPartRaw}00`;
  const centDigits = parseInt(paddedFrac.slice(0, 2), 10);
  const thirdDigit = paddedFrac.length >= 3 ? parseInt(paddedFrac[2], 10) : 0;
  const roundedFracCents = thirdDigit >= 5 ? centDigits + 1 : centDigits;

  const totalCents = wholeEuros * 100 + roundedFracCents;
  return isNegative ? -totalCents : totalCents;
}

/**
 * Formatiert ganzzahlige Cent rein über Integer-Division in einen deutschen Euro-String (z. B. "1.234,56 €").
 */
export function formatCentsToEuro(cents: number, includeCurrency = true): string {
  const safeCents = Math.round(cents);
  const isNegative = safeCents < 0;
  const absCents = Math.abs(safeCents);

  const wholeEuros = Math.trunc(absCents / 100);
  const remainderCents = absCents % 100;

  const wholeFormatted = wholeEuros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centsFormatted = remainderCents.toString().padStart(2, '0');
  const sign = isNegative ? '-' : '';
  const suffix = includeCurrency ? ' €' : '';

  return `${sign}${wholeFormatted},${centsFormatted}${suffix}`;
}

/**
 * Formatiert Cent für ein entkoppeltes Eingabefeld (z. B. "470,00").
 */
export function formatCentsToInputString(cents: number): string {
  const safeCents = Math.round(cents);
  const isNegative = safeCents < 0;
  const absCents = Math.abs(safeCents);
  const wholeEuros = Math.trunc(absCents / 100);
  const remainderCents = absCents % 100;
  return `${isNegative ? '-' : ''}${wholeEuros},${remainderCents.toString().padStart(2, '0')}`;
}

/**
 * Deterministischer 50:50-Split auf Cent-Basis gemäß Systemvertrag: Math.round(cents * 0.5).
 */
export function split5050Cents(cents: number): number {
  const safeCents = Math.round(cents);
  return Math.round(safeCents * 0.5);
}

/**
 * Liefert den Status eines privaten Darlehens für einen bestimmten Monat YYYY-MM.
 */
export function getLoanMonthStatus(
  loan: Pick<AppStateV3['privateLoans'][number], 'monthlyRecords'>,
  yearMonth: string
): LoanMonthStatus {
  return loan.monthlyRecords[yearMonth]?.status ?? 'OPEN';
}

/**
 * Berechnet die entflechtete 5-Stufen-Pflichtlast für Partner A für einen bestimmten Monat.
 */
export function calculateObligationBreakdown(
  state: Pick<
    AppStateV3,
    | 'config'
    | 'budgets'
    | 'sinkingFundItems'
    | 'privateSubscriptionItems'
    | 'customObligations'
    | 'privateLoans'
    | 'payIn30Items'
    | 'monthlyData'
  >,
  options?: { yearMonth?: string; totalBudgetOverrunCents?: number }
): ObligationBreakdown {
  const yearMonth = options?.yearMonth && isValidYearMonth(options.yearMonth)
    ? options.yearMonth
    : undefined;
  const monthEntry = yearMonth ? state.monthlyData[yearMonth] : undefined;
  const budgetAdjustments = monthEntry?.budgetLimitAdjustmentsCents ?? {};

  const warmmieteCents = Math.max(0, Math.round(state.config.warmmieteCents));
  const wohngeldCents = Math.max(0, Math.round(state.config.wohngeldCents));
  const operatingCostsCents = Math.max(0, Math.round(state.config.operatingCostsCents));
  const kindergeldCents = Math.max(0, Math.round(state.config.kindergeldCents));
  const ingRolloverCreditCents = Math.max(0, Math.round(monthEntry?.ingRolloverCreditCents ?? 0));
  const totalBudgetOverrunCents = Math.max(0, Math.round(options?.totalBudgetOverrunCents ?? 0));

  // Stufe 1: NettoWohnen = MAX(0, Warmmiete - Wohngeld) + Nebenkosten + Sonstige Betriebsfixkosten
  const stufe1NettoWohnenCents = Math.max(0, warmmieteCents - wohngeldCents) + operatingCostsCents;

  // Stufe 2: NettoAlltag = MAX(0, Σ(Alltagsbudgets inkl. Monats-Anpassungen) - Kindergeld) + Budget-Überschreitungen
  const sumAlltagsbudgetsCents = state.budgets.reduce((sum, budget) => {
    const base = Math.max(0, Math.round(budget.monthlyLimitCents));
    const delta = Math.round(budgetAdjustments[budget.id] ?? 0);
    return sum + Math.max(0, base + delta);
  }, 0);
  const stufe2NettoAlltagCents =
    Math.max(0, sumAlltagsbudgetsCents - kindergeldCents) + totalBudgetOverrunCents;

  // Stufe 3: GemeinsameRuecklagen = Σ(SinkingFundItems Monatsrate) abzgl. evtl. Rollover-Gutschrift Modus A
  const sinkingFundsMonthlyCents = state.sinkingFundItems.reduce(
    (sum, item) => sum + getSinkingFundMonthlyCents(item),
    0
  );
  const stufe3GemeinsameRuecklagenCents = Math.max(
    0,
    sinkingFundsMonthlyCents - ingRolloverCreditCents
  );

  // Eigene Pflichtlast-Posten (SHARED_50_50 vs. PRIVATE_A)
  let customSharedObligationsCents = 0;
  let customPrivateObligationsACents = 0;
  for (const item of state.customObligations) {
    const monthly = Math.max(0, Math.round(item.monthlyCents));
    if (item.scope === 'SHARED_50_50') {
      customSharedObligationsCents += monthly;
    } else {
      customPrivateObligationsACents += monthly;
    }
  }

  // Stufe 4: GemeinschaftsanteilA = Math.round((NettoWohnen + NettoAlltag + GemeinsameRuecklagen + EigeneShared) * 0.5)
  const sumSharedObligationsCents =
    stufe1NettoWohnenCents +
    stufe2NettoAlltagCents +
    stufe3GemeinsameRuecklagenCents +
    customSharedObligationsCents;
  const stufe4GemeinschaftsanteilACents = split5050Cents(sumSharedObligationsCents);
  const sinkingFundsShareACents = Math.min(
    stufe4GemeinschaftsanteilACents,
    split5050Cents(stufe3GemeinsameRuecklagenCents)
  );

  // Stufe 5: PrivatePflichtA = Σ(Aktive/Bezahlte Darlehensraten) + Σ(PrivateAbos) + Σ(EigenePrivatA) + Σ(PayIn30)
  let activePrivateLoanRatesCents = 0;
  let pausedLoansCount = 0;
  let pausedLoansMonthlyReliefCents = 0;
  let totalLoanRemainingDebtCents = 0;

  for (const loan of state.privateLoans) {
    const rate = Math.max(0, Math.round(loan.monthlyRateCents));
    const remaining = Math.max(0, Math.round(loan.remainingCents));
    totalLoanRemainingDebtCents += remaining;

    const record = yearMonth ? loan.monthlyRecords[yearMonth] : undefined;
    const status: LoanMonthStatus = record?.status ?? 'OPEN';

    if (status === 'PAID') {
      // Bestätigte Rate bleibt im bezahlten Monat vollständig in der Pflichtlast berücksichtigt (auch wenn remaining === 0)
      const confirmedPaidCents = Math.max(0, Math.round(record?.paidCents ?? rate));
      activePrivateLoanRatesCents += confirmedPaidCents;
    } else if (status === 'PAUSED') {
      pausedLoansCount += 1;
      pausedLoansMonthlyReliefCents += remaining > 0 ? Math.min(rate, remaining) : rate;
    } else if (remaining > 0) {
      activePrivateLoanRatesCents += Math.min(rate, remaining);
    }
  }

  const privateAbosCents = state.privateSubscriptionItems.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.monthlyCents)),
    0
  );

  const relevantPayIn30 = yearMonth
    ? state.payIn30Items.filter((item) => {
        if (item.paidYearMonth) {
          return item.paidYearMonth === yearMonth;
        }
        return item.dueDate.slice(0, 7) === yearMonth;
      })
    : state.payIn30Items.filter((item) => !item.paidYearMonth);

  const payIn30DueCents = relevantPayIn30.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.cents)),
    0
  );

  const stufe5PrivatePflichtACents =
    activePrivateLoanRatesCents +
    privateAbosCents +
    customPrivateObligationsACents +
    payIn30DueCents;

  const gesamtPflichtlastACents = stufe4GemeinschaftsanteilACents + stufe5PrivatePflichtACents;

  return {
    warmmieteCents,
    wohngeldCents,
    operatingCostsCents,
    stufe1NettoWohnenCents,
    sumAlltagsbudgetsCents,
    kindergeldCents,
    totalBudgetOverrunCents,
    stufe2NettoAlltagCents,
    sinkingFundsMonthlyCents,
    ingRolloverCreditCents,
    stufe3GemeinsameRuecklagenCents,
    customSharedObligationsCents,
    sumSharedObligationsCents,
    stufe4GemeinschaftsanteilACents,
    sinkingFundsShareACents,
    activePrivateLoanRatesCents,
    pausedLoansCount,
    pausedLoansMonthlyReliefCents,
    totalLoanRemainingDebtCents,
    privateAbosCents,
    customPrivateObligationsACents,
    payIn30DueCents,
    stufe5PrivatePflichtACents,
    gesamtPflichtlastACents,
  };
}

/**
 * Berechnet den Liquiditäts-Waterfall für einen Monat inkl. ungenutztem Gehalt,
 * Vormonats-Carryover (Tagesgeld -> Taschengeld), Taschengeld (50:50) und Liquiditäts-Erhaltungs-Invariante.
 */
export function projectLiquidityAndWaterfall(
  gesamtPflichtlastACents: number,
  transactions: Transaction[],
  options?: {
    carryoverFromPrevMonthCents?: number;
    sinkingFundsShareACents?: number;
  }
): LiquidityProjection {
  const safePflichtlastA = Math.max(0, Math.round(gesamtPflichtlastACents));
  const carryoverFromPrevMonthCents = Math.max(
    0,
    Math.round(options?.carryoverFromPrevMonthCents ?? 0)
  );
  const sinkingFundsShareACents = Math.min(
    safePflichtlastA,
    Math.max(0, Math.round(options?.sinkingFundsShareACents ?? 0))
  );

  // Vormonats-Überschuss: erst Partner A's Tagesgeld-Anteil, Rest als Start-Taschengeld
  const carryoverToTagesgeldCents = Math.min(carryoverFromPrevMonthCents, sinkingFundsShareACents);
  const carryoverToTaschengeldCents = carryoverFromPrevMonthCents - carryoverToTagesgeldCents;
  const effectivePflichtlastACents = Math.max(0, safePflichtlastA - carryoverToTagesgeldCents);

  let gehaltCents = 0;
  let erfasstesTrinkgeldCents = 0;
  let reinePrivatausgabenACents = 0;
  let sharedTaschengeldGesamtCents = 0;
  let sharedTaschengeldAnteilACents = 0;

  // Chronologische Sortierung nach Timestamp (stabil bei gleichem Timestamp)
  const orderedTx = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

  // Laufende Zustandsmaschine für Bareinzahlungen
  let runningSalary = 0;
  let runningTips = 0;
  let requestedDepositsCents = 0;

  for (const tx of orderedTx) {
    const cents = Math.max(0, Math.round(tx.cents));
    switch (tx.type) {
      case 'INCOME_SALARY': {
        gehaltCents += cents;
        runningSalary += cents;
        break;
      }
      case 'INCOME_TIP': {
        erfasstesTrinkgeldCents += cents;
        runningTips += cents;
        break;
      }
      case 'DEPOSIT_CONFIRMED': {
        const currentGapBeforeDeposits = Math.max(0, effectivePflichtlastACents - runningSalary);
        const currentTipForPflicht = Math.min(runningTips, currentGapBeforeDeposits);
        const currentlyReservedCash = Math.max(0, currentTipForPflicht - requestedDepositsCents);
        const transferAmount =
          cents > 0 ? Math.min(currentlyReservedCash, cents) : currentlyReservedCash;
        requestedDepositsCents += transferAmount;
        break;
      }
      case 'EXPENSE_PRIVATE_A': {
        reinePrivatausgabenACents += cents;
        break;
      }
      case 'EXPENSE_SHARED': {
        if (tx.budgetId === SPECIAL_TASCHENGELD_BUDGET_ID) {
          sharedTaschengeldGesamtCents += cents;
          sharedTaschengeldAnteilACents += split5050Cents(cents);
        }
        break;
      }
    }
  }

  // 1. Gehalt deckt effektive Pflichtlast zuerst (ohne Bareinzahlung); ungenutztes Gehalt fließt ins Taschengeld
  const pflichtLueckeVorEinzahlungCents = Math.max(0, effectivePflichtlastACents - gehaltCents);
  const unusedSalaryCents = Math.max(0, gehaltCents - effectivePflichtlastACents);

  // 2. Schicht-Trinkgeld füllt nur die nach Gehalt verbleibende Pflichtlücke
  const totalTipForPflichtCents = Math.min(
    erfasstesTrinkgeldCents,
    pflichtLueckeVorEinzahlungCents
  );

  // 3. Bestätigte Einzahlungen transferieren BargeldReserviertBank aufs Bankkonto
  const eingezahltesBargeldCents = Math.min(totalTipForPflichtCents, requestedDepositsCents);
  const bargeldReserviertBankCents = totalTipForPflichtCents - eingezahltesBargeldCents;
  const pflichtLueckeNachEinzahlungCents =
    pflichtLueckeVorEinzahlungCents - eingezahltesBargeldCents;

  // Ungedecktes Pflicht-Soll (weder über Carryover, Gehalt, eingezahltes noch reserviertes Bargeld gedeckt)
  const ungedecktesPflichtSollCents = Math.max(
    0,
    pflichtLueckeNachEinzahlungCents - bargeldReserviertBankCents
  );

  // 4. Freies Taschengeld: Carryover-Rest + ungenutztes Gehalt + überschüssiges Trinkgeld - Privatausgaben - 50% Taschengeld-Ausgaben
  const privatausgabenGesamtACents = reinePrivatausgabenACents + sharedTaschengeldAnteilACents;
  const freiesTaschengeldVorAusgabenCents =
    carryoverToTaschengeldCents +
    Math.max(0, gehaltCents + erfasstesTrinkgeldCents - effectivePflichtlastACents);
  const freiesTaschengeldCents = freiesTaschengeldVorAusgabenCents - privatausgabenGesamtACents;

  // Ampel-Logik für GesamtPflichtlastA
  let ampelStatus: TrafficLightStatus = 'RED';
  if (pflichtLueckeNachEinzahlungCents === 0) {
    ampelStatus = 'GREEN';
  } else if (ungedecktesPflichtSollCents === 0 && bargeldReserviertBankCents > 0) {
    ampelStatus = 'YELLOW';
  } else {
    ampelStatus = 'RED';
  }

  const invariants = verifySystemInvariants({
    carryoverInCents: carryoverFromPrevMonthCents,
    carryoverToTagesgeldCents,
    carryoverToTaschengeldCents,
    gesamtPflichtlastACents: safePflichtlastA,
    ungedecktesPflichtSollCents,
    gehaltCents,
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    eingezahltesBargeldCents,
    freiesTaschengeldCents,
    reinePrivatausgabenACents,
    sharedTaschengeldAnteilACents,
  });

  return {
    gesamtPflichtlastACents: safePflichtlastA,
    carryoverFromPrevMonthCents,
    carryoverToTagesgeldCents,
    carryoverToTaschengeldCents,
    effectivePflichtlastACents,
    gehaltCents,
    unusedSalaryCents,
    pflichtLueckeVorEinzahlungCents,
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    eingezahltesBargeldCents,
    pflichtLueckeNachEinzahlungCents,
    ungedecktesPflichtSollCents,
    reinePrivatausgabenACents,
    sharedTaschengeldGesamtCents,
    sharedTaschengeldAnteilACents,
    privatausgabenGesamtACents,
    freiesTaschengeldVorAusgabenCents,
    freiesTaschengeldCents,
    ampelStatus,
    invariants,
  };
}

/**
 * Prüft die Liquiditäts-Erhaltungsgleichung, Nicht-Negativität und ganzzahlige Cent-Integrität.
 */
export function verifySystemInvariants(params: {
  carryoverInCents: number;
  carryoverToTagesgeldCents: number;
  carryoverToTaschengeldCents: number;
  gesamtPflichtlastACents: number;
  ungedecktesPflichtSollCents: number;
  gehaltCents: number;
  erfasstesTrinkgeldCents: number;
  bargeldReserviertBankCents: number;
  eingezahltesBargeldCents: number;
  freiesTaschengeldCents: number;
  reinePrivatausgabenACents: number;
  sharedTaschengeldAnteilACents: number;
}): SystemInvariantCheckResult {
  const {
    carryoverInCents,
    carryoverToTagesgeldCents,
    carryoverToTaschengeldCents,
    gesamtPflichtlastACents,
    ungedecktesPflichtSollCents,
    gehaltCents,
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    eingezahltesBargeldCents,
    freiesTaschengeldCents,
    reinePrivatausgabenACents,
    sharedTaschengeldAnteilACents,
  } = params;

  const allIntegersValid = [
    carryoverInCents,
    carryoverToTagesgeldCents,
    carryoverToTaschengeldCents,
    gesamtPflichtlastACents,
    ungedecktesPflichtSollCents,
    gehaltCents,
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    eingezahltesBargeldCents,
    freiesTaschengeldCents,
    reinePrivatausgabenACents,
    sharedTaschengeldAnteilACents,
  ].every((val) => Number.isSafeInteger(val));

  const totalInflowCents = carryoverInCents + gehaltCents + erfasstesTrinkgeldCents;
  const coveredPflichtlastACents = gesamtPflichtlastACents - ungedecktesPflichtSollCents;
  const totalOutflowAndBalanceCents =
    coveredPflichtlastACents +
    freiesTaschengeldCents +
    reinePrivatausgabenACents +
    sharedTaschengeldAnteilACents;

  const liquidityConservation = totalInflowCents === totalOutflowAndBalanceCents;
  const nonNegativityValid =
    bargeldReserviertBankCents >= 0 &&
    eingezahltesBargeldCents >= 0 &&
    ungedecktesPflichtSollCents >= 0 &&
    carryoverInCents >= 0 &&
    carryoverToTagesgeldCents >= 0 &&
    carryoverToTaschengeldCents >= 0;

  return {
    valid: allIntegersValid && liquidityConservation && nonNegativityValid,
    liquidityConservation,
    nonNegativityValid,
    allIntegersValid,
    details: {
      carryoverInCents,
      gehaltCents,
      erfasstesTrinkgeldCents,
      totalInflowCents,
      coveredPflichtlastACents,
      freiesTaschengeldCents,
      reinePrivatausgabenACents,
      sharedTaschengeldAnteilACents,
      totalOutflowAndBalanceCents,
    },
  };
}

/**
 * Berechnet den Beginn der aktuellen Kalenderwoche (Montag 00:00:00) relativ zu `referenceTimestamp`.
 */
export function getStartOfISOWeekTimestamp(referenceTimestamp: number = Date.now()): number {
  const date = new Date(referenceTimestamp);
  const day = date.getDay(); // 0 = Sonntag, 1 = Montag, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + diffToMonday,
    0,
    0,
    0,
    0
  );
  return monday.getTime();
}

function getISOWeekBoundsFromDateISO(isoDate: string): { weekStartISO: string; weekEndISO: string } {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const baseUTC = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr)));
  const day = baseUTC.getUTCDay(); // 0 = Sonntag, 1 = Montag, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mondayUTC = new Date(baseUTC.getTime() + diffToMonday * 86_400_000);
  const sundayUTC = new Date(mondayUTC.getTime() + 6 * 86_400_000);
  return {
    weekStartISO: mondayUTC.toISOString().slice(0, 10),
    weekEndISO: sundayUTC.toISOString().slice(0, 10),
  };
}

/**
 * Projiziert alle Alltagsbudgets für den gewählten Monat inkl. Überschreitung (overrunCents) und Wochen-Pacer.
 */
export function projectBudgets(
  budgets: BudgetCategory[],
  transactions: Transaction[],
  options?: {
    yearMonth?: string;
    referenceTimestamp?: number;
    budgetLimitAdjustmentsCents?: Record<string, number>;
  }
): BudgetProjection[] {
  const refDate = new Date(options?.referenceTimestamp ?? Date.now());
  const refISO = getLocalTodayISO(refDate);
  const yearMonth = options?.yearMonth && isValidYearMonth(options.yearMonth)
    ? options.yearMonth
    : undefined;
  const adjustments = options?.budgetLimitAdjustmentsCents ?? {};

  // Bestimme Referenzdatum innerhalb des gewählten Monats für den KW-Pacer
  let pacerRefISO = refISO;
  if (yearMonth && refISO.slice(0, 7) !== yearMonth) {
    pacerRefISO =
      yearMonth < refISO.slice(0, 7)
        ? getLastDayOfYearMonthISO(yearMonth)
        : `${yearMonth}-01`;
  }
  const { weekStartISO, weekEndISO } = getISOWeekBoundsFromDateISO(pacerRefISO);

  const relevantTx = yearMonth
    ? transactions.filter((tx) => getTransactionYearMonth(tx) === yearMonth)
    : transactions;

  return budgets.map((budget) => {
    const baseMonthlyLimitCents = Math.max(0, Math.round(budget.monthlyLimitCents));
    const adjustmentCents = Math.round(adjustments[budget.id] ?? 0);
    const monthlyLimitCents = Math.max(0, baseMonthlyLimitCents + adjustmentCents);

    let spentCents = 0;
    let weeklySpentCents = 0;

    for (const tx of relevantTx) {
      if (tx.type === 'EXPENSE_SHARED' && tx.budgetId === budget.id) {
        const cents = Math.max(0, Math.round(tx.cents));
        spentCents += cents;
        const txDateISO = getTransactionDateISO(tx);
        if (txDateISO >= weekStartISO && txDateISO <= weekEndISO) {
          weeklySpentCents += cents;
        }
      }
    }

    const remainingCents = monthlyLimitCents - spentCents;
    const surplusCents = Math.max(0, remainingCents);
    const overrunCents = Math.max(0, spentCents - monthlyLimitCents);
    const utilizationPercent =
      monthlyLimitCents > 0
        ? Math.min(100, Math.round((spentCents * 100) / monthlyLimitCents))
        : spentCents > 0
          ? 100
          : 0;

    // Wochen-Pacer: 1/4 des Monatsbudgets als Wochen-Soll
    const weeklyTargetCents = Math.round(monthlyLimitCents / 4);
    const weeklyRemainingCents = weeklyTargetCents - weeklySpentCents;

    return {
      ...budget,
      baseMonthlyLimitCents,
      adjustmentCents,
      monthlyLimitCents,
      spentCents,
      remainingCents,
      surplusCents,
      overrunCents,
      utilizationPercent,
      weeklyTargetCents,
      weeklySpentCents,
      weeklyRemainingCents,
    };
  });
}

/**
 * Projiziert den monatlichen Fortschritt der Tagesgeld-Pflichtlasten (Sinking Funds) inkl. Einzahlungen A & B.
 */
export function projectTagesgeldStatus(
  state: Pick<AppStateV3, 'sinkingFundItems' | 'monthlyData'>,
  yearMonth: string,
  obligations: Pick<
    ObligationBreakdown,
    'sinkingFundsMonthlyCents' | 'ingRolloverCreditCents' | 'stufe3GemeinsameRuecklagenCents'
  >,
  carryoverToTagesgeldCents: number
): TagesgeldProjection {
  const deposits = state.monthlyData[yearMonth]?.sinkingFundDeposits ?? {};

  let paidByATotalCents = 0;
  let paidByBTotalCents = 0;

  const items: SinkingFundItemProjection[] = state.sinkingFundItems.map((item) => {
    const monthlyCents = getSinkingFundMonthlyCents(item);
    const shareACents = split5050Cents(monthlyCents);
    const shareBCents = split5050Cents(monthlyCents);
    const dep = deposits[item.id];
    const paidByACents = Math.max(0, Math.round(dep?.paidByACents ?? 0));
    const paidByBCents = Math.max(0, Math.round(dep?.paidByBCents ?? 0));
    const paidTotalCents = paidByACents + paidByBCents;
    const remainingCents = Math.max(0, monthlyCents - paidTotalCents);
    const progressPercent =
      monthlyCents > 0 ? Math.min(100, Math.round((paidTotalCents * 100) / monthlyCents)) : 100;

    paidByATotalCents += paidByACents;
    paidByBTotalCents += paidByBCents;

    return {
      item,
      monthlyCents,
      shareACents,
      shareBCents,
      paidByACents,
      paidByBCents,
      paidTotalCents,
      remainingCents,
      progressPercent,
    };
  });

  const monthlyTargetTotalCents = obligations.stufe3GemeinsameRuecklagenCents;
  const partnerATargetCents = split5050Cents(monthlyTargetTotalCents);
  const partnerBTargetCents = split5050Cents(monthlyTargetTotalCents);
  const paidTotalCents = paidByATotalCents + paidByBTotalCents;
  const remainingTotalCents = Math.max(0, monthlyTargetTotalCents - paidTotalCents);
  const remainingPartnerACents = Math.max(0, partnerATargetCents - paidByATotalCents);
  const remainingPartnerBCents = Math.max(0, partnerBTargetCents - paidByBTotalCents);
  const progressPercent =
    monthlyTargetTotalCents > 0
      ? Math.min(100, Math.round((paidTotalCents * 100) / monthlyTargetTotalCents))
      : 100;

  return {
    items,
    rawSinkingFundsTotalCents: obligations.sinkingFundsMonthlyCents,
    ingRolloverCreditCents: obligations.ingRolloverCreditCents,
    monthlyTargetTotalCents,
    partnerATargetCents,
    partnerBTargetCents,
    paidByATotalCents,
    paidByBTotalCents,
    paidTotalCents,
    remainingTotalCents,
    remainingPartnerACents,
    remainingPartnerBCents,
    carryoverToTagesgeldCents: Math.max(0, Math.round(carryoverToTagesgeldCents)),
    progressPercent,
  };
}

/**
 * Projiziert die Kleinanzeigen- & Barkauf-Verrechnung (markedForCashClearing).
 */
export function projectCashClearing(transactions: Transaction[]): CashClearingProjection {
  const openTransactions = transactions.filter(
    (tx): tx is Extract<Transaction, { type: 'EXPENSE_SHARED' }> =>
      tx.type === 'EXPENSE_SHARED' && Boolean(tx.markedForCashClearing)
  );

  let paidByACents = 0;
  let paidByBCents = 0;

  for (const tx of openTransactions) {
    const cents = Math.max(0, Math.round(tx.cents));
    if (tx.paymentMethod === 'CASH_A' || tx.paymentMethod === 'GIRO_PRIVATE_A') {
      paidByACents += cents;
    } else if (tx.paymentMethod === 'CASH_B') {
      paidByBCents += cents;
    }
  }

  const claimAFromBCents = split5050Cents(paidByACents);
  const claimBFromACents = split5050Cents(paidByBCents);
  const netBalanceACents = claimAFromBCents - claimBFromACents;

  let statusLabel = 'Ausgeglichen';
  if (netBalanceACents > 0) {
    statusLabel = `Partner B an A (${formatCentsToEuro(netBalanceACents)})`;
  } else if (netBalanceACents < 0) {
    statusLabel = `Partner A an B (${formatCentsToEuro(Math.abs(netBalanceACents))})`;
  }

  return {
    openTransactions,
    paidByACents,
    paidByBCents,
    claimAFromBCents,
    claimBFromACents,
    netBalanceACents,
    statusLabel,
  };
}

/**
 * 1-Klick-Aktion: Gleicht alle offenen Barkauf-/Kleinanzeigen-Posten (optional beschränkt auf einen Monat) aus.
 */
export function settleOpenCashClearing(state: AppStateV3, yearMonth?: string): AppStateV3 {
  return {
    ...state,
    transactions: state.transactions.map((tx) => {
      if (tx.type !== 'EXPENSE_SHARED' || !tx.markedForCashClearing) {
        return tx;
      }
      if (yearMonth && getTransactionYearMonth(tx) !== yearMonth) {
        return tx;
      }
      return { ...tx, markedForCashClearing: false };
    }),
  };
}

/**
 * Berechnet die Fälligkeits-Ampel und Monats-Zuordnung für Pay-in-30 Verbindlichkeiten.
 * Unbezahlte Posten aus Vormonaten bleiben im aktuellen Monat als überfällig sichtbar, ohne doppelt gezählt zu werden.
 */
export function projectPayIn30Items(
  items: PayIn30Item[],
  yearMonth?: string,
  referenceTimestamp: number = Date.now()
): PayIn30Projection[] {
  const refDate = new Date(referenceTimestamp);
  const refMidnightUTC = Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate());
  const activeYm = yearMonth && isValidYearMonth(yearMonth) ? yearMonth : undefined;

  return [...items]
    .filter((item) => {
      if (!activeYm) {
        return true;
      }
      if (item.paidYearMonth) {
        return item.paidYearMonth === activeYm;
      }
      const dueYm = item.dueDate.slice(0, 7);
      // Im Fälligkeitsmonat ODER als überfälliger offener Posten aus einem Vormonat sichtbar
      return dueYm <= activeYm;
    })
    .map((item) => {
      const parsed = new Date(`${item.dueDate}T00:00:00Z`);
      const dueMidnightUTC = Number.isNaN(parsed.getTime())
        ? refMidnightUTC
        : Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());

      const daysUntilDue = Math.round((dueMidnightUTC - refMidnightUTC) / 86_400_000);
      const dueYm = item.dueDate.slice(0, 7);
      const isPaidInSelectedMonth = Boolean(activeYm && item.paidYearMonth === activeYm);
      const isOverdueFromPrevMonth = Boolean(activeYm && !item.paidYearMonth && dueYm < activeYm);
      const isCountedInSelectedMonth = activeYm
        ? isPaidInSelectedMonth || (!item.paidYearMonth && dueYm === activeYm)
        : !item.paidYearMonth;

      let ampelStatus: TrafficLightStatus = 'GREEN';
      if (isPaidInSelectedMonth) {
        ampelStatus = 'GREEN';
      } else if (isOverdueFromPrevMonth || daysUntilDue <= 0) {
        ampelStatus = 'RED';
      } else if (daysUntilDue <= 7) {
        ampelStatus = 'YELLOW';
      } else {
        ampelStatus = 'GREEN';
      }

      return {
        ...item,
        cents: Math.max(0, Math.round(item.cents)),
        daysUntilDue,
        ampelStatus,
        isPaidInSelectedMonth,
        isOverdueFromPrevMonth,
        isCountedInSelectedMonth,
      };
    })
    .sort((a, b) => {
      // Unbezahlte Posten zuerst, bezahlte unten
      if (a.isPaidInSelectedMonth !== b.isPaidInSelectedMonth) {
        return a.isPaidInSelectedMonth ? 1 : -1;
      }
      return a.daysUntilDue - b.daysUntilDue;
    });
}

/**
 * Markiert einen Pay-in-30-Eintrag für den angegebenen Monat als bezahlt (bleibt dort dauerhaft blockiert).
 */
export function markPayIn30Paid(
  state: AppStateV3,
  itemId: string,
  yearMonth: string
): AppStateV3 {
  return {
    ...state,
    payIn30Items: state.payIn30Items.map((item) =>
      item.id === itemId ? { ...item, paidYearMonth: yearMonth } : item
    ),
  };
}

/**
 * Macht die Bezahl-Bestätigung eines Pay-in-30-Eintrags rückgängig.
 */
export function unmarkPayIn30Paid(state: AppStateV3, itemId: string): AppStateV3 {
  return {
    ...state,
    payIn30Items: state.payIn30Items.map((item) => {
      if (item.id !== itemId) {
        return item;
      }
      const { paidYearMonth: _removed, ...rest } = item;
      return rest;
    }),
  };
}

/**
 * Bestätigt die Monatsrate eines privaten Darlehens für `yearMonth`:
 * - Markiert den Monat als PAID mit paidCents = Math.min(monthlyRateCents, remainingCents)
 * - Senkt remainingCents um paidCents
 * - Die Rate bleibt im bezahlten Monat in der Pflichtlast berücksichtigt!
 */
export function confirmPrivateLoanPayment(
  state: AppStateV3,
  loanId: string,
  yearMonth: string
): AppStateV3 {
  return {
    ...state,
    privateLoans: state.privateLoans.map((loan) => {
      if (loan.id !== loanId) {
        return loan;
      }
      const currentRecord = loan.monthlyRecords[yearMonth];
      if (currentRecord?.status === 'PAID') {
        return loan;
      }
      const remaining = Math.max(0, Math.round(loan.remainingCents));
      const rate = Math.max(0, Math.round(loan.monthlyRateCents));
      const paidCents = Math.min(rate, remaining);
      if (paidCents <= 0) {
        return loan;
      }
      return {
        ...loan,
        remainingCents: remaining - paidCents,
        monthlyRecords: {
          ...loan.monthlyRecords,
          [yearMonth]: { status: 'PAID', paidCents },
        },
      };
    }),
  };
}

/**
 * Storniert eine als bezahlt markierte Monatsrate für `yearMonth` und stellt `remainingCents` exakt wieder her.
 */
export function undoPrivateLoanPayment(
  state: AppStateV3,
  loanId: string,
  yearMonth: string
): AppStateV3 {
  return {
    ...state,
    privateLoans: state.privateLoans.map((loan) => {
      if (loan.id !== loanId) {
        return loan;
      }
      const currentRecord = loan.monthlyRecords[yearMonth];
      if (currentRecord?.status !== 'PAID') {
        return loan;
      }
      const paidCents = Math.max(0, Math.round(currentRecord.paidCents ?? loan.monthlyRateCents));
      const restoredRemaining = Math.max(0, Math.round(loan.remainingCents)) + paidCents;
      const { [yearMonth]: _removed, ...remainingRecords } = loan.monthlyRecords;
      return {
        ...loan,
        remainingCents: restoredRemaining,
        totalAmountCents: Math.max(loan.totalAmountCents, restoredRemaining),
        monthlyRecords: remainingRecords,
      };
    }),
  };
}

/**
 * Pausiert (stundet) oder reaktiviert ein privates Darlehen für `yearMonth`.
 * Senkt bei Pausierung sofort die monatliche Pflichtlast, lässt aber die Restschuld (remainingCents) exakt unverändert.
 */
export function togglePrivateLoanPause(
  state: AppStateV3,
  loanId: string,
  yearMonth: string
): AppStateV3 {
  return {
    ...state,
    privateLoans: state.privateLoans.map((loan) => {
      if (loan.id !== loanId) {
        return loan;
      }
      const currentRecord = loan.monthlyRecords[yearMonth];
      if (currentRecord?.status === 'PAID') {
        return loan;
      }
      if (currentRecord?.status === 'PAUSED') {
        const { [yearMonth]: _removed, ...rest } = loan.monthlyRecords;
        return {
          ...loan,
          monthlyRecords: rest,
        };
      }
      return {
        ...loan,
        monthlyRecords: {
          ...loan.monthlyRecords,
          [yearMonth]: { status: 'PAUSED' },
        },
      };
    }),
  };
}

/**
 * Aktualisiert die Tagesgeld-Einzahlungen (Partner A / Partner B) für einen Sinking-Fund-Posten im gewählten Monat.
 */
export function updateSinkingFundDeposit(
  state: AppStateV3,
  yearMonth: string,
  itemId: string,
  update: Partial<SinkingFundDepositRecord>
): AppStateV3 {
  const prevMonth = state.monthlyData[yearMonth] ?? {};
  const prevDeposits = prevMonth.sinkingFundDeposits ?? {};
  const prevRecord = prevDeposits[itemId] ?? { paidByACents: 0, paidByBCents: 0 };

  const nextRecord: SinkingFundDepositRecord = {
    paidByACents:
      update.paidByACents !== undefined
        ? Math.max(0, Math.round(update.paidByACents))
        : prevRecord.paidByACents,
    paidByBCents:
      update.paidByBCents !== undefined
        ? Math.max(0, Math.round(update.paidByBCents))
        : prevRecord.paidByBCents,
  };

  return {
    ...state,
    monthlyData: {
      ...state.monthlyData,
      [yearMonth]: {
        ...prevMonth,
        sinkingFundDeposits: {
          ...prevDeposits,
          [itemId]: nextRecord,
        },
      },
    },
  };
}

/**
 * Modus A (Budget-Rollover): Schreibt unverbrauchten Budget-Überschuss im Monat `yearMonth` dem ING Tagesgeld gut
 * (senkt GemeinsameRuecklagen in `yearMonth`) und reduziert entsprechend das Monatslimit des Quell-Budgets in `yearMonth`.
 */
export function rolloverBudgetToIngTagesgeld(
  state: AppStateV3,
  sourceBudgetId: string,
  amountCents: number,
  yearMonth: string = getCurrentYearMonth()
): AppStateV3 {
  const safeAmount = Math.max(0, Math.round(amountCents));
  if (safeAmount === 0) {
    return state;
  }

  const prevMonth = state.monthlyData[yearMonth] ?? {};
  const prevAdjustments = prevMonth.budgetLimitAdjustmentsCents ?? {};
  const budgets = projectBudgets(state.budgets, state.transactions, {
    yearMonth,
    budgetLimitAdjustmentsCents: prevAdjustments,
  });
  const source = budgets.find((b) => b.id === sourceBudgetId);
  if (!source) {
    return state;
  }

  const transferableCents = Math.min(safeAmount, source.surplusCents);
  if (transferableCents <= 0) {
    return state;
  }

  const nextSourceDelta = (prevAdjustments[sourceBudgetId] ?? 0) - transferableCents;

  return {
    ...state,
    monthlyData: {
      ...state.monthlyData,
      [yearMonth]: {
        ...prevMonth,
        ingRolloverCreditCents:
          Math.max(0, Math.round(prevMonth.ingRolloverCreditCents ?? 0)) + transferableCents,
        budgetLimitAdjustmentsCents: {
          ...prevAdjustments,
          [sourceBudgetId]: nextSourceDelta,
        },
      },
    },
  };
}

/**
 * Modus B (Budget-Rollover): Überträgt unverbrauchten Überschuss im Monat `yearMonth`
 * von einem Alltagsbudget in ein anderes Alltagsbudget (monatsspezifisch, Basis-Limits bleiben sauber).
 */
export function reallocateBudgetSurplus(
  state: AppStateV3,
  sourceBudgetId: string,
  targetBudgetId: string,
  amountCents: number,
  yearMonth: string = getCurrentYearMonth()
): AppStateV3 {
  if (sourceBudgetId === targetBudgetId) {
    return state;
  }
  const safeAmount = Math.max(0, Math.round(amountCents));
  if (safeAmount === 0) {
    return state;
  }

  const prevMonth = state.monthlyData[yearMonth] ?? {};
  const prevAdjustments = prevMonth.budgetLimitAdjustmentsCents ?? {};
  const budgets = projectBudgets(state.budgets, state.transactions, {
    yearMonth,
    budgetLimitAdjustmentsCents: prevAdjustments,
  });
  const source = budgets.find((b) => b.id === sourceBudgetId);
  const targetExists = state.budgets.some((b) => b.id === targetBudgetId);
  if (!source || !targetExists) {
    return state;
  }

  const transferableCents = Math.min(safeAmount, source.surplusCents);
  if (transferableCents <= 0) {
    return state;
  }

  return {
    ...state,
    monthlyData: {
      ...state.monthlyData,
      [yearMonth]: {
        ...prevMonth,
        budgetLimitAdjustmentsCents: {
          ...prevAdjustments,
          [sourceBudgetId]: (prevAdjustments[sourceBudgetId] ?? 0) - transferableCents,
          [targetBudgetId]: (prevAdjustments[targetBudgetId] ?? 0) + transferableCents,
        },
      },
    },
  };
}

function projectSingleMonthCore(
  state: AppStateV3,
  yearMonth: string,
  carryoverFromPrevMonthCents: number,
  referenceTimestamp: number
) {
  const monthTransactions = state.transactions.filter(
    (tx) => getTransactionYearMonth(tx) === yearMonth
  );
  const budgetLimitAdjustmentsCents = state.monthlyData[yearMonth]?.budgetLimitAdjustmentsCents;
  const budgets = projectBudgets(state.budgets, monthTransactions, {
    yearMonth,
    referenceTimestamp,
    budgetLimitAdjustmentsCents,
  });
  const totalBudgetOverrunCents = budgets.reduce((sum, b) => sum + b.overrunCents, 0);
  const obligations = calculateObligationBreakdown(state, {
    yearMonth,
    totalBudgetOverrunCents,
  });
  const liquidity = projectLiquidityAndWaterfall(
    obligations.gesamtPflichtlastACents,
    monthTransactions,
    {
      carryoverFromPrevMonthCents,
      sinkingFundsShareACents: obligations.sinkingFundsShareACents,
    }
  );
  return {
    monthTransactions,
    budgets,
    totalBudgetOverrunCents,
    obligations,
    liquidity,
  };
}

/**
 * Gesamte deterministische Projektion des AppStateV3 für einen gewählten Monat `selectedYearMonth`
 * inklusive chronologischer Vormonats-Carryover-Berechnung ab dem frühesten aktiven Monat.
 */
export function projectDashboard(
  state: AppStateV3,
  selectedYearMonth?: string,
  referenceTimestamp: number = Date.now()
): FullDashboardProjection {
  const targetYearMonth =
    selectedYearMonth && isValidYearMonth(selectedYearMonth)
      ? selectedYearMonth
      : getYearMonthFromTimestampUTC(referenceTimestamp);

  // Sammle alle Monate streng vor targetYearMonth mit Einkünften (Gehalt/Trinkgeld), sortiert chronologisch
  const incomeMonthsSet = new Set<string>();
  for (const tx of state.transactions) {
    if (tx.type === 'INCOME_SALARY' || tx.type === 'INCOME_TIP') {
      const ym = getTransactionYearMonth(tx);
      if (ym < targetYearMonth) {
        incomeMonthsSet.add(ym);
      }
    }
  }
  const incomeMonthsBeforeTarget = Array.from(incomeMonthsSet).sort();

  // Chronologische Carryover-Kette: leere Monate vor erstem Einkommensmonat erzeugen keinen Carryover;
  // sobald carryover > 0 ist, wird Monat für Monat weitergerechnet, bis targetYearMonth erreicht oder carryover === 0.
  let carryover = 0;
  if (incomeMonthsBeforeTarget.length > 0) {
    let cursorYm = incomeMonthsBeforeTarget[0];
    let nextIncomeIdx = 0;

    while (cursorYm < targetYearMonth) {
      if (carryover === 0) {
        while (
          nextIncomeIdx < incomeMonthsBeforeTarget.length &&
          incomeMonthsBeforeTarget[nextIncomeIdx] < cursorYm
        ) {
          nextIncomeIdx += 1;
        }
        if (nextIncomeIdx >= incomeMonthsBeforeTarget.length) {
          break;
        }
        cursorYm = incomeMonthsBeforeTarget[nextIncomeIdx];
      }

      const stepResult = projectSingleMonthCore(state, cursorYm, carryover, referenceTimestamp);
      carryover = Math.max(0, stepResult.liquidity.freiesTaschengeldCents);
      cursorYm = shiftYearMonth(cursorYm, 1);
    }
  }

  const targetCore = projectSingleMonthCore(state, targetYearMonth, carryover, referenceTimestamp);
  const { monthTransactions, budgets, totalBudgetOverrunCents, obligations, liquidity } = targetCore;

  const totalBudgetSurplusCents = budgets.reduce((sum, b) => sum + b.surplusCents, 0);
  const tagesgeld = projectTagesgeldStatus(
    state,
    targetYearMonth,
    obligations,
    liquidity.carryoverToTagesgeldCents
  );
  const cashClearing = projectCashClearing(monthTransactions);
  const payIn30 = projectPayIn30Items(state.payIn30Items, targetYearMonth, referenceTimestamp);

  const totalSharedBudgetSpentCents = budgets.reduce((sum, b) => sum + b.spentCents, 0);
  const totalSharedExpensesCents =
    totalSharedBudgetSpentCents + liquidity.sharedTaschengeldGesamtCents;
  const partnerBShareOfExpensesCents = split5050Cents(totalSharedExpensesCents);

  return {
    selectedYearMonth: targetYearMonth,
    obligations,
    liquidity,
    budgets,
    totalBudgetSurplusCents,
    totalBudgetOverrunCents,
    tagesgeld,
    cashClearing,
    payIn30,
    totalSharedExpensesCents,
    partnerBShareOfExpensesCents,
    monthTransactions,
  };
}

/**
 * Generiert den formatierten 1-Klick WhatsApp-Report für Partner B:
 * - Gemeinsame Ausgaben & 50%-Anteil
 * - Barausgleich
 * - Offener 50%-Tagesgeldanteil von Partner B (nur falls > 0!)
 * - Verfügbare Restmittel jedes einzelnen Alltagsbudgets
 */
export function generateWhatsAppReport(
  state: AppStateV3,
  selectedYearMonth?: string,
  referenceDate: Date = new Date()
): string {
  const activeYm =
    selectedYearMonth && isValidYearMonth(selectedYearMonth)
      ? selectedYearMonth
      : getCurrentYearMonth(referenceDate);
  const projection = projectDashboard(state, activeYm, referenceDate.getTime());
  const [yearStr, monthStr] = activeYm.split('-');

  const sharedExpensesFormatted = formatCentsToEuro(projection.totalSharedExpensesCents, false);
  const partnerShareFormatted = formatCentsToEuro(projection.partnerBShareOfExpensesCents, false);

  const netClearingAbsFormatted = formatCentsToEuro(
    Math.abs(projection.cashClearing.netBalanceACents),
    false
  );
  let clearingStatus = 'Ausgeglichen';
  if (projection.cashClearing.netBalanceACents > 0) {
    clearingStatus = 'Du an mich';
  } else if (projection.cashClearing.netBalanceACents < 0) {
    clearingStatus = 'Ich an dich';
  }

  const lines: string[] = [
    `📊 FlowPilot Status ${monthStr}/${yearStr}`,
    `• Gemeinsame Ausgaben: ${sharedExpensesFormatted} €`,
    `• Dein Anteil (50 %): ${partnerShareFormatted} €`,
    `• Barausgleich: ${netClearingAbsFormatted} € [${clearingStatus}]`,
  ];

  // Tagesgeld: NUR der noch offene 50-%-Anteil von Partner B, und NUR falls > 0!
  if (projection.tagesgeld.remainingPartnerBCents > 0) {
    const remainingBFormatted = formatCentsToEuro(
      projection.tagesgeld.remainingPartnerBCents,
      false
    );
    lines.push(`• Offener Tagesgeld-Anteil (50 %): ${remainingBFormatted} €`);
  }

  if (projection.budgets.length > 0) {
    lines.push('');
    lines.push('Restbudgets:');
    for (const budget of projection.budgets) {
      if (budget.overrunCents > 0) {
        lines.push(
          `• ${budget.name}: 0,00 € (überzogen um ${formatCentsToEuro(budget.overrunCents)})`
        );
      } else {
        lines.push(`• ${budget.name}: noch ${formatCentsToEuro(budget.surplusCents)}`);
      }
    }
  }

  return lines.join('\n');
}
