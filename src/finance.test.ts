import { describe, expect, it } from 'vitest';
import {
  calculateObligationBreakdown,
  confirmPrivateLoanPayment,
  formatCentsToEuro,
  formatCentsToInputString,
  generateWhatsAppReport,
  markPayIn30Paid,
  parseEuroInputToCents,
  projectCashClearing,
  projectDashboard,
  projectLiquidityAndWaterfall,
  projectPayIn30Items,
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
  createDefaultAppStateV3,
  DEFAULT_KINDERGELD_CENTS,
  DEFAULT_WOHNGELD_CENTS,
  getSinkingFundMonthlyCents,
  migrateStateToV3,
  PaymentMethod,
  SPECIAL_TASCHENGELD_BUDGET_ID,
  Transaction,
} from './model';
import {
  buildTransactionsCsvWithBom,
  loadAppStateFromStorage,
  STORAGE_KEY_V2,
  STORAGE_KEY_V3,
} from './storage';

describe('1. Cent-Arithmetik, Parser, 50:50-Splits & Sinking-Fund-Turnus', () => {
  it('parst Komma- und Punkt-Eingaben exakt ohne IEEE-754 Float-Verluste in Integer-Cent', () => {
    expect(parseEuroInputToCents('19,99')).toBe(1_999);
    expect(parseEuroInputToCents('19.99')).toBe(1_999);
    expect(parseEuroInputToCents('470')).toBe(47_000);
    expect(parseEuroInputToCents('1.234,56 €')).toBe(123_456);
    expect(parseEuroInputToCents('  259,00  ')).toBe(25_900);
    expect(parseEuroInputToCents('12,5')).toBe(1_250);
    expect(parseEuroInputToCents('0,01')).toBe(1);
    expect(parseEuroInputToCents('0')).toBe(0);
    expect(parseEuroInputToCents('')).toBeNull();
    expect(parseEuroInputToCents('   ')).toBeNull();
    expect(parseEuroInputToCents('abc')).toBeNull();
  });

  it('formatiert ganzzahlige Cent-Werte korrekt in deutsche Dezimal-Euro', () => {
    expect(formatCentsToEuro(0)).toBe('0,00 €');
    expect(formatCentsToEuro(47_000)).toBe('470,00 €');
    expect(formatCentsToEuro(123_456)).toBe('1.234,56 €');
    expect(formatCentsToEuro(-1_450)).toBe('-14,50 €');
    expect(formatCentsToInputString(25_900)).toBe('259,00');
  });

  it('berechnet gerade und ungerade 50:50-Splits sowie Sinking-Fund-Monatsraten deterministisch in Integer-Cent', () => {
    expect(split5050Cents(100)).toBe(50);
    expect(split5050Cents(101)).toBe(51); // Math.round(50.5) === 51
    expect(split5050Cents(1)).toBe(1);
    expect(split5050Cents(0)).toBe(0);
    expect(split5050Cents(99_999)).toBe(50_000);

    expect(getSinkingFundMonthlyCents({ amountCents: 10_000, interval: 'MONTHLY' })).toBe(10_000);
    expect(getSinkingFundMonthlyCents({ amountCents: 5_508, interval: 'QUARTERLY' })).toBe(1_836);
    expect(getSinkingFundMonthlyCents({ amountCents: 12_000, interval: 'SEMI_ANNUAL' })).toBe(2_000);
    expect(getSinkingFundMonthlyCents({ amountCents: 54_000, interval: 'ANNUAL' })).toBe(4_500);
    expect(getSinkingFundMonthlyCents({ amountCents: 10_000, interval: 'ANNUAL' })).toBe(833);
  });
});

describe('2. Entflechtete 5-Stufen-Pflichtlast inkl. Einzelposten, Eigene Pflichtlasten & Budget-Überschreitungen', () => {
  it('berechnet alle 5 Stufen inkl. Sinking Funds, Private Abos und eigenen Pflichtlasten (50:50 & Privat A)', () => {
    const state: AppStateV3 = {
      schemaVersion: 3,
      config: {
        warmmieteCents: 97_000, // 970,00 €
        wohngeldCents: DEFAULT_WOHNGELD_CENTS, // 47.000 Cent
        operatingCostsCents: 15_000, // 150,00 €
        kindergeldCents: DEFAULT_KINDERGELD_CENTS, // 25.900 Cent
      },
      sinkingFundItems: [
        { id: 'sf-1', name: 'Kfz', amountCents: 72_000, interval: 'ANNUAL' }, // 6.000 / Mon
        { id: 'sf-2', name: 'GEZ', amountCents: 12_000, interval: 'QUARTERLY' }, // 4.000 / Mon
      ],
      privateSubscriptionItems: [
        { id: 'sub-1', name: 'Handy', monthlyCents: 2_000 },
        { id: 'sub-2', name: 'Cloud', monthlyCents: 1_000 },
      ],
      customObligations: [
        { id: 'co-1', name: 'Kita-Essensgeld', monthlyCents: 6_000, scope: 'SHARED_50_50' },
        { id: 'co-2', name: 'Gewerkschaft A', monthlyCents: 1_500, scope: 'PRIVATE_A' },
      ],
      budgets: [
        {
          id: 'b-baby',
          name: 'Baby-Budget',
          monthlyLimitCents: 25_900,
          icon: 'Baby',
          color: 'amber',
        },
        {
          id: 'b-food',
          name: 'Lebensmittel',
          monthlyLimitCents: 40_000,
          icon: 'ShoppingCart',
          color: 'emerald',
        },
      ],
      privateLoans: [
        {
          id: 'l-1',
          name: 'Kfz-Darlehen',
          monthlyRateCents: 12_000,
          totalAmountCents: 120_000,
          remainingCents: 80_000,
          monthlyRecords: {},
        },
      ],
      payIn30Items: [
        {
          id: 'p-1',
          name: 'Klarna Einkauf',
          cents: 5_000,
          dueDate: '2026-11-20',
        },
      ],
      monthlyData: {},
      transactions: [],
    };

    const result = calculateObligationBreakdown(state, { yearMonth: '2026-11' });

    // Stufe 1: MAX(0, 97.000 - 47.000) + 15.000 = 65.000
    expect(result.stufe1NettoWohnenCents).toBe(65_000);
    // Stufe 2: MAX(0, (25.900 + 40.000) - 25.900) = 40.000
    expect(result.stufe2NettoAlltagCents).toBe(40_000);
    // Stufe 3: 6.000 + 4.000 = 10.000
    expect(result.stufe3GemeinsameRuecklagenCents).toBe(10_000);
    // Eigene Shared 50:50: 6.000 -> Summe Shared = 65.000 + 40.000 + 10.000 + 6.000 = 121.000
    // Stufe 4: Math.round(121.000 * 0.5) = 60.500
    expect(result.customSharedObligationsCents).toBe(6_000);
    expect(result.stufe4GemeinschaftsanteilACents).toBe(60_500);
    // Stufe 5: 12.000 (Darlehen) + 3.000 (Abos) + 1.500 (Eigene Privat A) + 5.000 (PayIn30) = 21.500
    expect(result.privateAbosCents).toBe(3_000);
    expect(result.customPrivateObligationsACents).toBe(1_500);
    expect(result.stufe5PrivatePflichtACents).toBe(21_500);
    // GesamtPflichtlastA = 60.500 + 21.500 = 82.000
    expect(result.gesamtPflichtlastACents).toBe(82_000);
  });

  it('behandelt Randfälle korrekt: Wohngeld > Warmmiete sowie Kindergeld > Alltagsbudgets', () => {
    const edgeState: AppStateV3 = {
      schemaVersion: 3,
      config: {
        warmmieteCents: 40_000,
        wohngeldCents: DEFAULT_WOHNGELD_CENTS,
        operatingCostsCents: 12_000,
        kindergeldCents: DEFAULT_KINDERGELD_CENTS,
      },
      sinkingFundItems: [
        { id: 'sf-odd', name: 'Test', amountCents: 5_001, interval: 'MONTHLY' },
      ],
      privateSubscriptionItems: [],
      customObligations: [],
      budgets: [
        {
          id: 'b-small',
          name: 'Mini-Budget',
          monthlyLimitCents: 15_000,
          icon: 'Wallet',
          color: 'emerald',
        },
      ],
      privateLoans: [],
      payIn30Items: [],
      monthlyData: {},
      transactions: [],
    };

    const result = calculateObligationBreakdown(edgeState, { yearMonth: '2026-11' });
    expect(result.stufe1NettoWohnenCents).toBe(12_000);
    expect(result.stufe2NettoAlltagCents).toBe(0);
    expect(result.stufe3GemeinsameRuecklagenCents).toBe(5_001);
    expect(result.stufe4GemeinschaftsanteilACents).toBe(8_501);
    expect(result.gesamtPflichtlastACents).toBe(8_501);
  });

  it('addiert Budget-Überschreitungen zu Stufe 2 (50% Anteil erhöht Pflichtlast A und mindert Taschengeld)', () => {
    const state = createDefaultAppStateV3();
    state.transactions = [
      // Genug Gehalt für Pflichtlast + 200 € Taschengeld
      {
        id: 'sal-1',
        timestamp: Date.UTC(2026, 10, 1, 12),
        date: '2026-11-01',
        cents: 200_000,
        type: 'INCOME_SALARY',
      },
    ];

    const before = projectDashboard(state, '2026-11');
    const foodBudget = state.budgets[0]; // Limit 44.000 Cent

    // Überziehung um genau 10.000 Cent (54.000 ausgegeben bei 44.000 Limit)
    state.transactions.push({
      id: 'over-1',
      timestamp: Date.UTC(2026, 10, 10, 12),
      date: '2026-11-10',
      cents: foodBudget.monthlyLimitCents + 10_000,
      type: 'EXPENSE_SHARED',
      budgetId: foodBudget.id,
      paymentMethod: 'GIRO_SHARED',
    });

    const after = projectDashboard(state, '2026-11');
    expect(after.totalBudgetOverrunCents).toBe(10_000);
    expect(after.obligations.totalBudgetOverrunCents).toBe(10_000);
    // 50 % der 10.000 Cent Überziehung = 5.000 Cent höhere Pflichtlast A
    expect(after.obligations.gesamtPflichtlastACents).toBe(
      before.obligations.gesamtPflichtlastACents + 5_000
    );
    // Dadurch sinkt das freie Taschengeld exakt um 5.000 Cent!
    expect(after.liquidity.freiesTaschengeldCents).toBe(
      before.liquidity.freiesTaschengeldCents - 5_000
    );
    expect(after.liquidity.invariants.valid).toBe(true);
  });
});

describe('3. Liquiditäts-Waterfall, Ungenutztes Gehalt & Taschengeld (50:50)', () => {
  const pflichtlastACents = 80_000; // 800,00 €

  it('durchläuft Waterfall mit Gehalt, Trinkgeld, Einzahlung, Privatausgabe und Taschengeld (50:50)', () => {
    const transactions: Transaction[] = [
      { id: 't1', timestamp: 1000, cents: 50_000, type: 'INCOME_SALARY' },
      { id: 't2', timestamp: 2000, cents: 18_000, type: 'INCOME_TIP' },
    ];

    const step1 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step1.pflichtLueckeVorEinzahlungCents).toBe(30_000);
    expect(step1.bargeldReserviertBankCents).toBe(18_000);
    expect(step1.freiesTaschengeldCents).toBe(0);
    expect(step1.ungedecktesPflichtSollCents).toBe(12_000);
    expect(step1.ampelStatus).toBe('RED');
    expect(step1.invariants.valid).toBe(true);

    // 2. Trinkgeld 220 € -> 300 € reserviert für Bank, 100 € freies Taschengeld
    transactions.push({ id: 't3', timestamp: 3000, cents: 22_000, type: 'INCOME_TIP' });
    const step2 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step2.bargeldReserviertBankCents).toBe(30_000);
    expect(step2.ungedecktesPflichtSollCents).toBe(0);
    expect(step2.freiesTaschengeldCents).toBe(10_000);
    expect(step2.ampelStatus).toBe('YELLOW');
    expect(step2.invariants.valid).toBe(true);

    // 3. Einzahlung bestätigen -> Ampel GRÜN
    transactions.push({ id: 't4', timestamp: 4000, cents: 30_000, type: 'DEPOSIT_CONFIRMED' });
    const step3 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step3.bargeldReserviertBankCents).toBe(0);
    expect(step3.eingezahltesBargeldCents).toBe(30_000);
    expect(step3.pflichtLueckeNachEinzahlungCents).toBe(0);
    expect(step3.ampelStatus).toBe('GREEN');
    expect(step3.freiesTaschengeldCents).toBe(10_000);
    expect(step3.invariants.valid).toBe(true);

    // 4. Privatausgabe A (25 €) ohne Kategorie -> Taschengeld 75 €
    transactions.push({
      id: 't5',
      timestamp: 5000,
      cents: 2_500,
      type: 'EXPENSE_PRIVATE_A',
      note: 'Kaffee & Snack',
    });
    const step4 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step4.freiesTaschengeldCents).toBe(7_500);
    expect(step4.invariants.valid).toBe(true);

    // 5. Gemeinsame Ausgabe auf SPECIAL_TASCHENGELD (40 €) -> 50% Anteil (20 €) vom Taschengeld ab
    transactions.push({
      id: 't6',
      timestamp: 6000,
      cents: 4_000,
      type: 'EXPENSE_SHARED',
      budgetId: SPECIAL_TASCHENGELD_BUDGET_ID,
      paymentMethod: 'CASH_A',
      markedForCashClearing: true,
    });
    const step5 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step5.sharedTaschengeldGesamtCents).toBe(4_000);
    expect(step5.sharedTaschengeldAnteilACents).toBe(2_000);
    expect(step5.freiesTaschengeldCents).toBe(5_500);
    expect(step5.invariants.valid).toBe(true);
  });

  it('behandelt ungenutztes Gehalt als freies Taschengeld (ohne unnötige Bargeld-Reservierung)', () => {
    const transactions: Transaction[] = [
      // Gehalt 1.000 € bei 800 € Pflichtlast -> 200 € ungenutztes Gehalt = Taschengeld!
      { id: 'sal', timestamp: 1000, cents: 100_000, type: 'INCOME_SALARY' },
      // Zusätzliches Trinkgeld 50 € -> komplett ins Taschengeld (0 € für Bank reserviert)
      { id: 'tip', timestamp: 2000, cents: 5_000, type: 'INCOME_TIP' },
    ];

    const res = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(res.pflichtLueckeVorEinzahlungCents).toBe(0);
    expect(res.bargeldReserviertBankCents).toBe(0);
    expect(res.ungedecktesPflichtSollCents).toBe(0);
    expect(res.unusedSalaryCents).toBe(20_000);
    expect(res.freiesTaschengeldCents).toBe(25_000);
    expect(res.ampelStatus).toBe('GREEN');
    expect(res.invariants.valid).toBe(true);
  });
});

describe('4. Monatsmodell & Vormonats-Carryover (erst Tagesgeld A, Rest Start-Taschengeld)', () => {
  it('überträgt positiven Vormonats-Überschuss erst auf Tagesgeld-Anteil A und den Rest als Start-Taschengeld', () => {
    const state: AppStateV3 = {
      schemaVersion: 3,
      config: {
        warmmieteCents: 60_000,
        wohngeldCents: 40_000,
        operatingCostsCents: 10_000, // Stufe 1 = 30.000
        kindergeldCents: 20_000,
      },
      sinkingFundItems: [
        // Stufe 3 = 10.000 -> Partner A 50%-Anteil = 5.000 Cent (50,00 €)
        { id: 'sf-1', name: 'Rücklagen', amountCents: 10_000, interval: 'MONTHLY' },
      ],
      privateSubscriptionItems: [],
      customObligations: [],
      budgets: [
        // Stufe 2 = 40.000 - 20.000 = 20.000
        { id: 'b-1', name: 'Alltag', monthlyLimitCents: 40_000, icon: 'Wallet', color: 'emerald' },
      ],
      // Shared = 30.000 + 20.000 + 10.000 = 60.000 -> Stufe 4 = 30.000 -> GesamtPflichtlastA = 30.000
      privateLoans: [],
      payIn30Items: [],
      monthlyData: {},
      transactions: [
        // Monat 2026-10: Gehalt 42.000 Cent bei 30.000 Pflichtlast -> +12.000 Cent freies Taschengeld!
        // (Ungenutzte 40.000 Cent Alltagsbudget verfallen und erhöhen das Taschengeld NICHT!)
        {
          id: 'oct-sal',
          timestamp: Date.UTC(2026, 9, 15, 12),
          date: '2026-10-15',
          cents: 42_000,
          type: 'INCOME_SALARY',
        },
        // Monat 2026-11: Gehalt 25.000 Cent (genau die verbleibende effektive Pflichtlast!)
        {
          id: 'nov-sal',
          timestamp: Date.UTC(2026, 10, 15, 12),
          date: '2026-11-15',
          cents: 25_000,
          type: 'INCOME_SALARY',
        },
      ],
    };

    // Vor erstem aktiven Monat (2026-09): kein Carryover
    const sep = projectDashboard(state, '2026-09');
    expect(sep.liquidity.carryoverFromPrevMonthCents).toBe(0);
    expect(sep.liquidity.freiesTaschengeldCents).toBe(0);

    // Oktober: +12.000 Cent Überschuss (Alltagsbudget-Überschuss verfällt!)
    const oct = projectDashboard(state, '2026-10');
    expect(oct.obligations.gesamtPflichtlastACents).toBe(30_000);
    expect(oct.liquidity.freiesTaschengeldCents).toBe(12_000);
    expect(oct.liquidity.invariants.valid).toBe(true);

    // November: Carryover 12.000 -> erst 5.000 auf Tagesgeld-Anteil A, Rest 7.000 Start-Taschengeld!
    const nov = projectDashboard(state, '2026-11');
    expect(nov.liquidity.carryoverFromPrevMonthCents).toBe(12_000);
    expect(nov.liquidity.carryoverToTagesgeldCents).toBe(5_000);
    expect(nov.liquidity.carryoverToTaschengeldCents).toBe(7_000);
    expect(nov.liquidity.effectivePflichtlastACents).toBe(25_000); // 30.000 - 5.000
    expect(nov.liquidity.ungedecktesPflichtSollCents).toBe(0); // 25.000 Gehalt deckt exakt
    expect(nov.liquidity.ampelStatus).toBe('GREEN');
    expect(nov.liquidity.freiesTaschengeldCents).toBe(7_000);
    expect(nov.liquidity.invariants.valid).toBe(true);

    // Dezember (keine neuen Einkünfte): 7.000 Carryover aus Nov -> 5.000 auf Tagesgeld A, 2.000 Start-Taschengeld
    const dec = projectDashboard(state, '2026-12');
    expect(dec.liquidity.carryoverFromPrevMonthCents).toBe(7_000);
    expect(dec.liquidity.carryoverToTagesgeldCents).toBe(5_000);
    expect(dec.liquidity.carryoverToTaschengeldCents).toBe(2_000);
    expect(dec.liquidity.freiesTaschengeldCents).toBe(2_000);
    expect(dec.liquidity.invariants.valid).toBe(true);

    // Januar 2027: 2.000 Carryover -> komplett in Tagesgeld (2.000 < 5.000), 0 Start-Taschengeld
    const jan = projectDashboard(state, '2027-01');
    expect(jan.liquidity.carryoverFromPrevMonthCents).toBe(2_000);
    expect(jan.liquidity.carryoverToTagesgeldCents).toBe(2_000);
    expect(jan.liquidity.carryoverToTaschengeldCents).toBe(0);
    expect(jan.liquidity.freiesTaschengeldCents).toBe(0);
    expect(jan.liquidity.invariants.valid).toBe(true);
  });

  it('überträgt ein negatives Vormonats-Taschengeld NICHT als Schulden in den Folgemonat', () => {
    const state = createDefaultAppStateV3();
    state.transactions = [
      {
        id: 'priv-neg',
        timestamp: Date.UTC(2026, 9, 10, 12),
        date: '2026-10-10',
        cents: 8_000,
        type: 'EXPENSE_PRIVATE_A',
      },
    ];
    const oct = projectDashboard(state, '2026-10');
    expect(oct.liquidity.freiesTaschengeldCents).toBe(-8_000);

    const nov = projectDashboard(state, '2026-11');
    expect(nov.liquidity.carryoverFromPrevMonthCents).toBe(0);
    expect(nov.liquidity.freiesTaschengeldCents).toBe(0);
  });
});

describe('5. Private Darlehen (Ratenbestätigung, Storno & Monats-Pausierung) & Pay-in-30', () => {
  it('senkt bei „Monatsrate bezahlt“ die Restschuld, hält die Rate aber im Bezahlmonat in Pflichtlast A (auch bei Restschuld 0) und setzt sie im Folgemonat auf 0', () => {
    const state = createDefaultAppStateV3();
    state.payIn30Items = [];
    // Darlehen mit genau 1 verbleibenden Rate (12.000 Cent)
    state.privateLoans = [
      {
        id: 'loan-final',
        name: 'Auto-Rate Partnerin',
        monthlyRateCents: 12_000,
        totalAmountCents: 120_000,
        remainingCents: 12_000,
        monthlyRecords: {},
      },
    ];

    const beforeNov = calculateObligationBreakdown(state, { yearMonth: '2026-11' });
    const paidState = confirmPrivateLoanPayment(state, 'loan-final', '2026-11');
    const paidLoan = paidState.privateLoans[0];

    expect(paidLoan.remainingCents).toBe(0);
    expect(paidLoan.monthlyRecords['2026-11']).toEqual({ status: 'PAID', paidCents: 12_000 });

    // Wichtige Accounting-Regel: im Bezahlmonat 2026-11 bleibt die Pflichtlast exakt gleich!
    const afterNov = calculateObligationBreakdown(paidState, { yearMonth: '2026-11' });
    expect(afterNov.activePrivateLoanRatesCents).toBe(12_000);
    expect(afterNov.gesamtPflichtlastACents).toBe(beforeNov.gesamtPflichtlastACents);

    // Im Folgemonat 2026-12 (Restschuld === 0): keine Rate mehr fällig!
    const dec = calculateObligationBreakdown(paidState, { yearMonth: '2026-12' });
    expect(dec.activePrivateLoanRatesCents).toBe(0);
    expect(dec.gesamtPflichtlastACents).toBe(beforeNov.gesamtPflichtlastACents - 12_000);

    // Rückgängig / Storno stellt Restschuld exakt wieder her
    const undoneState = undoPrivateLoanPayment(paidState, 'loan-final', '2026-11');
    expect(undoneState.privateLoans[0].remainingCents).toBe(12_000);
    expect(undoneState.privateLoans[0].monthlyRecords['2026-11']).toBeUndefined();
  });

  it('pausiert ein Darlehen nur für den gewählten Monat und lässt Restschuld & Folgemonat unverändert', () => {
    const state = createDefaultAppStateV3();
    const targetLoan = state.privateLoans[0];

    const beforeNov = calculateObligationBreakdown(state, { yearMonth: '2026-11' });
    const pausedState = togglePrivateLoanPause(state, targetLoan.id, '2026-11');
    const pausedLoan = pausedState.privateLoans.find((l) => l.id === targetLoan.id)!;

    expect(pausedLoan.monthlyRecords['2026-11']?.status).toBe('PAUSED');
    expect(pausedLoan.remainingCents).toBe(targetLoan.remainingCents);

    const afterNov = calculateObligationBreakdown(pausedState, { yearMonth: '2026-11' });
    expect(afterNov.gesamtPflichtlastACents).toBe(
      beforeNov.gesamtPflichtlastACents - targetLoan.monthlyRateCents
    );
    expect(afterNov.pausedLoansMonthlyReliefCents).toBe(targetLoan.monthlyRateCents);

    // Folgemonat 2026-12 ist weiterhin aktiv (nicht pausiert)
    const dec = calculateObligationBreakdown(pausedState, { yearMonth: '2026-12' });
    expect(dec.pausedLoansCount).toBe(0);
    expect(dec.activePrivateLoanRatesCents).toBe(beforeNov.activePrivateLoanRatesCents);
  });

  it('blockiert als bezahlt markierte Pay-in-30 dauerhaft im Bezahlmonat, zeigt überfällige Posten ohne Doppelzählung und erlaubt Rückgängig', () => {
    const state = createDefaultAppStateV3();
    state.payIn30Items = [
      { id: 'p-oct', name: 'Klarna Oktober', cents: 6_000, dueDate: '2026-10-20' },
      { id: 'p-nov', name: 'PayPal November', cents: 4_000, dueDate: '2026-11-15' },
    ];

    // Unbezahlt: p-oct zählt im Oktober, p-nov im November
    const octBreakdown = calculateObligationBreakdown(state, { yearMonth: '2026-10' });
    expect(octBreakdown.payIn30DueCents).toBe(6_000);

    // Im November: p-oct ist noch unbezahlt und überfällig sichtbar, wird aber NICHT doppelt in payIn30DueCents gezählt!
    const novBreakdown = calculateObligationBreakdown(state, { yearMonth: '2026-11' });
    expect(novBreakdown.payIn30DueCents).toBe(4_000);

    const novList = projectPayIn30Items(
      state.payIn30Items,
      '2026-11',
      Date.UTC(2026, 10, 10)
    );
    const octItemInNov = novList.find((i) => i.id === 'p-oct')!;
    expect(octItemInNov.isOverdueFromPrevMonth).toBe(true);
    expect(octItemInNov.ampelStatus).toBe('RED');
    expect(octItemInNov.isCountedInSelectedMonth).toBe(false);

    // p-nov als im November bezahlt markieren -> bleibt in 2026-11 blockiert, in 2026-12 weg!
    const paidState = markPayIn30Paid(state, 'p-nov', '2026-11');
    expect(
      calculateObligationBreakdown(paidState, { yearMonth: '2026-11' }).payIn30DueCents
    ).toBe(4_000);
    expect(
      calculateObligationBreakdown(paidState, { yearMonth: '2026-12' }).payIn30DueCents
    ).toBe(0);

    const paidListDec = projectPayIn30Items(
      paidState.payIn30Items,
      '2026-12',
      Date.UTC(2026, 11, 5)
    );
    expect(paidListDec.some((i) => i.id === 'p-nov')).toBe(false);

    // Rückgängig
    const unmarked = unmarkPayIn30Paid(paidState, 'p-nov');
    expect(unmarked.payIn30Items.find((i) => i.id === 'p-nov')?.paidYearMonth).toBeUndefined();
  });
});

describe('6. Cash-Clearing, Monats-Rollover, WhatsApp-Report & Verlustfreie V1/V2 -> V3 Migration', () => {
  it('berechnet Cash-Clearing inkl. SPECIAL_TASCHENGELD und gleicht monatsbezogen aus', () => {
    const state = createDefaultAppStateV3();
    state.transactions = [
      {
        id: 'c1',
        timestamp: Date.UTC(2026, 10, 5, 12),
        date: '2026-11-05',
        cents: 6_000,
        type: 'EXPENSE_SHARED',
        budgetId: SPECIAL_TASCHENGELD_BUDGET_ID,
        paymentMethod: 'CASH_A',
        markedForCashClearing: true,
      },
      {
        id: 'c2',
        timestamp: Date.UTC(2026, 10, 6, 12),
        date: '2026-11-06',
        cents: 2_000,
        type: 'EXPENSE_SHARED',
        budgetId: state.budgets[0].id,
        paymentMethod: 'CASH_B',
        markedForCashClearing: true,
      },
    ];

    const clearing = projectCashClearing(state.transactions);
    expect(clearing.netBalanceACents).toBe(2_000);

    const settled = settleOpenCashClearing(state, '2026-11');
    expect(projectCashClearing(settled.transactions).openTransactions).toHaveLength(0);
  });

  it('speichert Budget-Reallokation & ING-Rollover sauber pro Monat ohne Folgemonate zu verzerren', () => {
    const state = createDefaultAppStateV3();
    state.transactions = [];
    const source = state.budgets[0];
    const target = state.budgets[1];

    const beforeNov = projectDashboard(state, '2026-11');
    const afterModeA = rolloverBudgetToIngTagesgeld(state, source.id, 4_000, '2026-11');
    const afterModeB = reallocateBudgetSurplus(
      afterModeA,
      source.id,
      target.id,
      5_000,
      '2026-11'
    );

    const novProj = projectDashboard(afterModeB, '2026-11');
    expect(novProj.obligations.stufe3GemeinsameRuecklagenCents).toBe(
      beforeNov.obligations.stufe3GemeinsameRuecklagenCents - 4_000
    );
    expect(novProj.budgets.find((b) => b.id === source.id)!.monthlyLimitCents).toBe(
      source.monthlyLimitCents - 9_000
    );
    expect(novProj.budgets.find((b) => b.id === target.id)!.monthlyLimitCents).toBe(
      target.monthlyLimitCents + 5_000
    );

    // Folgemonat 2026-12 startet wieder sauber mit den unveränderten Basis-Limits!
    const decProj = projectDashboard(afterModeB, '2026-12');
    expect(decProj.budgets.find((b) => b.id === source.id)!.monthlyLimitCents).toBe(
      source.monthlyLimitCents
    );
    expect(decProj.obligations.ingRolloverCreditCents).toBe(0);
  });

  it('listet im WhatsApp-Report alle Restbudgets (inkl. Überziehung) und blendet Tagesgeld-Anteil B aus sobald vollständig bezahlt', () => {
    let state = createDefaultAppStateV3();
    state.sinkingFundItems = [
      { id: 'sf-1', name: 'Kfz', amountCents: 10_000, interval: 'MONTHLY' }, // 50% B = 5.000 Cent
    ];
    state.transactions = [
      {
        id: 'food-1',
        timestamp: Date.UTC(2026, 10, 5, 12),
        date: '2026-11-05',
        cents: 7_840,
        type: 'EXPENSE_SHARED',
        budgetId: 'budget-groceries',
        paymentMethod: 'GIRO_SHARED',
      },
      {
        id: 'family-over',
        timestamp: Date.UTC(2026, 10, 6, 12),
        date: '2026-11-06',
        cents: 11_500, // 1.500 Cent überzogen bei 10.000 Limit
        type: 'EXPENSE_SHARED',
        budgetId: 'budget-family',
        paymentMethod: 'GIRO_SHARED',
      },
    ];

    const reportOpen = generateWhatsAppReport(state, '2026-11', new Date(Date.UTC(2026, 10, 15)));
    expect(reportOpen).toContain('📊 FlowPilot Status 11/2026');
    expect(reportOpen).toContain('• Offener Tagesgeld-Anteil (50 %): 50,00 €');
    expect(reportOpen).toContain('• Lebensmittel & Markt: noch 361,60 €');
    expect(reportOpen).toContain('• Freizeit & Gemeinsam: 0,00 € (überzogen um 15,00 €)');

    // Partner B zahlt 20,00 € -> noch 30,00 € offen
    state = updateSinkingFundDeposit(state, '2026-11', 'sf-1', { paidByBCents: 2_000 });
    const reportPartial = generateWhatsAppReport(
      state,
      '2026-11',
      new Date(Date.UTC(2026, 10, 15))
    );
    expect(reportPartial).toContain('• Offener Tagesgeld-Anteil (50 %): 30,00 €');

    // Partner B zahlt volle 50,00 € -> keine offene Tagesgeld-Forderung mehr im Report!
    state = updateSinkingFundDeposit(state, '2026-11', 'sf-1', { paidByBCents: 5_000 });
    const reportPaid = generateWhatsAppReport(state, '2026-11', new Date(Date.UTC(2026, 10, 15)));
    expect(reportPaid).not.toContain('Tagesgeld-Anteil');
  });

  it('migriert Legacy-V1- und V2-Daten verlustfrei nach V3 (inkl. EXPENSE_BUFFER -> SPECIAL_TASCHENGELD, localStorage V2 -> V3 und CSV-Export)', () => {
    const legacyV2 = {
      schemaVersion: 2,
      config: {
        warmmieteCents: 88_050,
        wohngeldCents: DEFAULT_WOHNGELD_CENTS,
        operatingCostsCents: 16_500,
        kindergeldCents: DEFAULT_KINDERGELD_CENTS,
        sinkingFundsMonthlyCents: 9_000,
        privateSubscriptionsCents: 2_500,
        ingRolloverCreditCents: 1_000,
      },
      budgets: [{ id: 'b1', name: 'Einkauf', monthlyLimitCents: 35_000, hasWeeklyPacer: true }],
      privateLoans: [
        {
          id: 'l1',
          name: 'Altlast',
          monthlyRateCents: 10_000,
          totalAmountCents: 100_000,
          remainingCents: 60_000,
          isPausedThisMonth: true,
        },
      ],
      payIn30Items: [{ id: 'p1', name: 'Klarna', cents: 3_000, dueDate: '2026-11-20' }],
      transactions: [
        {
          id: 'tx1',
          timestamp: Date.UTC(2026, 10, 5, 12),
          cents: 15_025,
          type: 'INCOME_TIP',
          note: 'Schicht',
        },
        {
          id: 'tx-buf',
          timestamp: Date.UTC(2026, 10, 6, 12),
          cents: 4_000,
          type: 'EXPENSE_BUFFER',
          paymentMethod: 'CASH_A',
          note: 'Alt-Puffer',
        },
        {
          id: 'tx-food',
          timestamp: Date.UTC(2026, 10, 7, 12),
          cents: 2_250,
          type: 'EXPENSE_SHARED',
          budgetId: 'b1',
          paymentMethod: 'GIRO_SHARED',
          note: 'Rewe',
        },
      ],
    };

    const migrated = migrateStateToV3(legacyV2, '2026-11');
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.sinkingFundItems).toHaveLength(1);
    expect(migrated.sinkingFundItems[0].amountCents).toBe(9_000);
    expect(migrated.privateSubscriptionItems).toHaveLength(1);
    expect(migrated.privateSubscriptionItems[0].monthlyCents).toBe(2_500);
    expect(migrated.monthlyData['2026-11']?.ingRolloverCreditCents).toBe(1_000);
    expect(migrated.privateLoans[0].monthlyRecords['2026-11']?.status).toBe('PAUSED');

    const migratedBuf = migrated.transactions.find((t) => t.id === 'tx-buf')!;
    expect(migratedBuf.type).toBe('EXPENSE_SHARED');
    if (migratedBuf.type === 'EXPENSE_SHARED') {
      expect(migratedBuf.budgetId).toBe(SPECIAL_TASCHENGELD_BUDGET_ID);
    }

    // CSV-Export inkl. UTF-8 BOM, Budget-Name und Taschengeld (50:50)
    const csv = buildTransactionsCsvWithBom(migrated);
    expect(csv.startsWith('\uFEFFDatum;Typ;Kategorie;Betrag_EUR;Zahlungsweg;Zuordnung;Notiz')).toBe(
      true
    );
    expect(csv).toContain('Alltag: Einkauf');
    expect(csv).toContain('Gemeinsam: Taschengeld (50:50)');
    expect(csv).toContain('150,25');

    // Automatische Migration aus localStorage Key V2 -> V3
    const storeMap = new Map<string, string>();
    storeMap.set(STORAGE_KEY_V2, JSON.stringify(legacyV2));
    const mockStorage = {
      getItem: (k: string) => storeMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storeMap.set(k, v);
      },
      removeItem: (k: string) => {
        storeMap.delete(k);
      },
      clear: () => storeMap.clear(),
      key: (idx: number) => Array.from(storeMap.keys())[idx] ?? null,
      get length() {
        return storeMap.size;
      },
    } as Storage;

    const loaded = loadAppStateFromStorage(mockStorage);
    expect(loaded.schemaVersion).toBe(3);
    expect(storeMap.has(STORAGE_KEY_V3)).toBe(true);

    // Auch Legacy-V1 (Euro-Floats, nebenkosten + sonstigeFixkosten, loans.paused) wird verlustfrei migriert
    const legacyV1 = {
      schemaVersion: 1,
      warmmiete: 880.5,
      nebenkosten: 120,
      sonstigeFixkosten: 45,
      sinkingFunds: 90,
      budgets: [{ id: 'b1', name: 'Einkauf', monthlyLimit: 350, hasWeeklyPacer: true }],
      loans: [
        {
          id: 'l1',
          name: 'Altlast',
          monthlyRate: 100,
          totalAmount: 1000,
          remainingAmount: 600,
          paused: true,
        },
      ],
      transactions: [
        { id: 'tx1', timestamp: Date.UTC(2026, 10, 5, 12), amount: 150.25, type: 'TIP', note: 'Schicht' },
      ],
    };
    const migratedV1 = migrateStateToV3(legacyV1, '2026-11');
    expect(migratedV1.schemaVersion).toBe(3);
    expect(migratedV1.config.warmmieteCents).toBe(88_050);
    expect(migratedV1.config.wohngeldCents).toBe(DEFAULT_WOHNGELD_CENTS);
    expect(migratedV1.config.operatingCostsCents).toBe(16_500);
    expect(migratedV1.sinkingFundItems[0].amountCents).toBe(9_000);
    expect(migratedV1.budgets[0].monthlyLimitCents).toBe(35_000);
    expect(migratedV1.privateLoans[0].monthlyRecords['2026-11']?.status).toBe('PAUSED');
    expect(migratedV1.transactions[0].cents).toBe(15_025);
    expect(migratedV1.transactions[0].type).toBe('INCOME_TIP');
  });
});

describe('7. Property-Based Invarianz-Test (100 zufällige Mehrmonats-Sequenzen)', () => {
  function createSeededRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('erfüllt in 100 zufälligen Buchungs-, Einzahlungs- und Mehrmonats-Sequenzen nach jedem Schritt die Liquiditäts-Erhaltungsgleichung', () => {
    const paymentMethods: PaymentMethod[] = [
      'CASH_A',
      'CASH_B',
      'GIRO_SHARED',
      'GIRO_PRIVATE_A',
    ];
    const months = ['2026-09', '2026-10', '2026-11'];

    for (let run = 1; run <= 100; run++) {
      const rng = createSeededRng(run * 1337 + 42);
      const randInt = (min: number, max: number): number =>
        Math.floor(rng() * (max - min + 1)) + min;

      const state: AppStateV3 = {
        schemaVersion: 3,
        config: {
          warmmieteCents: randInt(30_000, 140_000),
          wohngeldCents: randInt(0, 60_000),
          operatingCostsCents: randInt(5_000, 35_000),
          kindergeldCents: randInt(0, 40_000),
        },
        sinkingFundItems: [
          {
            id: 'sf-1',
            name: 'Kfz',
            amountCents: randInt(0, 120_000),
            interval: 'ANNUAL',
          },
          {
            id: 'sf-2',
            name: 'GEZ',
            amountCents: randInt(0, 20_000),
            interval: 'QUARTERLY',
          },
        ],
        privateSubscriptionItems: [
          { id: 'sub-1', name: 'Handy', monthlyCents: randInt(0, 8_000) },
        ],
        customObligations: [
          {
            id: 'co-1',
            name: 'Custom Shared',
            monthlyCents: randInt(0, 10_000),
            scope: 'SHARED_50_50',
          },
          {
            id: 'co-2',
            name: 'Custom Private',
            monthlyCents: randInt(0, 8_000),
            scope: 'PRIVATE_A',
          },
        ],
        budgets: [
          {
            id: 'b-1',
            name: 'Lebensmittel',
            monthlyLimitCents: randInt(10_000, 50_000),
            icon: 'ShoppingCart',
            color: 'emerald',
            hasWeeklyPacer: true,
          },
          {
            id: 'b-2',
            name: 'Baby',
            monthlyLimitCents: randInt(10_000, 35_000),
            icon: 'Baby',
            color: 'amber',
          },
        ],
        privateLoans: [
          {
            id: 'l-1',
            name: 'Darlehen 1',
            monthlyRateCents: randInt(2_000, 20_000),
            totalAmountCents: 200_000,
            remainingCents: randInt(0, 150_000),
            monthlyRecords:
              rng() > 0.6
                ? { '2026-10': { status: 'PAUSED' } }
                : rng() > 0.3
                  ? { '2026-09': { status: 'PAID', paidCents: randInt(2_000, 15_000) } }
                  : {},
          },
        ],
        payIn30Items: [
          {
            id: 'p-1',
            name: 'PayIn30',
            cents: randInt(0, 15_000),
            dueDate: '2026-10-20',
            ...(rng() > 0.5 ? { paidYearMonth: '2026-10' } : {}),
          },
        ],
        monthlyData: {
          '2026-10': {
            ingRolloverCreditCents: randInt(0, 3_000),
          },
        },
        transactions: [],
      };

      const stepCount = randInt(15, 35);
      let seqOffset = 0;

      for (let step = 0; step < stepCount; step++) {
        seqOffset += randInt(10_000, 3_600_000);
        const ym = months[randInt(0, months.length - 1)];
        const day = String(randInt(1, 28)).padStart(2, '0');
        const date = `${ym}-${day}`;
        const timestamp = Date.parse(`${date}T12:00:00Z`) + seqOffset;
        const roll = rng();
        const cents = randInt(1, 60_000); // inkl. ungerader Cent-Beträge

        let tx: Transaction;
        if (roll < 0.22) {
          tx = { id: `tx-${run}-${step}`, timestamp, date, cents, type: 'INCOME_SALARY' };
        } else if (roll < 0.48) {
          tx = { id: `tx-${run}-${step}`, timestamp, date, cents, type: 'INCOME_TIP' };
        } else if (roll < 0.62) {
          tx = { id: `tx-${run}-${step}`, timestamp, date, cents, type: 'DEPOSIT_CONFIRMED' };
        } else if (roll < 0.76) {
          tx = { id: `tx-${run}-${step}`, timestamp, date, cents, type: 'EXPENSE_PRIVATE_A' };
        } else if (roll < 0.88) {
          tx = {
            id: `tx-${run}-${step}`,
            timestamp,
            date,
            cents,
            type: 'EXPENSE_SHARED',
            budgetId: SPECIAL_TASCHENGELD_BUDGET_ID,
            paymentMethod: paymentMethods[randInt(0, paymentMethods.length - 1)],
            markedForCashClearing: rng() > 0.5,
          };
        } else {
          tx = {
            id: `tx-${run}-${step}`,
            timestamp,
            date,
            cents,
            type: 'EXPENSE_SHARED',
            budgetId: state.budgets[randInt(0, state.budgets.length - 1)].id,
            paymentMethod: paymentMethods[randInt(0, paymentMethods.length - 1)],
            markedForCashClearing: rng() > 0.5,
          };
        }

        state.transactions.push(tx);

        // Prüfe Invariante nach JEDER EINZELNEN Buchung für den betroffenen Monat sowie den Zielmonat 2026-11
        for (const checkYm of ym === '2026-11' ? ['2026-11'] : [ym, '2026-11']) {
          const dashboard = projectDashboard(state, checkYm, timestamp);
          const { liquidity, obligations } = dashboard;

          expect(Number.isSafeInteger(obligations.gesamtPflichtlastACents)).toBe(true);
          expect(liquidity.invariants.allIntegersValid).toBe(true);
          expect(liquidity.invariants.liquidityConservation).toBe(true);
          expect(liquidity.invariants.nonNegativityValid).toBe(true);
          expect(liquidity.invariants.valid).toBe(true);

          // Exakte Liquiditäts-Erhaltungsgleichung (Abschnitt 3.3):
          expect(
            liquidity.carryoverFromPrevMonthCents +
              liquidity.gehaltCents +
              liquidity.erfasstesTrinkgeldCents
          ).toBe(
            liquidity.gesamtPflichtlastACents -
              liquidity.ungedecktesPflichtSollCents +
              liquidity.freiesTaschengeldCents +
              liquidity.reinePrivatausgabenACents +
              liquidity.sharedTaschengeldAnteilACents
          );

          // Nicht-Negativitäts-Garantien
          expect(liquidity.bargeldReserviertBankCents).toBeGreaterThanOrEqual(0);
          expect(liquidity.eingezahltesBargeldCents).toBeGreaterThanOrEqual(0);
          expect(liquidity.ungedecktesPflichtSollCents).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
