import {
  AppStateV2,
  BudgetCategory,
  PayIn30Item,
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
  stufe2NettoAlltagCents: number;

  sinkingFundsMonthlyCents: number;
  ingRolloverCreditCents: number;
  stufe3GemeinsameRuecklagenCents: number;

  sumSharedObligationsCents: number;
  stufe4GemeinschaftsanteilACents: number;

  activePrivateLoanRatesCents: number;
  pausedLoansCount: number;
  pausedLoansMonthlyReliefCents: number;
  totalLoanRemainingDebtCents: number;
  privateAbosCents: number;
  payIn30DueCents: number;
  stufe5PrivatePflichtACents: number;

  gesamtPflichtlastACents: number;
}

export interface LiquidityProjection {
  gesamtPflichtlastACents: number;
  gehaltCents: number;
  pflichtLueckeVorEinzahlungCents: number;
  erfasstesTrinkgeldCents: number;
  bargeldReserviertBankCents: number;
  eingezahltesBargeldCents: number;
  pflichtLueckeNachEinzahlungCents: number;
  ungedecktesPflichtSollCents: number;
  reinePrivatausgabenACents: number;
  bufferAusgabenGesamtCents: number;
  bufferAnteilACents: number;
  privatausgabenGesamtACents: number;
  freiesTaschengeldCents: number;
  verfuegbarerPufferCents: number;
  ampelStatus: TrafficLightStatus;
  invariants: SystemInvariantCheckResult;
}

export interface BudgetProjection extends BudgetCategory {
  spentCents: number;
  remainingCents: number;
  surplusCents: number;
  utilizationPercent: number;
  weeklyTargetCents: number;
  weeklySpentCents: number;
  weeklyRemainingCents: number;
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
}

export interface FullDashboardProjection {
  obligations: ObligationBreakdown;
  liquidity: LiquidityProjection;
  budgets: BudgetProjection[];
  totalBudgetSurplusCents: number;
  cashClearing: CashClearingProjection;
  payIn30: PayIn30Projection[];
  totalSharedExpensesCents: number;
  partnerBShareOfExpensesCents: number;
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
 * Berechnet die entflechtete 5-Stufen-Pflichtlast für Partner A (Formel-Vertrag 3.A).
 */
export function calculateObligationBreakdown(
  state: Pick<AppStateV2, 'config' | 'budgets' | 'privateLoans' | 'payIn30Items'>,
  options?: { yearMonth?: string }
): ObligationBreakdown {
  const warmmieteCents = Math.max(0, Math.round(state.config.warmmieteCents));
  const wohngeldCents = Math.max(0, Math.round(state.config.wohngeldCents));
  const operatingCostsCents = Math.max(0, Math.round(state.config.operatingCostsCents));
  const kindergeldCents = Math.max(0, Math.round(state.config.kindergeldCents));
  const sinkingFundsMonthlyCents = Math.max(0, Math.round(state.config.sinkingFundsMonthlyCents));
  const ingRolloverCreditCents = Math.max(0, Math.round(state.config.ingRolloverCreditCents ?? 0));
  const privateAbosCents = Math.max(0, Math.round(state.config.privateSubscriptionsCents ?? 0));

  // Stufe 1: NettoWohnen = MAX(0, Warmmiete - Wohngeld) + Nebenkosten + Sonstige Betriebsfixkosten
  const stufe1NettoWohnenCents = Math.max(0, warmmieteCents - wohngeldCents) + operatingCostsCents;

  // Stufe 2: NettoAlltag = MAX(0, Σ(Alltagsbudgets) - Kindergeld)
  const sumAlltagsbudgetsCents = state.budgets.reduce(
    (sum, budget) => sum + Math.max(0, Math.round(budget.monthlyLimitCents)),
    0
  );
  const stufe2NettoAlltagCents = Math.max(0, sumAlltagsbudgetsCents - kindergeldCents);

  // Stufe 3: GemeinsameRuecklagen = Σ(SinkingFunds) abzgl. evtl. Rollover-Gutschrift Modus A
  const stufe3GemeinsameRuecklagenCents = Math.max(
    0,
    sinkingFundsMonthlyCents - ingRolloverCreditCents
  );

  // Stufe 4: GemeinschaftsanteilA = Math.round((NettoWohnen + NettoAlltag + GemeinsameRuecklagen) * 0.5)
  const sumSharedObligationsCents =
    stufe1NettoWohnenCents + stufe2NettoAlltagCents + stufe3GemeinsameRuecklagenCents;
  const stufe4GemeinschaftsanteilACents = split5050Cents(sumSharedObligationsCents);

  // Stufe 5: PrivatePflichtA = Σ(AktivePrivateDarlehensraten) + Σ(PrivateAbos) + Σ(ImMonatFaelligePayIn30)
  let activePrivateLoanRatesCents = 0;
  let pausedLoansCount = 0;
  let pausedLoansMonthlyReliefCents = 0;
  let totalLoanRemainingDebtCents = 0;

  for (const loan of state.privateLoans) {
    const rate = Math.max(0, Math.round(loan.monthlyRateCents));
    const remaining = Math.max(0, Math.round(loan.remainingCents));
    totalLoanRemainingDebtCents += remaining;

    if (remaining > 0) {
      if (loan.isPausedThisMonth) {
        pausedLoansCount += 1;
        pausedLoansMonthlyReliefCents += rate;
      } else {
        activePrivateLoanRatesCents += rate;
      }
    }
  }

  const relevantPayIn30 = options?.yearMonth
    ? state.payIn30Items.filter((item) => item.dueDate.startsWith(options.yearMonth!))
    : state.payIn30Items;

  const payIn30DueCents = relevantPayIn30.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.cents)),
    0
  );

  const stufe5PrivatePflichtACents =
    activePrivateLoanRatesCents + privateAbosCents + payIn30DueCents;

  const gesamtPflichtlastACents = stufe4GemeinschaftsanteilACents + stufe5PrivatePflichtACents;

  return {
    warmmieteCents,
    wohngeldCents,
    operatingCostsCents,
    stufe1NettoWohnenCents,
    sumAlltagsbudgetsCents,
    kindergeldCents,
    stufe2NettoAlltagCents,
    sinkingFundsMonthlyCents,
    ingRolloverCreditCents,
    stufe3GemeinsameRuecklagenCents,
    sumSharedObligationsCents,
    stufe4GemeinschaftsanteilACents,
    activePrivateLoanRatesCents,
    pausedLoansCount,
    pausedLoansMonthlyReliefCents,
    totalLoanRemainingDebtCents,
    privateAbosCents,
    payIn30DueCents,
    stufe5PrivatePflichtACents,
    gesamtPflichtlastACents,
  };
}

/**
 * Berechnet den Trinkgeld-Waterfall, den Liquiditäts-Zustandsautomaten und prüft die System-Invarianten (3.B & 3.C).
 */
export function projectLiquidityAndWaterfall(
  gesamtPflichtlastACents: number,
  transactions: Transaction[]
): LiquidityProjection {
  const safePflichtlastA = Math.max(0, Math.round(gesamtPflichtlastACents));

  let gehaltCents = 0;
  let erfasstesTrinkgeldCents = 0;
  let reinePrivatausgabenACents = 0;
  let bufferAusgabenGesamtCents = 0;
  let bufferAnteilACents = 0;

  // Chronologische Sortierung nach Timestamp (stabil bei gleichem Timestamp)
  const orderedTx = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

  // Für die Einzahlungs-Zustandsmaschine verfolgen wir auch das laufend reservierte Bargeld
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
        const currentGapBeforeDeposits = Math.max(0, safePflichtlastA - runningSalary);
        const currentTipForPflicht = Math.min(runningTips, currentGapBeforeDeposits);
        const currentlyReservedCash = Math.max(0, currentTipForPflicht - requestedDepositsCents);
        // Falls tx.cents > 0 angegeben wurde, zahle maximal diesen Betrag (gedeckt durch aktuell reserviertes Bargeld) ein;
        // falls tx.cents === 0 (Standard-Button "Reserviertes Bargeld einzahlen"), transferiere das gesamte aktuell reservierte Bargeld.
        const transferAmount =
          cents > 0 ? Math.min(currentlyReservedCash, cents) : currentlyReservedCash;
        requestedDepositsCents += transferAmount;
        break;
      }
      case 'EXPENSE_PRIVATE_A': {
        reinePrivatausgabenACents += cents;
        break;
      }
      case 'EXPENSE_BUFFER': {
        bufferAusgabenGesamtCents += cents;
        // Invariant 2: 50%-Anteil von Partner A mindert direkt das freie Taschengeld
        bufferAnteilACents += split5050Cents(cents);
        break;
      }
      case 'EXPENSE_SHARED': {
        // Geht auf das jeweilige Alltagsbudget
        break;
      }
    }
  }

  // 1. & 2. Pflichtlücke nach Gehalt (vor Bareinzahlungen)
  const pflichtLueckeVorEinzahlungCents = Math.max(0, safePflichtlastA - gehaltCents);

  // 3. Laufendes Schicht-Trinkgeld füllt prioritär die Pflichtlücke
  const totalTipForPflichtCents = Math.min(
    erfasstesTrinkgeldCents,
    pflichtLueckeVorEinzahlungCents
  );

  // 4. Bestätigte Einzahlungen transferieren BargeldReserviertBank auf das Bankkonto und mindern die Pflichtlücke
  const eingezahltesBargeldCents = Math.min(totalTipForPflichtCents, requestedDepositsCents);
  const bargeldReserviertBankCents = totalTipForPflichtCents - eingezahltesBargeldCents;
  const pflichtLueckeNachEinzahlungCents =
    pflichtLueckeVorEinzahlungCents - eingezahltesBargeldCents;

  // Ungedecktes Pflicht-Soll (noch nicht einmal durch reserviertes Bargeld gedeckt)
  const ungedecktesPflichtSollCents = Math.max(
    0,
    pflichtLueckeNachEinzahlungCents - bargeldReserviertBankCents
  );

  // Freies Taschengeld & Dynamischer 2x-Puffer
  const privatausgabenGesamtACents = reinePrivatausgabenACents + bufferAnteilACents;
  const freiesTaschengeldVorAusgabenCents = Math.max(
    0,
    erfasstesTrinkgeldCents - pflichtLueckeVorEinzahlungCents
  );
  const freiesTaschengeldCents =
    freiesTaschengeldVorAusgabenCents - privatausgabenGesamtACents;
  const verfuegbarerPufferCents = 2 * freiesTaschengeldCents;

  // Ampel-Logik für GesamtPflichtlastA:
  // GRÜN: Pflichtlücke auf Bankkonto vollständig gedeckt (0 Cent offen)
  // GELB: Ungedecktes Pflicht-Soll ist 0, aber Bargeld liegt noch reserviert zuhause (muss noch eingezahlt werden)
  // ROT: Es fehlt noch Geld zur Deckung (ungedecktesPflichtSollCents > 0)
  let ampelStatus: TrafficLightStatus = 'RED';
  if (pflichtLueckeNachEinzahlungCents === 0) {
    ampelStatus = 'GREEN';
  } else if (ungedecktesPflichtSollCents === 0 && bargeldReserviertBankCents > 0) {
    ampelStatus = 'YELLOW';
  } else {
    ampelStatus = 'RED';
  }

  const invariants = verifySystemInvariants({
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    freiesTaschengeldCents,
    privatausgabenCents: privatausgabenGesamtACents,
    eingezahltesBargeldCents,
    verfuegbarerPufferCents,
  });

  return {
    gesamtPflichtlastACents: safePflichtlastA,
    gehaltCents,
    pflichtLueckeVorEinzahlungCents,
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    eingezahltesBargeldCents,
    pflichtLueckeNachEinzahlungCents,
    ungedecktesPflichtSollCents,
    reinePrivatausgabenACents,
    bufferAusgabenGesamtCents,
    bufferAnteilACents,
    privatausgabenGesamtACents,
    freiesTaschengeldCents,
    verfuegbarerPufferCents,
    ampelStatus,
    invariants,
  };
}

/**
 * Prüft die beiden Erhaltungssätze (System-Invarianten 3.C) sowie die ganzzahlige Cent-Integrität.
 */
export function verifySystemInvariants(params: {
  erfasstesTrinkgeldCents: number;
  bargeldReserviertBankCents: number;
  freiesTaschengeldCents: number;
  privatausgabenCents: number;
  eingezahltesBargeldCents: number;
  verfuegbarerPufferCents: number;
}): SystemInvariantCheckResult {
  const {
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    freiesTaschengeldCents,
    privatausgabenCents,
    eingezahltesBargeldCents,
    verfuegbarerPufferCents,
  } = params;

  const allIntegersValid = [
    erfasstesTrinkgeldCents,
    bargeldReserviertBankCents,
    freiesTaschengeldCents,
    privatausgabenCents,
    eingezahltesBargeldCents,
    verfuegbarerPufferCents,
  ].every((val) => Number.isSafeInteger(val));

  const expectedTrinkgeldSumCents =
    bargeldReserviertBankCents +
    freiesTaschengeldCents +
    privatausgabenCents +
    eingezahltesBargeldCents;

  const invariant1TipConservation = erfasstesTrinkgeldCents === expectedTrinkgeldSumCents;
  const expectedBufferCents = 2 * freiesTaschengeldCents;
  const invariant2BufferIdentity = verfuegbarerPufferCents === expectedBufferCents;

  return {
    valid: allIntegersValid && invariant1TipConservation && invariant2BufferIdentity,
    invariant1TipConservation,
    invariant2BufferIdentity,
    allIntegersValid,
    details: {
      erfasstesTrinkgeldCents,
      bargeldReserviertBankCents,
      freiesTaschengeldCents,
      privatausgabenCents,
      eingezahltesBargeldCents,
      verfuegbarerPufferCents,
      expectedTrinkgeldSumCents,
      expectedBufferCents,
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

/**
 * Projiziert alle Alltagsbudgets inkl. Fortschritt und optionalem Wochen-Pacer (KW-Soll vs. KW-Ist).
 */
export function projectBudgets(
  budgets: BudgetCategory[],
  transactions: Transaction[],
  referenceTimestamp: number = Date.now()
): BudgetProjection[] {
  const weekStartMs = getStartOfISOWeekTimestamp(referenceTimestamp);

  return budgets.map((budget) => {
    const monthlyLimitCents = Math.max(0, Math.round(budget.monthlyLimitCents));
    let spentCents = 0;
    let weeklySpentCents = 0;

    for (const tx of transactions) {
      if (tx.type === 'EXPENSE_SHARED' && tx.budgetId === budget.id) {
        const cents = Math.max(0, Math.round(tx.cents));
        spentCents += cents;
        if (tx.timestamp >= weekStartMs && tx.timestamp <= referenceTimestamp + 86_400_000) {
          weeklySpentCents += cents;
        }
      }
    }

    const remainingCents = monthlyLimitCents - spentCents;
    const surplusCents = Math.max(0, remainingCents);
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
      monthlyLimitCents,
      spentCents,
      remainingCents,
      surplusCents,
      utilizationPercent,
      weeklyTargetCents,
      weeklySpentCents,
      weeklyRemainingCents,
    };
  });
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
 * 1-Klick-Aktion: Gleicht alle offenen Barkauf-/Kleinanzeigen-Posten aus.
 */
export function settleOpenCashClearing(state: AppStateV2): AppStateV2 {
  return {
    ...state,
    transactions: state.transactions.map((tx) =>
      tx.type === 'EXPENSE_SHARED' && tx.markedForCashClearing
        ? { ...tx, markedForCashClearing: false }
        : tx
    ),
  };
}

/**
 * Berechnet die Fälligkeits-Ampel für Pay-in-30 Verbindlichkeiten (>7 Tage grün, 1-7 Tage gelb, <=0 Tage rot).
 */
export function projectPayIn30Items(
  items: PayIn30Item[],
  referenceTimestamp: number = Date.now()
): PayIn30Projection[] {
  const refDate = new Date(referenceTimestamp);
  const refMidnightUTC = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

  return [...items]
    .map((item) => {
      const parsed = new Date(`${item.dueDate}T00:00:00Z`);
      const dueMidnightUTC = Number.isNaN(parsed.getTime())
        ? refMidnightUTC
        : Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());

      const daysUntilDue = Math.round((dueMidnightUTC - refMidnightUTC) / 86_400_000);

      let ampelStatus: TrafficLightStatus = 'GREEN';
      if (daysUntilDue <= 0) {
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
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/**
 * Pausiert oder reaktiviert ein privates Darlehen für den aktuellen Monat.
 * Senkt bei Pausierung sofort die monatliche Pflichtlast, lässt aber die Restschuld (remainingCents) exakt unverändert.
 */
export function togglePrivateLoanPause(state: AppStateV2, loanId: string): AppStateV2 {
  return {
    ...state,
    privateLoans: state.privateLoans.map((loan) =>
      loan.id === loanId
        ? { ...loan, isPausedThisMonth: !loan.isPausedThisMonth }
        : loan
    ),
  };
}

/**
 * Modus A (Budget-Rollover): Schreibt unverbrauchten Budget-Überschuss dem ING Tagesgeld gut
 * (senkt GemeinsameRuecklagen im Folgemonat) und reduziert entsprechend das Quell-Budgetlimit.
 */
export function rolloverBudgetToIngTagesgeld(
  state: AppStateV2,
  sourceBudgetId: string,
  amountCents: number
): AppStateV2 {
  const safeAmount = Math.max(0, Math.round(amountCents));
  if (safeAmount === 0) {
    return state;
  }

  const budgets = projectBudgets(state.budgets, state.transactions);
  const source = budgets.find((b) => b.id === sourceBudgetId);
  if (!source) {
    return state;
  }

  const transferableCents = Math.min(safeAmount, source.surplusCents);
  if (transferableCents <= 0) {
    return state;
  }

  return {
    ...state,
    config: {
      ...state.config,
      ingRolloverCreditCents:
        Math.max(0, Math.round(state.config.ingRolloverCreditCents ?? 0)) + transferableCents,
    },
    budgets: state.budgets.map((b) =>
      b.id === sourceBudgetId
        ? { ...b, monthlyLimitCents: Math.max(0, b.monthlyLimitCents - transferableCents) }
        : b
    ),
  };
}

/**
 * Modus B (Budget-Rollover): Überträgt unverbrauchten Überschuss von einem Alltagsbudget in ein anderes Alltagsbudget.
 */
export function reallocateBudgetSurplus(
  state: AppStateV2,
  sourceBudgetId: string,
  targetBudgetId: string,
  amountCents: number
): AppStateV2 {
  if (sourceBudgetId === targetBudgetId) {
    return state;
  }
  const safeAmount = Math.max(0, Math.round(amountCents));
  if (safeAmount === 0) {
    return state;
  }

  const budgets = projectBudgets(state.budgets, state.transactions);
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
    budgets: state.budgets.map((b) => {
      if (b.id === sourceBudgetId) {
        return { ...b, monthlyLimitCents: Math.max(0, b.monthlyLimitCents - transferableCents) };
      }
      if (b.id === targetBudgetId) {
        return { ...b, monthlyLimitCents: b.monthlyLimitCents + transferableCents };
      }
      return b;
    }),
  };
}

/**
 * Gesamte deterministische Projektion des AppStateV2 für das Dashboard.
 */
export function projectDashboard(
  state: AppStateV2,
  referenceTimestamp: number = Date.now()
): FullDashboardProjection {
  const obligations = calculateObligationBreakdown(state);
  const liquidity = projectLiquidityAndWaterfall(
    obligations.gesamtPflichtlastACents,
    state.transactions
  );
  const budgets = projectBudgets(state.budgets, state.transactions, referenceTimestamp);
  const totalBudgetSurplusCents = budgets.reduce((sum, b) => sum + b.surplusCents, 0);
  const cashClearing = projectCashClearing(state.transactions);
  const payIn30 = projectPayIn30Items(state.payIn30Items, referenceTimestamp);

  const totalSharedBudgetSpentCents = budgets.reduce((sum, b) => sum + b.spentCents, 0);
  const totalSharedExpensesCents =
    totalSharedBudgetSpentCents + liquidity.bufferAusgabenGesamtCents;
  const partnerBShareOfExpensesCents = split5050Cents(totalSharedExpensesCents);

  return {
    obligations,
    liquidity,
    budgets,
    totalBudgetSurplusCents,
    cashClearing,
    payIn30,
    totalSharedExpensesCents,
    partnerBShareOfExpensesCents,
  };
}

/**
 * Generiert den formatierten 1-Klick WhatsApp-Report für Partner B (Spezifikation 5.5).
 */
export function generateWhatsAppReport(
  state: AppStateV2,
  referenceDate: Date = new Date()
): string {
  const projection = projectDashboard(state, referenceDate.getTime());
  const monthStr = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const yearStr = String(referenceDate.getFullYear());

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

  const ingRuecklagenFormatted = formatCentsToEuro(
    projection.obligations.stufe3GemeinsameRuecklagenCents,
    false
  );

  return [
    `📊 FlowPilot Status ${monthStr}/${yearStr}`,
    `• Gemeinsame Ausgaben: ${sharedExpensesFormatted} €`,
    `• Dein Anteil (50 %): ${partnerShareFormatted} €`,
    `• Barausgleich: ${netClearingAbsFormatted} € [${clearingStatus}]`,
    `• Rücklagen ING: ${ingRuecklagenFormatted} €`,
  ].join('\n');
}
