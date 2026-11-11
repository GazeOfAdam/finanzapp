import { describe, expect, it } from 'vitest';
import {
  calculateObligationBreakdown,
  formatCentsToEuro,
  formatCentsToInputString,
  generateWhatsAppReport,
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
} from './finance';
import {
  AppStateV2,
  createDefaultAppStateV2,
  DEFAULT_KINDERGELD_CENTS,
  DEFAULT_WOHNGELD_CENTS,
  migrateStateToV2,
  PaymentMethod,
  Transaction,
} from './model';
import { buildTransactionsCsvWithBom } from './storage';

describe('1. Cent-Arithmetik, Parser & 50:50-Splits', () => {
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

  it('berechnet gerade und ungerade 50:50-Splits deterministisch via Math.round ohne Nachkommastellen', () => {
    expect(split5050Cents(100)).toBe(50);
    expect(split5050Cents(101)).toBe(51); // Math.round(50.5) === 51
    expect(split5050Cents(1)).toBe(1);
    expect(split5050Cents(0)).toBe(0);
    expect(Number.isSafeInteger(split5050Cents(99_999))).toBe(true);
    expect(split5050Cents(99_999)).toBe(50_000);
  });
});

describe('2. Entflechtete 5-Stufen-Pflichtlast (Formel-Vertrag)', () => {
  it('berechnet alle 5 Stufen deterministisch mit Standardwerten (Wohngeld 47.000 Cent, Kindergeld 25.900 Cent)', () => {
    const state: AppStateV2 = {
      schemaVersion: 2,
      config: {
        warmmieteCents: 97_000, // 970,00 €
        wohngeldCents: DEFAULT_WOHNGELD_CENTS, // 47.000 Cent
        operatingCostsCents: 15_000, // 150,00 €
        kindergeldCents: DEFAULT_KINDERGELD_CENTS, // 25.900 Cent
        sinkingFundsMonthlyCents: 10_000, // 100,00 €
        privateSubscriptionsCents: 3_000, // 30,00 €
      },
      budgets: [
        {
          id: 'b-baby',
          name: 'Baby-Budget',
          monthlyLimitCents: 25_900, // 1:1 durch Kindergeld gedeckt
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
          isPausedThisMonth: false,
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
      transactions: [],
    };

    const result = calculateObligationBreakdown(state);

    // Stufe 1: MAX(0, 97.000 - 47.000) + 15.000 = 50.000 + 15.000 = 65.000
    expect(result.stufe1NettoWohnenCents).toBe(65_000);

    // Stufe 2: MAX(0, (25.900 + 40.000) - 25.900) = 40.000
    expect(result.stufe2NettoAlltagCents).toBe(40_000);

    // Stufe 3: 10.000
    expect(result.stufe3GemeinsameRuecklagenCents).toBe(10_000);

    // Stufe 4: Math.round((65.000 + 40.000 + 10.000) * 0.5) = Math.round(115.000 * 0.5) = 57.500
    expect(result.stufe4GemeinschaftsanteilACents).toBe(57_500);

    // Stufe 5: 12.000 (Darlehen) + 3.000 (Abos) + 5.000 (Pay-in-30) = 20.000
    expect(result.stufe5PrivatePflichtACents).toBe(20_000);

    // GesamtPflichtlastA = 57.500 + 20.000 = 77.500
    expect(result.gesamtPflichtlastACents).toBe(77_500);
  });

  it('behandelt Randfälle korrekt: Wohngeld > Warmmiete sowie Kindergeld > Alltagsbudgets', () => {
    const edgeState: AppStateV2 = {
      schemaVersion: 2,
      config: {
        warmmieteCents: 40_000, // Kleiner als Wohngeld (47.000)
        wohngeldCents: DEFAULT_WOHNGELD_CENTS,
        operatingCostsCents: 12_000,
        kindergeldCents: DEFAULT_KINDERGELD_CENTS, // 25.900 Cent
        sinkingFundsMonthlyCents: 5_001, // Ungerade für 50:50 Rundungstest
        privateSubscriptionsCents: 0,
      },
      budgets: [
        {
          id: 'b-small',
          name: 'Mini-Budget',
          monthlyLimitCents: 15_000, // Kleiner als Kindergeld (25.900)
          icon: 'Wallet',
          color: 'emerald',
        },
      ],
      privateLoans: [],
      payIn30Items: [],
      transactions: [],
    };

    const result = calculateObligationBreakdown(edgeState);

    // Warmmiete - Wohngeld ist negativ -> MAX(0, -7000) = 0 + 12.000 = 12.000
    expect(result.stufe1NettoWohnenCents).toBe(12_000);

    // Alltagsbudgets (15.000) - Kindergeld (25.900) ist negativ -> MAX(0, -10.900) = 0
    expect(result.stufe2NettoAlltagCents).toBe(0);

    // Gemeinsame Rücklagen = 5.001
    expect(result.stufe3GemeinsameRuecklagenCents).toBe(5_001);

    // Summe = 17.001 -> 50% mit Math.round(17001 * 0.5) = 8.501
    expect(result.stufe4GemeinschaftsanteilACents).toBe(8_501);
    expect(result.gesamtPflichtlastACents).toBe(8_501);
  });
});

describe('3. Trinkgeld-Waterfall, Einzahlungs-Zustandsautomat & 2x-Puffer', () => {
  const pflichtlastACents = 80_000; // 800,00 €

  it('durchläuft die Waterfall-Kaskade vor und nach Pflichtdeckung sowie bei Einzahlungen und Puffer-Ausgaben', () => {
    const transactions: Transaction[] = [
      // 1. Gehaltseingang 500,00 € -> Pflichtlücke = 300,00 € (30.000 Cent)
      { id: 't1', timestamp: 1000, cents: 50_000, type: 'INCOME_SALARY' },
      // 2. Erstes Schicht-Trinkgeld 180,00 € -> Noch unter Pflichtlücke (300 €)
      { id: 't2', timestamp: 2000, cents: 18_000, type: 'INCOME_TIP' },
    ];

    const step1 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step1.pflichtLueckeVorEinzahlungCents).toBe(30_000);
    expect(step1.bargeldReserviertBankCents).toBe(18_000);
    expect(step1.freiesTaschengeldCents).toBe(0);
    expect(step1.verfuegbarerPufferCents).toBe(0);
    expect(step1.ungedecktesPflichtSollCents).toBe(12_000);
    expect(step1.ampelStatus).toBe('RED');
    expect(step1.invariants.valid).toBe(true);

    // 3. Zweites Trinkgeld 220,00 € -> Gesamtes Trinkgeld = 400,00 € (40.000 Cent)
    // Pflichtlücke (30.000) ist nun komplett durch BargeldReserviertBank (30.000) gedeckt!
    // Überschuss (10.000 Cent = 100,00 €) fließt ins freie Taschengeld; Puffer = 20.000 Cent.
    transactions.push({ id: 't3', timestamp: 3000, cents: 22_000, type: 'INCOME_TIP' });
    const step2 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step2.bargeldReserviertBankCents).toBe(30_000);
    expect(step2.ungedecktesPflichtSollCents).toBe(0);
    expect(step2.freiesTaschengeldCents).toBe(10_000);
    expect(step2.verfuegbarerPufferCents).toBe(20_000);
    expect(step2.ampelStatus).toBe('YELLOW'); // Bargeld reserviert, noch nicht eingezahlt
    expect(step2.invariants.valid).toBe(true);

    // 4. Einzahlung bestätigen (DEPOSIT_CONFIRMED über 30.000 Cent)
    // BargeldReserviertBank sinkt auf 0, EingezahltesBargeld steigt auf 30.000, Ampel wird GRÜN!
    transactions.push({ id: 't4', timestamp: 4000, cents: 30_000, type: 'DEPOSIT_CONFIRMED' });
    const step3 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step3.bargeldReserviertBankCents).toBe(0);
    expect(step3.eingezahltesBargeldCents).toBe(30_000);
    expect(step3.pflichtLueckeNachEinzahlungCents).toBe(0);
    expect(step3.ampelStatus).toBe('GREEN');
    expect(step3.freiesTaschengeldCents).toBe(10_000);
    expect(step3.verfuegbarerPufferCents).toBe(20_000);
    expect(step3.invariants.valid).toBe(true);

    // 5. Reine Privatausgabe A (2.500 Cent = 25,00 €)
    // Freies Taschengeld sinkt auf 7.500 Cent, Puffer sinkt sofort auf 15.000 Cent (2 × 7.500)
    transactions.push({
      id: 't5',
      timestamp: 5000,
      cents: 2_500,
      type: 'EXPENSE_PRIVATE_A',
      category: 'Freizeit',
    });
    const step4 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step4.freiesTaschengeldCents).toBe(7_500);
    expect(step4.verfuegbarerPufferCents).toBe(15_000);
    expect(step4.invariants.valid).toBe(true);

    // 6. Ausgabe auf "Gemeinschaftlich: Puffer" (4.000 Cent = 40,00 €)
    // 50%-Anteil von A (2.000 Cent) mindert direkt das freie Taschengeld auf 5.500 Cent;
    // Verfügbarer Puffer passt sich konsistent auf 11.000 Cent (2 × 5.500) an!
    transactions.push({
      id: 't6',
      timestamp: 6000,
      cents: 4_000,
      type: 'EXPENSE_BUFFER',
      paymentMethod: 'CASH_A',
    });
    const step5 = projectLiquidityAndWaterfall(pflichtlastACents, transactions);
    expect(step5.bufferAnteilACents).toBe(2_000);
    expect(step5.freiesTaschengeldCents).toBe(5_500);
    expect(step5.verfuegbarerPufferCents).toBe(11_000);
    expect(step5.invariants.valid).toBe(true);
  });
});

describe('4. Darlehens-Pausierung („Diesen Monat aussetzen“)', () => {
  it('senkt sofort die monatliche Pflichtlast, lässt aber die Basisschuld (remainingCents) exakt unverändert', () => {
    const initialState = createDefaultAppStateV2();
    const targetLoan = initialState.privateLoans[0];
    expect(targetLoan).toBeDefined();
    expect(targetLoan.isPausedThisMonth).toBe(false);

    const beforeBreakdown = calculateObligationBreakdown(initialState);
    const pausedState = togglePrivateLoanPause(initialState, targetLoan.id);
    const pausedLoan = pausedState.privateLoans.find((l) => l.id === targetLoan.id)!;

    expect(pausedLoan.isPausedThisMonth).toBe(true);
    // Basisschuld / Restschuld bleibt unverändert!
    expect(pausedLoan.remainingCents).toBe(targetLoan.remainingCents);
    expect(pausedLoan.totalAmountCents).toBe(targetLoan.totalAmountCents);

    const afterBreakdown = calculateObligationBreakdown(pausedState);
    expect(afterBreakdown.gesamtPflichtlastACents).toBe(
      beforeBreakdown.gesamtPflichtlastACents - targetLoan.monthlyRateCents
    );
    expect(afterBreakdown.totalLoanRemainingDebtCents).toBe(
      beforeBreakdown.totalLoanRemainingDebtCents
    );
    expect(afterBreakdown.pausedLoansMonthlyReliefCents).toBe(targetLoan.monthlyRateCents);
  });
});

describe('5. Kleinanzeigen-Verrechnung, Rollover, Pay-in-30, WhatsApp & Migration', () => {
  it('berechnet den Netto-Saldo für markedForCashClearing und gleicht offene Posten per 1-Klick aus', () => {
    const state = createDefaultAppStateV2();
    state.transactions = [
      {
        id: 'c1',
        timestamp: 1000,
        cents: 6_000, // A legt 60 € bar aus -> B schuldet A 30 € (3.000 Cent)
        type: 'EXPENSE_SHARED',
        budgetId: state.budgets[0].id,
        paymentMethod: 'CASH_A',
        markedForCashClearing: true,
      },
      {
        id: 'c2',
        timestamp: 2000,
        cents: 2_000, // B legt 20 € bar aus -> A schuldet B 10 € (1.000 Cent)
        type: 'EXPENSE_SHARED',
        budgetId: state.budgets[0].id,
        paymentMethod: 'CASH_B',
        markedForCashClearing: true,
      },
    ];

    const clearing = projectCashClearing(state.transactions);
    expect(clearing.claimAFromBCents).toBe(3_000);
    expect(clearing.claimBFromACents).toBe(1_000);
    expect(clearing.netBalanceACents).toBe(2_000); // Netto: B schuldet A 20,00 €

    const settledState = settleOpenCashClearing(state);
    const afterClearing = projectCashClearing(settledState.transactions);
    expect(afterClearing.netBalanceACents).toBe(0);
    expect(afterClearing.openTransactions).toHaveLength(0);
  });

  it('unterstützt Budget-Rollover Modus A (ING Tagesgeld senkt GemeinsameRuecklagen) und Modus B (Reallokation)', () => {
    const state = createDefaultAppStateV2();
    state.transactions = []; // Voller Überschuss in allen Budgets
    const sourceBudget = state.budgets[0];
    const targetBudget = state.budgets[1];

    const beforeObligations = calculateObligationBreakdown(state);
    const afterModeA = rolloverBudgetToIngTagesgeld(state, sourceBudget.id, 4_000);
    const afterModeAObligations = calculateObligationBreakdown(afterModeA);

    expect(afterModeAObligations.stufe3GemeinsameRuecklagenCents).toBe(
      beforeObligations.stufe3GemeinsameRuecklagenCents - 4_000
    );

    const afterModeB = reallocateBudgetSurplus(
      afterModeA,
      sourceBudget.id,
      targetBudget.id,
      5_000
    );
    const updatedSource = afterModeB.budgets.find((b) => b.id === sourceBudget.id)!;
    const updatedTarget = afterModeB.budgets.find((b) => b.id === targetBudget.id)!;

    expect(updatedSource.monthlyLimitCents).toBe(sourceBudget.monthlyLimitCents - 4_000 - 5_000);
    expect(updatedTarget.monthlyLimitCents).toBe(targetBudget.monthlyLimitCents + 5_000);
  });

  it('klassifiziert Pay-in-30 Fälligkeiten exakt in Grün (>7d), Gelb (1-7d) und Rot (<=0d)', () => {
    const refTime = Date.UTC(2026, 10, 10); // 2026-11-10
    const items = [
      { id: '1', name: 'Überfällig', cents: 1000, dueDate: '2026-11-10' }, // 0 Tage -> RED
      { id: '2', name: 'Bald fällig', cents: 2000, dueDate: '2026-11-15' }, // 5 Tage -> YELLOW
      { id: '3', name: 'Entspannt', cents: 3000, dueDate: '2026-11-25' }, // 15 Tage -> GREEN
    ];

    const projected = projectPayIn30Items(items, refTime);
    expect(projected.find((i) => i.id === '1')?.ampelStatus).toBe('RED');
    expect(projected.find((i) => i.id === '2')?.ampelStatus).toBe('YELLOW');
    expect(projected.find((i) => i.id === '3')?.ampelStatus).toBe('GREEN');
  });

  it('migriert Legacy-V1-Daten verlustfrei nach V2 und generiert validen CSV-Export mit UTF-8-BOM sowie WhatsApp-Report', () => {
    const legacyV1 = {
      schemaVersion: 1,
      warmmiete: 880.5, // Euro Float in V1
      nebenkosten: 120,
      sonstigeFixkosten: 45,
      sinkingFunds: 90,
      budgets: [{ id: 'b1', name: 'Einkauf', monthlyLimit: 350, hasWeeklyPacer: true }],
      loans: [{ id: 'l1', name: 'Altlast', monthlyRate: 100, totalAmount: 1000, remainingAmount: 600, paused: true }],
      transactions: [{ id: 'tx1', timestamp: 1700000000000, amount: 150.25, type: 'TIP', note: 'Schicht' }],
    };

    const migrated = migrateStateToV2(legacyV1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.config.warmmieteCents).toBe(88_050);
    expect(migrated.config.wohngeldCents).toBe(DEFAULT_WOHNGELD_CENTS);
    expect(migrated.config.operatingCostsCents).toBe(16_500);
    expect(migrated.budgets[0].monthlyLimitCents).toBe(35_000);
    expect(migrated.privateLoans[0].isPausedThisMonth).toBe(true);
    expect(migrated.transactions[0].cents).toBe(15_025);
    expect(migrated.transactions[0].type).toBe('INCOME_TIP');

    const csv = buildTransactionsCsvWithBom(migrated);
    expect(csv.startsWith('\uFEFFDatum;Typ;Kategorie;Betrag_EUR;Zahlungsweg;Zuordnung;Notiz')).toBe(
      true
    );
    expect(csv).toContain('150,25');

    const report = generateWhatsAppReport(migrated, new Date(Date.UTC(2026, 10, 15)));
    expect(report).toContain('📊 FlowPilot Status 11/2026');
    expect(report).toContain('• Gemeinsame Ausgaben:');
    expect(report).toContain('• Dein Anteil (50 %):');
    expect(report).toContain('• Barausgleich:');
    expect(report).toContain('• Rücklagen ING:');
  });
});

describe('6. Property-Based Invarianz-Test (100 zufällige Buchungs- und Einzahlungssequenzen)', () => {
  // Deterministischer Pseudo-Zufallsgenerator (Mulberry32) für reproduzierbare, harte Property-Tests
  function createSeededRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('verletzt in 100 zufälligen Buchungs- und Einzahlungssequenzen zu keinem Zeitpunkt Invariante 1 oder Invariante 2', () => {
    const paymentMethods: PaymentMethod[] = [
      'CASH_A',
      'CASH_B',
      'GIRO_SHARED',
      'GIRO_PRIVATE_A',
    ];

    for (let run = 1; run <= 100; run++) {
      const rng = createSeededRng(run * 1337 + 42);
      const randInt = (min: number, max: number): number =>
        Math.floor(rng() * (max - min + 1)) + min;

      const state: AppStateV2 = {
        schemaVersion: 2,
        config: {
          warmmieteCents: randInt(30_000, 160_000),
          wohngeldCents: randInt(0, 70_000),
          operatingCostsCents: randInt(5_000, 40_000),
          kindergeldCents: randInt(0, 50_000),
          sinkingFundsMonthlyCents: randInt(0, 30_000),
          privateSubscriptionsCents: randInt(0, 10_000),
          ingRolloverCreditCents: randInt(0, 5_000),
        },
        budgets: [
          {
            id: 'b-1',
            name: 'Lebensmittel',
            monthlyLimitCents: randInt(10_000, 60_000),
            icon: 'ShoppingCart',
            color: 'emerald',
            hasWeeklyPacer: true,
          },
          {
            id: 'b-2',
            name: 'Baby',
            monthlyLimitCents: randInt(10_000, 40_000),
            icon: 'Baby',
            color: 'amber',
          },
        ],
        privateLoans: [
          {
            id: 'l-1',
            name: 'Darlehen 1',
            monthlyRateCents: randInt(2_000, 25_000),
            totalAmountCents: 200_000,
            remainingCents: randInt(0, 150_000),
            isPausedThisMonth: rng() > 0.5,
          },
        ],
        payIn30Items: [
          {
            id: 'p-1',
            name: 'PayIn30',
            cents: randInt(0, 15_000),
            dueDate: '2026-11-20',
          },
        ],
        transactions: [],
      };

      const stepCount = randInt(15, 45);
      let currentTimestamp = 1_700_000_000_000;

      for (let step = 0; step < stepCount; step++) {
        currentTimestamp += randInt(1_000, 86_400_000);
        const roll = rng();
        const cents = randInt(1, 35_000); // Inklusive ungerader Cent-Beträge!

        let tx: Transaction;
        if (roll < 0.15) {
          tx = { id: `tx-${run}-${step}`, timestamp: currentTimestamp, cents, type: 'INCOME_SALARY' };
        } else if (roll < 0.48) {
          tx = { id: `tx-${run}-${step}`, timestamp: currentTimestamp, cents, type: 'INCOME_TIP' };
        } else if (roll < 0.65) {
          tx = {
            id: `tx-${run}-${step}`,
            timestamp: currentTimestamp,
            cents,
            type: 'DEPOSIT_CONFIRMED',
          };
        } else if (roll < 0.8) {
          tx = {
            id: `tx-${run}-${step}`,
            timestamp: currentTimestamp,
            cents,
            type: 'EXPENSE_PRIVATE_A',
            category: 'Privat',
          };
        } else if (roll < 0.92) {
          tx = {
            id: `tx-${run}-${step}`,
            timestamp: currentTimestamp,
            cents,
            type: 'EXPENSE_BUFFER',
            paymentMethod: paymentMethods[randInt(0, paymentMethods.length - 1)],
          };
        } else {
          tx = {
            id: `tx-${run}-${step}`,
            timestamp: currentTimestamp,
            cents,
            type: 'EXPENSE_SHARED',
            budgetId: state.budgets[randInt(0, state.budgets.length - 1)].id,
            paymentMethod: paymentMethods[randInt(0, paymentMethods.length - 1)],
            markedForCashClearing: rng() > 0.5,
          };
        }

        state.transactions.push(tx);

        // Prüfe Invarianten nach JEDER EINZELNEN Buchung innerhalb der Sequenz!
        const dashboard = projectDashboard(state, currentTimestamp);
        const { liquidity, obligations } = dashboard;

        expect(Number.isSafeInteger(obligations.gesamtPflichtlastACents)).toBe(true);
        expect(liquidity.invariants.allIntegersValid).toBe(true);

        // Invariant 1: Erfasstes Trinkgeld = Reserviertes Bargeld + Freies Taschengeld + Privatausgaben + Eingezahltes Bargeld
        expect(liquidity.invariants.invariant1TipConservation).toBe(true);
        expect(liquidity.erfasstesTrinkgeldCents).toBe(
          liquidity.bargeldReserviertBankCents +
            liquidity.freiesTaschengeldCents +
            liquidity.privatausgabenGesamtACents +
            liquidity.eingezahltesBargeldCents
        );

        // Invariant 2: VerfuegbarerPuffer = 2 * FreiesTaschengeld
        expect(liquidity.invariants.invariant2BufferIdentity).toBe(true);
        expect(liquidity.verfuegbarerPufferCents).toBe(2 * liquidity.freiesTaschengeldCents);

        // Nicht-Negativitäts-Garantien für Reservierung & Einzahlung
        expect(liquidity.bargeldReserviertBankCents).toBeGreaterThanOrEqual(0);
        expect(liquidity.eingezahltesBargeldCents).toBeGreaterThanOrEqual(0);
        expect(liquidity.ungedecktesPflichtSollCents).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
