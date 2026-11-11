export type PaymentMethod = 'CASH_A' | 'CASH_B' | 'GIRO_SHARED' | 'GIRO_PRIVATE_A';

export type Transaction =
  | { id: string; timestamp: number; cents: number; type: 'INCOME_SALARY'; note?: string }
  | { id: string; timestamp: number; cents: number; type: 'INCOME_TIP'; note?: string }
  | { id: string; timestamp: number; cents: number; type: 'EXPENSE_PRIVATE_A'; category: string; note?: string }
  | {
      id: string;
      timestamp: number;
      cents: number;
      type: 'EXPENSE_SHARED';
      budgetId: string;
      paymentMethod: PaymentMethod;
      markedForCashClearing?: boolean;
      note?: string;
    }
  | { id: string; timestamp: number; cents: number; type: 'EXPENSE_BUFFER'; paymentMethod: PaymentMethod; note?: string }
  | { id: string; timestamp: number; cents: number; type: 'DEPOSIT_CONFIRMED'; note?: string };

export interface BudgetCategory {
  id: string;
  name: string;
  monthlyLimitCents: number;
  icon: string;
  color: string;
  hasWeeklyPacer?: boolean; // Für Lebensmittel/Drogerie: Wochen-Soll vs. Wochen-Ist
}

export interface PrivateLoan {
  id: string;
  name: string;
  monthlyRateCents: number;
  totalAmountCents: number;
  remainingCents: number;
  isPausedThisMonth: boolean; // Pausiert: Rate fällt für aktuellen Monat aus GesamtPflichtlastA; Restschuld bleibt unverändert
}

export interface PayIn30Item {
  id: string;
  name: string;
  cents: number;
  dueDate: string;
}

export interface AppStateV2 {
  schemaVersion: 2;
  config: {
    warmmieteCents: number;
    wohngeldCents: number;
    operatingCostsCents: number;
    kindergeldCents: number;
    sinkingFundsMonthlyCents: number;
    privateSubscriptionsCents?: number;
    ingRolloverCreditCents?: number;
  };
  budgets: BudgetCategory[];
  privateLoans: PrivateLoan[];
  payIn30Items: Array<{ id: string; name: string; cents: number; dueDate: string }>;
  transactions: Transaction[];
}

export const DEFAULT_WOHNGELD_CENTS = 47_000; // 470,00 €
export const DEFAULT_KINDERGELD_CENTS = 25_900; // 259,00 €

export interface SystemInvariantCheckResult {
  valid: boolean;
  invariant1TipConservation: boolean;
  invariant2BufferIdentity: boolean;
  allIntegersValid: boolean;
  details: {
    erfasstesTrinkgeldCents: number;
    bargeldReserviertBankCents: number;
    freiesTaschengeldCents: number;
    privatausgabenCents: number;
    eingezahltesBargeldCents: number;
    verfuegbarerPufferCents: number;
    expectedTrinkgeldSumCents: number;
    expectedBufferCents: number;
  };
}

/**
 * Stellt sicher, dass ein numerischer Wert ein ganzzahliger Cent-Betrag (Integer) ist.
 */
export function toSafeIntegerCents(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return Math.round(fallback);
}

/**
 * Hilfsfunktion für Legacy-V1-Felder, die entweder in Euro (Float/Number) oder bereits in Cent vorliegen.
 */
function resolveLegacyCents(
  obj: Record<string, unknown>,
  centsKey: string,
  euroKey: string,
  fallbackCents: number
): number {
  if (typeof obj[centsKey] === 'number' && Number.isFinite(obj[centsKey] as number)) {
    return Math.max(0, Math.round(obj[centsKey] as number));
  }
  if (typeof obj[euroKey] === 'number' && Number.isFinite(obj[euroKey] as number)) {
    return Math.max(0, Math.round((obj[euroKey] as number) * 100));
  }
  return fallbackCents;
}

export function createDefaultBudgets(): BudgetCategory[] {
  return [
    {
      id: 'budget-groceries',
      name: 'Lebensmittel & Markt',
      monthlyLimitCents: 44_000,
      icon: 'ShoppingCart',
      color: 'emerald',
      hasWeeklyPacer: true,
    },
    {
      id: 'budget-drugstore',
      name: 'Drogerie & Haushalt',
      monthlyLimitCents: 12_000,
      icon: 'Sparkles',
      color: 'cyan',
      hasWeeklyPacer: true,
    },
    {
      id: 'budget-baby',
      name: 'Baby-Budget (Kindergeld)',
      monthlyLimitCents: DEFAULT_KINDERGELD_CENTS,
      icon: 'Baby',
      color: 'amber',
      hasWeeklyPacer: false,
    },
    {
      id: 'budget-mobility',
      name: 'Mobilität & Tanken',
      monthlyLimitCents: 14_000,
      icon: 'Car',
      color: 'sky',
      hasWeeklyPacer: false,
    },
    {
      id: 'budget-family',
      name: 'Freizeit & Gemeinsam',
      monthlyLimitCents: 10_000,
      icon: 'Heart',
      color: 'rose',
      hasWeeklyPacer: false,
    },
  ];
}

export function createDefaultPrivateLoans(): PrivateLoan[] {
  return [
    {
      id: 'loan-car-family',
      name: 'Privatdarlehen Kfz-Anteil',
      monthlyRateCents: 12_000,
      totalAmountCents: 240_000,
      remainingCents: 144_000,
      isPausedThisMonth: false,
    },
    {
      id: 'loan-equipment',
      name: 'Ratenkauf Technik',
      monthlyRateCents: 5_000,
      totalAmountCents: 60_000,
      remainingCents: 35_000,
      isPausedThisMonth: false,
    },
  ];
}

function createRelativeDateISO(offsetDays: number): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays));
  return target.toISOString().slice(0, 10);
}

export function createDefaultPayIn30Items(): PayIn30Item[] {
  return [
    {
      id: 'pay30-baby-clothing',
      name: 'Klarna Baby-Erstausstattung',
      cents: 6_490,
      dueDate: createRelativeDateISO(4),
    },
    {
      id: 'pay30-pharmacy',
      name: 'PayPal Pay-in-30 Apotheke',
      cents: 3_250,
      dueDate: createRelativeDateISO(12),
    },
  ];
}

export function createDefaultTransactions(): Transaction[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  return [
    {
      id: 'tx-salary-initial',
      timestamp: now - 5 * dayMs,
      cents: 52_000,
      type: 'INCOME_SALARY',
      note: 'Gehaltseingang (15. des Monats)',
    },
    {
      id: 'tx-tip-shift-1',
      timestamp: now - 4 * dayMs,
      cents: 14_500,
      type: 'INCOME_TIP',
      note: 'Spätschicht Freitag',
    },
    {
      id: 'tx-tip-shift-2',
      timestamp: now - 3 * dayMs,
      cents: 18_200,
      type: 'INCOME_TIP',
      note: 'Doppelschicht Samstag',
    },
    {
      id: 'tx-deposit-1',
      timestamp: now - 2 * dayMs,
      cents: 20_000,
      type: 'DEPOSIT_CONFIRMED',
      note: 'Einzahlung am Automaten auf Girokonto',
    },
    {
      id: 'tx-tip-shift-3',
      timestamp: now - 1 * dayMs,
      cents: 16_800,
      type: 'INCOME_TIP',
      note: 'Sonntagsschicht',
    },
    {
      id: 'tx-shared-groceries-1',
      timestamp: now - 2 * dayMs,
      cents: 7_840,
      type: 'EXPENSE_SHARED',
      budgetId: 'budget-groceries',
      paymentMethod: 'GIRO_SHARED',
      markedForCashClearing: false,
      note: 'Wocheneinkauf Rewe',
    },
    {
      id: 'tx-shared-clearing-1',
      timestamp: now - 1 * dayMs,
      cents: 4_600,
      type: 'EXPENSE_SHARED',
      budgetId: 'budget-baby',
      paymentMethod: 'CASH_A',
      markedForCashClearing: true,
      note: 'Kleinanzeigen Kinderwagen-Zubehör (Bar ausgelegt A)',
    },
    {
      id: 'tx-private-coffee',
      timestamp: now - 12 * 3_600_000,
      cents: 1_450,
      type: 'EXPENSE_PRIVATE_A',
      category: 'Gastronomie & Snacks',
      note: 'Mittagessen nach Schicht',
    },
  ];
}

export function createDefaultAppStateV2(): AppStateV2 {
  return {
    schemaVersion: 2,
    config: {
      warmmieteCents: 95_000,
      wohngeldCents: DEFAULT_WOHNGELD_CENTS,
      operatingCostsCents: 18_500,
      kindergeldCents: DEFAULT_KINDERGELD_CENTS,
      sinkingFundsMonthlyCents: 9_400,
      privateSubscriptionsCents: 2_900,
      ingRolloverCreditCents: 0,
    },
    budgets: createDefaultBudgets(),
    privateLoans: createDefaultPrivateLoans(),
    payIn30Items: createDefaultPayIn30Items(),
    transactions: createDefaultTransactions(),
  };
}

function isValidPaymentMethod(val: unknown): val is PaymentMethod {
  return (
    val === 'CASH_A' ||
    val === 'CASH_B' ||
    val === 'GIRO_SHARED' ||
    val === 'GIRO_PRIVATE_A'
  );
}

function migrateLegacyTransaction(rawTx: unknown, index: number, defaultBudgetId: string): Transaction | null {
  if (!rawTx || typeof rawTx !== 'object') {
    return null;
  }
  const tx = rawTx as Record<string, unknown>;
  const id = typeof tx.id === 'string' && tx.id.trim().length > 0 ? tx.id : `migrated-tx-${index}-${Date.now()}`;
  const timestamp =
    typeof tx.timestamp === 'number' && Number.isFinite(tx.timestamp)
      ? Math.round(tx.timestamp)
      : typeof tx.date === 'string' && !Number.isNaN(Date.parse(tx.date))
        ? Date.parse(tx.date)
        : Date.now();

  const cents =
    typeof tx.cents === 'number' && Number.isFinite(tx.cents)
      ? Math.max(0, Math.round(tx.cents))
      : typeof tx.amountCents === 'number' && Number.isFinite(tx.amountCents)
        ? Math.max(0, Math.round(tx.amountCents))
        : typeof tx.amount === 'number' && Number.isFinite(tx.amount)
          ? Math.max(0, Math.round(tx.amount * 100))
          : 0;

  const note = typeof tx.note === 'string' && tx.note.trim().length > 0 ? tx.note.trim() : undefined;
  const rawType = typeof tx.type === 'string' ? tx.type.toUpperCase() : '';

  if (rawType === 'INCOME_SALARY' || rawType === 'SALARY' || rawType === 'GEHALT') {
    return { id, timestamp, cents, type: 'INCOME_SALARY', note };
  }
  if (rawType === 'INCOME_TIP' || rawType === 'TIP' || rawType === 'TRINKGELD') {
    return { id, timestamp, cents, type: 'INCOME_TIP', note };
  }
  if (rawType === 'DEPOSIT_CONFIRMED' || rawType === 'CONFIRM_DEPOSIT' || rawType === 'DEPOSIT') {
    return { id, timestamp, cents, type: 'DEPOSIT_CONFIRMED', note };
  }
  if (rawType === 'EXPENSE_BUFFER' || rawType === 'BUFFER' || rawType === 'PUFFER') {
    const paymentMethod: PaymentMethod = isValidPaymentMethod(tx.paymentMethod)
      ? tx.paymentMethod
      : 'CASH_A';
    return { id, timestamp, cents, type: 'EXPENSE_BUFFER', paymentMethod, note };
  }
  if (rawType === 'EXPENSE_SHARED' || rawType === 'SHARED' || rawType === 'BUDGET_EXPENSE') {
    const budgetId =
      typeof tx.budgetId === 'string' && tx.budgetId.trim().length > 0
        ? tx.budgetId
        : defaultBudgetId;
    const paymentMethod: PaymentMethod = isValidPaymentMethod(tx.paymentMethod)
      ? tx.paymentMethod
      : 'GIRO_SHARED';
    const markedForCashClearing = Boolean(tx.markedForCashClearing ?? tx.cashClearing ?? false);
    return {
      id,
      timestamp,
      cents,
      type: 'EXPENSE_SHARED',
      budgetId,
      paymentMethod,
      markedForCashClearing,
      note,
    };
  }
  if (
    rawType === 'EXPENSE_PRIVATE_A' ||
    rawType === 'PRIVATE' ||
    rawType === 'PRIVATE_A' ||
    rawType === 'EXPENSE'
  ) {
    const category =
      typeof tx.category === 'string' && tx.category.trim().length > 0
        ? tx.category.trim()
        : 'Privatausgabe';
    return { id, timestamp, cents, type: 'EXPENSE_PRIVATE_A', category, note };
  }

  return null;
}

/**
 * Deterministische Migration von Schema V1 (oder beliebigen Legacy-Objekten) auf AppStateV2 ohne Datenverlust.
 */
export function migrateStateToV2(raw: unknown): AppStateV2 {
  const defaults = createDefaultAppStateV2();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const root = raw as Record<string, unknown>;
  const rawConfig =
    root.config && typeof root.config === 'object'
      ? (root.config as Record<string, unknown>)
      : root;

  const warmmieteCents = resolveLegacyCents(
    rawConfig,
    'warmmieteCents',
    'warmmiete',
    defaults.config.warmmieteCents
  );
  const wohngeldCents = resolveLegacyCents(
    rawConfig,
    'wohngeldCents',
    'wohngeld',
    DEFAULT_WOHNGELD_CENTS
  );

  // V1 hatte ggf. getrennte Felder nebenkostenCents / sonstigeFixkostenCents
  let operatingCostsCents = defaults.config.operatingCostsCents;
  if (typeof rawConfig.operatingCostsCents === 'number' && Number.isFinite(rawConfig.operatingCostsCents)) {
    operatingCostsCents = Math.max(0, Math.round(rawConfig.operatingCostsCents));
  } else if (typeof rawConfig.operatingCosts === 'number' && Number.isFinite(rawConfig.operatingCosts)) {
    operatingCostsCents = Math.max(0, Math.round(rawConfig.operatingCosts * 100));
  } else if (
    typeof rawConfig.nebenkostenCents === 'number' ||
    typeof rawConfig.sonstigeFixkostenCents === 'number' ||
    typeof rawConfig.nebenkosten === 'number'
  ) {
    const nk = resolveLegacyCents(rawConfig, 'nebenkostenCents', 'nebenkosten', 0);
    const sf = resolveLegacyCents(rawConfig, 'sonstigeFixkostenCents', 'sonstigeFixkosten', 0);
    operatingCostsCents = nk + sf;
  }

  const kindergeldCents = resolveLegacyCents(
    rawConfig,
    'kindergeldCents',
    'kindergeld',
    DEFAULT_KINDERGELD_CENTS
  );
  const sinkingFundsMonthlyCents = resolveLegacyCents(
    rawConfig,
    'sinkingFundsMonthlyCents',
    'sinkingFundsMonthly',
    resolveLegacyCents(rawConfig, 'sinkingFundsCents', 'sinkingFunds', defaults.config.sinkingFundsMonthlyCents)
  );
  const privateSubscriptionsCents = resolveLegacyCents(
    rawConfig,
    'privateSubscriptionsCents',
    'privateSubscriptions',
    raw.hasOwnProperty('schemaVersion') && root.schemaVersion === 2
      ? 0
      : (defaults.config.privateSubscriptionsCents ?? 0)
  );
  const ingRolloverCreditCents = resolveLegacyCents(
    rawConfig,
    'ingRolloverCreditCents',
    'ingRolloverCredit',
    0
  );

  // Budgets migrieren
  const rawBudgets = Array.isArray(root.budgets) ? root.budgets : null;
  const budgets: BudgetCategory[] = rawBudgets
    ? rawBudgets
        .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
        .map((b, idx) => ({
          id: typeof b.id === 'string' && b.id.trim().length > 0 ? b.id : `budget-migrated-${idx}`,
          name: typeof b.name === 'string' && b.name.trim().length > 0 ? b.name.trim() : `Budget ${idx + 1}`,
          monthlyLimitCents: resolveLegacyCents(b, 'monthlyLimitCents', 'monthlyLimit', 10_000),
          icon: typeof b.icon === 'string' && b.icon.trim().length > 0 ? b.icon : 'Wallet',
          color: typeof b.color === 'string' && b.color.trim().length > 0 ? b.color : 'emerald',
          hasWeeklyPacer: Boolean(b.hasWeeklyPacer ?? false),
        }))
    : defaults.budgets;

  const fallbackBudgetId = budgets[0]?.id ?? 'budget-groceries';

  // Private Darlehen migrieren (V1 hieß ggf. loans oder privateLoans)
  const rawLoansSource = Array.isArray(root.privateLoans)
    ? root.privateLoans
    : Array.isArray(root.loans)
      ? root.loans
      : null;

  const privateLoans: PrivateLoan[] = rawLoansSource
    ? rawLoansSource
        .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === 'object'))
        .map((l, idx) => {
          const monthlyRateCents = resolveLegacyCents(l, 'monthlyRateCents', 'monthlyRate', 5_000);
          const totalAmountCents = resolveLegacyCents(
            l,
            'totalAmountCents',
            'totalAmount',
            monthlyRateCents * 12
          );
          const remainingCents = resolveLegacyCents(
            l,
            'remainingCents',
            'remainingAmount',
            totalAmountCents
          );
          return {
            id: typeof l.id === 'string' && l.id.trim().length > 0 ? l.id : `loan-migrated-${idx}`,
            name: typeof l.name === 'string' && l.name.trim().length > 0 ? l.name.trim() : `Darlehen ${idx + 1}`,
            monthlyRateCents,
            totalAmountCents,
            remainingCents,
            isPausedThisMonth: Boolean(l.isPausedThisMonth ?? l.paused ?? false),
          };
        })
    : defaults.privateLoans;

  // Pay-in-30 migrieren (V1 hieß ggf. payIn30 oder payIn30Items)
  const rawPayIn30Source = Array.isArray(root.payIn30Items)
    ? root.payIn30Items
    : Array.isArray(root.payIn30)
      ? root.payIn30
      : null;

  const payIn30Items: PayIn30Item[] = rawPayIn30Source
    ? rawPayIn30Source
        .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
        .map((p, idx) => ({
          id: typeof p.id === 'string' && p.id.trim().length > 0 ? p.id : `pay30-migrated-${idx}`,
          name: typeof p.name === 'string' && p.name.trim().length > 0 ? p.name.trim() : `Pay-in-30 #${idx + 1}`,
          cents: resolveLegacyCents(p, 'cents', 'amount', 0),
          dueDate:
            typeof p.dueDate === 'string' && p.dueDate.trim().length > 0
              ? p.dueDate.trim()
              : createRelativeDateISO(7),
        }))
    : defaults.payIn30Items;

  // Transaktionen migrieren
  const rawTransactions = Array.isArray(root.transactions) ? root.transactions : null;
  const transactions: Transaction[] = rawTransactions
    ? rawTransactions
        .map((t, idx) => migrateLegacyTransaction(t, idx, fallbackBudgetId))
        .filter((t): t is Transaction => t !== null)
    : defaults.transactions;

  return {
    schemaVersion: 2,
    config: {
      warmmieteCents,
      wohngeldCents,
      operatingCostsCents,
      kindergeldCents,
      sinkingFundsMonthlyCents,
      privateSubscriptionsCents,
      ingRolloverCreditCents,
    },
    budgets,
    privateLoans,
    payIn30Items,
    transactions,
  };
}
