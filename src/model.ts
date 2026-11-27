export const SPECIAL_TASCHENGELD_BUDGET_ID = 'SPECIAL_TASCHENGELD';

export type PaymentMethod = 'CASH_A' | 'CASH_B' | 'GIRO_SHARED' | 'GIRO_PRIVATE_A';

export type Transaction =
  | {
      id: string;
      timestamp: number;
      date?: string; // ISO 'YYYY-MM-DD'
      cents: number;
      type: 'INCOME_SALARY';
      note?: string;
    }
  | {
      id: string;
      timestamp: number;
      date?: string; // ISO 'YYYY-MM-DD'
      cents: number;
      type: 'INCOME_TIP';
      note?: string;
    }
  | {
      id: string;
      timestamp: number;
      date?: string; // ISO 'YYYY-MM-DD'
      cents: number;
      type: 'EXPENSE_PRIVATE_A';
      category?: string;
      note?: string;
    }
  | {
      id: string;
      timestamp: number;
      date?: string; // ISO 'YYYY-MM-DD'
      cents: number;
      type: 'EXPENSE_SHARED';
      budgetId: string; // BudgetCategory.id oder SPECIAL_TASCHENGELD_BUDGET_ID
      paymentMethod: PaymentMethod;
      markedForCashClearing?: boolean;
      note?: string;
    }
  | {
      id: string;
      timestamp: number;
      date?: string; // ISO 'YYYY-MM-DD'
      cents: number;
      type: 'DEPOSIT_CONFIRMED';
      note?: string;
    };

export interface BudgetCategory {
  id: string;
  name: string;
  monthlyLimitCents: number;
  icon: string;
  color: string;
  hasWeeklyPacer?: boolean; // Für Lebensmittel/Drogerie: Wochen-Soll vs. Wochen-Ist
}

export type SinkingFundInterval = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';

export interface SinkingFundItem {
  id: string;
  name: string;
  amountCents: number;
  interval: SinkingFundInterval;
}

export interface PrivateSubscriptionItem {
  id: string;
  name: string;
  monthlyCents: number;
}

export type CustomObligationScope = 'SHARED_50_50' | 'PRIVATE_A';

export interface CustomObligationItem {
  id: string;
  name: string;
  monthlyCents: number;
  scope: CustomObligationScope;
}

export type LoanMonthStatus = 'OPEN' | 'PAID' | 'PAUSED';

export interface LoanMonthRecord {
  status: LoanMonthStatus;
  paidCents?: number; // Bestätigter Betrag bei status === 'PAID'
}

export interface PrivateLoan {
  id: string;
  name: string;
  monthlyRateCents: number;
  totalAmountCents: number;
  remainingCents: number;
  monthlyRecords: Record<string, LoanMonthRecord>; // Key: 'YYYY-MM'
}

export interface PayIn30Item {
  id: string;
  name: string;
  cents: number;
  dueDate: string; // ISO 'YYYY-MM-DD'
  paidYearMonth?: string; // 'YYYY-MM' sobald als bezahlt bestätigt
}

export interface SinkingFundDepositRecord {
  paidByACents: number;
  paidByBCents: number;
}

export interface MonthlyStateData {
  /**
   * Monatliche Budget-Limit-Anpassungen (Deltas in Cent durch Reallokation Modus B / Rollover Modus A).
   */
  budgetLimitAdjustmentsCents?: Record<string, number>;
  /**
   * ING Rollover-Gutschrift (Modus A) für diesen Monat (mindert Stufe 3 in diesem Monat).
   */
  ingRolloverCreditCents?: number;
  /**
   * Tatsächlich im Monat auf das Tagesgeldkonto eingezahlte Beträge pro SinkingFundItem.id.
   */
  sinkingFundDeposits?: Record<string, SinkingFundDepositRecord>;
}

export interface AppStateV3 {
  schemaVersion: 3;
  config: {
    warmmieteCents: number;
    wohngeldCents: number;
    operatingCostsCents: number;
    kindergeldCents: number;
  };
  sinkingFundItems: SinkingFundItem[];
  privateSubscriptionItems: PrivateSubscriptionItem[];
  customObligations: CustomObligationItem[];
  budgets: BudgetCategory[];
  privateLoans: PrivateLoan[];
  payIn30Items: PayIn30Item[];
  monthlyData: Record<string, MonthlyStateData>; // Key: 'YYYY-MM'
  transactions: Transaction[];
}

export const DEFAULT_WOHNGELD_CENTS = 47_000; // 470,00 €
export const DEFAULT_KINDERGELD_CENTS = 25_900; // 259,00 €

export interface SystemInvariantCheckResult {
  valid: boolean;
  liquidityConservation: boolean;
  nonNegativityValid: boolean;
  allIntegersValid: boolean;
  details: {
    carryoverInCents: number;
    gehaltCents: number;
    erfasstesTrinkgeldCents: number;
    totalInflowCents: number;
    coveredPflichtlastACents: number;
    freiesTaschengeldCents: number;
    reinePrivatausgabenACents: number;
    sharedTaschengeldAnteilACents: number;
    totalOutflowAndBalanceCents: number;
  };
}

const GERMAN_MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const GERMAN_MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

export function isValidYearMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
}

export function getLocalTodayISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentYearMonth(date: Date = new Date()): string {
  return getLocalTodayISO(date).slice(0, 7);
}

export function getYearMonthFromTimestampUTC(timestamp: number): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) {
    return getCurrentYearMonth();
  }
  return d.toISOString().slice(0, 7);
}

export function getTransactionDateISO(tx: Pick<Transaction, 'timestamp' | 'date'>): string {
  if (isValidISODate(tx.date)) {
    return tx.date;
  }
  const d = new Date(tx.timestamp);
  if (Number.isNaN(d.getTime())) {
    return getLocalTodayISO();
  }
  return d.toISOString().slice(0, 10);
}

export function getTransactionYearMonth(tx: Pick<Transaction, 'timestamp' | 'date'>): string {
  return getTransactionDateISO(tx).slice(0, 7);
}

export function dateStringToTimestamp(dateStr: string, fallbackMs: number = Date.now()): number {
  if (!isValidISODate(dateStr)) {
    return fallbackMs;
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const y = Number(yearStr);
  const m = Number(monthStr);
  const d = Number(dayStr);
  return Date.UTC(y, m - 1, d, 12, 0, 0, 0);
}

export function getLastDayOfYearMonthISO(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) {
    return getLocalTodayISO();
  }
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  if (!isValidYearMonth(yearMonth)) {
    return getCurrentYearMonth();
  }
  const [yStr, mStr] = yearMonth.split('-');
  const total = Number(yStr) * 12 + (Number(mStr) - 1) + Math.trunc(deltaMonths);
  const newY = Math.floor(total / 12);
  const newM = (((total % 12) + 12) % 12) + 1;
  return `${String(newY).padStart(4, '0')}-${String(newM).padStart(2, '0')}`;
}

export function formatYearMonthLabel(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) {
    return yearMonth;
  }
  const [yStr, mStr] = yearMonth.split('-');
  const monthIdx = Number(mStr) - 1;
  return `${GERMAN_MONTH_NAMES[monthIdx] ?? mStr} ${yStr}`;
}

export function formatYearMonthShort(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) {
    return yearMonth;
  }
  const [yStr, mStr] = yearMonth.split('-');
  const monthIdx = Number(mStr) - 1;
  return `${GERMAN_MONTH_SHORT_NAMES[monthIdx] ?? mStr} ${yStr.slice(2)}`;
}

export function formatISODateGerman(isoDate: string): string {
  if (!isValidISODate(isoDate)) {
    return isoDate;
  }
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Anzahl der Monate je Turnus für Sinking Funds.
 */
export function getMonthsForSinkingFundInterval(interval: SinkingFundInterval): number {
  switch (interval) {
    case 'MONTHLY':
      return 1;
    case 'QUARTERLY':
      return 3;
    case 'SEMI_ANNUAL':
      return 6;
    case 'ANNUAL':
      return 12;
  }
}

/**
 * Berechnet deterministisch in ganzzahligen Cent die monatliche Rücklagenrate für einen Sinking-Fund-Posten.
 */
export function getSinkingFundMonthlyCents(item: Pick<SinkingFundItem, 'amountCents' | 'interval'>): number {
  const safeAmount = Math.max(0, Math.round(item.amountCents));
  const months = getMonthsForSinkingFundInterval(item.interval);
  return Math.round(safeAmount / months);
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
 * Hilfsfunktion für Legacy-V1/V2-Felder, die entweder in Euro (Float/Number) oder bereits in Cent vorliegen.
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

function isValidSinkingFundInterval(val: unknown): val is SinkingFundInterval {
  return val === 'MONTHLY' || val === 'QUARTERLY' || val === 'SEMI_ANNUAL' || val === 'ANNUAL';
}

function isValidCustomObligationScope(val: unknown): val is CustomObligationScope {
  return val === 'SHARED_50_50' || val === 'PRIVATE_A';
}

function isValidLoanMonthStatus(val: unknown): val is LoanMonthStatus {
  return val === 'OPEN' || val === 'PAID' || val === 'PAUSED';
}

export function createDefaultSinkingFundItems(): SinkingFundItem[] {
  return [
    {
      id: 'sf-kfz',
      name: 'Kfz-Versicherung & Steuer',
      amountCents: 54_000, // 540,00 € / Jahr -> 45,00 € / Monat
      interval: 'ANNUAL',
    },
    {
      id: 'sf-gez',
      name: 'Rundfunkbeitrag (GEZ)',
      amountCents: 5_508, // 55,08 € / Quartal -> 18,36 € / Monat
      interval: 'QUARTERLY',
    },
    {
      id: 'sf-hausrat',
      name: 'Hausrat & Haftpflicht',
      amountCents: 18_000, // 180,00 € / Jahr -> 15,00 € / Monat
      interval: 'ANNUAL',
    },
    {
      id: 'sf-reserve',
      name: 'Instandhaltung & Reserve',
      amountCents: 1_564, // 15,64 € / Monat (Gesamtsumme 94,00 €)
      interval: 'MONTHLY',
    },
  ];
}

export function createDefaultPrivateSubscriptionItems(): PrivateSubscriptionItem[] {
  return [
    {
      id: 'sub-mobile',
      name: 'Mobilfunkvertrag',
      monthlyCents: 1_999,
    },
    {
      id: 'sub-streaming',
      name: 'Streaming & Cloud',
      monthlyCents: 901,
    },
  ];
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
      name: 'Privatdarlehen Kfz-Anteil (Partnerin)',
      monthlyRateCents: 12_000,
      totalAmountCents: 240_000,
      remainingCents: 144_000,
      monthlyRecords: {},
    },
    {
      id: 'loan-equipment',
      name: 'Ratenkauf Technik',
      monthlyRateCents: 5_000,
      totalAmountCents: 60_000,
      remainingCents: 35_000,
      monthlyRecords: {},
    },
  ];
}

function createDateInCurrentMonth(dayOffsetFromToday: number, now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const maxDay = new Date(year, month, 0).getDate();
  const targetDay = Math.min(maxDay, Math.max(1, now.getDate() + dayOffsetFromToday));
  return `${year}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function createDefaultPayIn30Items(now: Date = new Date()): PayIn30Item[] {
  return [
    {
      id: 'pay30-baby-clothing',
      name: 'Klarna Baby-Erstausstattung',
      cents: 6_490,
      dueDate: createDateInCurrentMonth(2, now),
    },
    {
      id: 'pay30-pharmacy',
      name: 'PayPal Pay-in-30 Apotheke',
      cents: 3_250,
      dueDate: createDateInCurrentMonth(4, now),
    },
  ];
}

export function createDefaultTransactions(now: Date = new Date()): Transaction[] {
  const mkTxDate = (offsetDays: number, hourOffset = 0) => {
    const date = createDateInCurrentMonth(offsetDays, now);
    const timestamp = dateStringToTimestamp(date) + hourOffset * 3_600_000;
    return { date, timestamp };
  };

  return [
    {
      id: 'tx-salary-initial',
      ...mkTxDate(-5, 0),
      cents: 52_000,
      type: 'INCOME_SALARY',
      note: 'Gehaltseingang (15. des Monats)',
    },
    {
      id: 'tx-tip-shift-1',
      ...mkTxDate(-4, 1),
      cents: 14_500,
      type: 'INCOME_TIP',
      note: 'Spätschicht Freitag',
    },
    {
      id: 'tx-tip-shift-2',
      ...mkTxDate(-3, 2),
      cents: 18_200,
      type: 'INCOME_TIP',
      note: 'Doppelschicht Samstag',
    },
    {
      id: 'tx-deposit-1',
      ...mkTxDate(-2, 3),
      cents: 20_000,
      type: 'DEPOSIT_CONFIRMED',
      note: 'Einzahlung am Automaten auf Girokonto',
    },
    {
      id: 'tx-tip-shift-3',
      ...mkTxDate(-1, 4),
      cents: 16_800,
      type: 'INCOME_TIP',
      note: 'Sonntagsschicht',
    },
    {
      id: 'tx-shared-groceries-1',
      ...mkTxDate(-2, 5),
      cents: 7_840,
      type: 'EXPENSE_SHARED',
      budgetId: 'budget-groceries',
      paymentMethod: 'GIRO_SHARED',
      markedForCashClearing: false,
      note: 'Wocheneinkauf Rewe',
    },
    {
      id: 'tx-shared-clearing-1',
      ...mkTxDate(-1, 6),
      cents: 4_600,
      type: 'EXPENSE_SHARED',
      budgetId: 'budget-baby',
      paymentMethod: 'CASH_A',
      markedForCashClearing: true,
      note: 'Kleinanzeigen Kinderwagen-Zubehör (Bar ausgelegt A)',
    },
    {
      id: 'tx-private-coffee',
      ...mkTxDate(0, 1),
      cents: 1_450,
      type: 'EXPENSE_PRIVATE_A',
      note: 'Mittagessen nach Schicht',
    },
  ];
}

export function createDefaultAppStateV3(now: Date = new Date()): AppStateV3 {
  return {
    schemaVersion: 3,
    config: {
      warmmieteCents: 95_000,
      wohngeldCents: DEFAULT_WOHNGELD_CENTS,
      operatingCostsCents: 18_500,
      kindergeldCents: DEFAULT_KINDERGELD_CENTS,
    },
    sinkingFundItems: createDefaultSinkingFundItems(),
    privateSubscriptionItems: createDefaultPrivateSubscriptionItems(),
    customObligations: [],
    budgets: createDefaultBudgets(),
    privateLoans: createDefaultPrivateLoans(),
    payIn30Items: createDefaultPayIn30Items(now),
    monthlyData: {},
    transactions: createDefaultTransactions(now),
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

function migrateLegacyTransaction(
  rawTx: unknown,
  index: number,
  defaultBudgetId: string
): Transaction | null {
  if (!rawTx || typeof rawTx !== 'object') {
    return null;
  }
  const tx = rawTx as Record<string, unknown>;
  const id =
    typeof tx.id === 'string' && tx.id.trim().length > 0
      ? tx.id
      : `migrated-tx-${index}-${Date.now()}`;

  const date = isValidISODate(tx.date) ? tx.date : undefined;

  const timestamp =
    typeof tx.timestamp === 'number' && Number.isFinite(tx.timestamp)
      ? Math.round(tx.timestamp)
      : date
        ? dateStringToTimestamp(date)
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

  const note =
    typeof tx.note === 'string' && tx.note.trim().length > 0 ? tx.note.trim() : undefined;
  const rawType = typeof tx.type === 'string' ? tx.type.toUpperCase() : '';
  const dateField = date ? { date } : {};

  if (rawType === 'INCOME_SALARY' || rawType === 'SALARY' || rawType === 'GEHALT') {
    return { id, timestamp, ...dateField, cents, type: 'INCOME_SALARY', note };
  }
  if (rawType === 'INCOME_TIP' || rawType === 'TIP' || rawType === 'TRINKGELD') {
    return { id, timestamp, ...dateField, cents, type: 'INCOME_TIP', note };
  }
  if (rawType === 'DEPOSIT_CONFIRMED' || rawType === 'CONFIRM_DEPOSIT' || rawType === 'DEPOSIT') {
    return { id, timestamp, ...dateField, cents, type: 'DEPOSIT_CONFIRMED', note };
  }
  // Legacy EXPENSE_BUFFER -> verlustfrei zu EXPENSE_SHARED mit budgetId: SPECIAL_TASCHENGELD migrieren
  if (rawType === 'EXPENSE_BUFFER' || rawType === 'BUFFER' || rawType === 'PUFFER') {
    const paymentMethod: PaymentMethod = isValidPaymentMethod(tx.paymentMethod)
      ? tx.paymentMethod
      : 'CASH_A';
    const markedForCashClearing = Boolean(tx.markedForCashClearing ?? tx.cashClearing ?? false);
    return {
      id,
      timestamp,
      ...dateField,
      cents,
      type: 'EXPENSE_SHARED',
      budgetId: SPECIAL_TASCHENGELD_BUDGET_ID,
      paymentMethod,
      markedForCashClearing,
      note,
    };
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
      ...dateField,
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
        : undefined;
    return {
      id,
      timestamp,
      ...dateField,
      cents,
      type: 'EXPENSE_PRIVATE_A',
      ...(category ? { category } : {}),
      note,
    };
  }

  return null;
}

/**
 * Deterministische, verlustfreie Migration von Schema V1, V2 oder V3 auf AppStateV3.
 */
export function migrateStateToV3(
  raw: unknown,
  referenceYearMonth: string = getCurrentYearMonth()
): AppStateV3 {
  const defaults = createDefaultAppStateV3();
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
  if (
    typeof rawConfig.operatingCostsCents === 'number' &&
    Number.isFinite(rawConfig.operatingCostsCents)
  ) {
    operatingCostsCents = Math.max(0, Math.round(rawConfig.operatingCostsCents));
  } else if (
    typeof rawConfig.operatingCosts === 'number' &&
    Number.isFinite(rawConfig.operatingCosts)
  ) {
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

  // Sinking Funds migrieren (V3 Array oder Legacy Einzelbetrag)
  let sinkingFundItems: SinkingFundItem[];
  if (Array.isArray(root.sinkingFundItems)) {
    sinkingFundItems = root.sinkingFundItems
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item, idx) => ({
        id:
          typeof item.id === 'string' && item.id.trim().length > 0
            ? item.id
            : `sf-migrated-${idx}`,
        name:
          typeof item.name === 'string' && item.name.trim().length > 0
            ? item.name.trim()
            : `Rücklage ${idx + 1}`,
        amountCents: resolveLegacyCents(item, 'amountCents', 'amount', 0),
        interval: isValidSinkingFundInterval(item.interval) ? item.interval : 'MONTHLY',
      }));
  } else {
    const hasLegacySf =
      typeof rawConfig.sinkingFundsMonthlyCents === 'number' ||
      typeof rawConfig.sinkingFundsMonthly === 'number' ||
      typeof rawConfig.sinkingFundsCents === 'number' ||
      typeof rawConfig.sinkingFunds === 'number';
    if (hasLegacySf) {
      const legacySfCents = resolveLegacyCents(
        rawConfig,
        'sinkingFundsMonthlyCents',
        'sinkingFundsMonthly',
        resolveLegacyCents(rawConfig, 'sinkingFundsCents', 'sinkingFunds', 0)
      );
      sinkingFundItems =
        legacySfCents > 0
          ? [
              {
                id: 'sf-migrated-legacy',
                name: 'Tagesgeld-Rücklagen (migriert)',
                amountCents: legacySfCents,
                interval: 'MONTHLY',
              },
            ]
          : [];
    } else {
      sinkingFundItems = defaults.sinkingFundItems;
    }
  }

  // Private Abos migrieren (V3 Array oder Legacy Einzelbetrag)
  let privateSubscriptionItems: PrivateSubscriptionItem[];
  if (Array.isArray(root.privateSubscriptionItems)) {
    privateSubscriptionItems = root.privateSubscriptionItems
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item, idx) => ({
        id:
          typeof item.id === 'string' && item.id.trim().length > 0
            ? item.id
            : `sub-migrated-${idx}`,
        name:
          typeof item.name === 'string' && item.name.trim().length > 0
            ? item.name.trim()
            : `Abo ${idx + 1}`,
        monthlyCents: resolveLegacyCents(item, 'monthlyCents', 'monthlyAmount', 0),
      }));
  } else {
    const hasLegacySub =
      typeof rawConfig.privateSubscriptionsCents === 'number' ||
      typeof rawConfig.privateSubscriptions === 'number';
    if (hasLegacySub) {
      const legacySubCents = resolveLegacyCents(
        rawConfig,
        'privateSubscriptionsCents',
        'privateSubscriptions',
        0
      );
      privateSubscriptionItems =
        legacySubCents > 0
          ? [
              {
                id: 'sub-migrated-legacy',
                name: 'Private Abos (migriert)',
                monthlyCents: legacySubCents,
              },
            ]
          : [];
    } else if (root.schemaVersion === 2 || root.schemaVersion === 1) {
      privateSubscriptionItems = [];
    } else {
      privateSubscriptionItems = defaults.privateSubscriptionItems;
    }
  }

  // Eigene Pflichtlast-Posten migrieren
  const customObligations: CustomObligationItem[] = Array.isArray(root.customObligations)
    ? root.customObligations
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item, idx) => ({
          id:
            typeof item.id === 'string' && item.id.trim().length > 0
              ? item.id
              : `custom-obl-${idx}`,
          name:
            typeof item.name === 'string' && item.name.trim().length > 0
              ? item.name.trim()
              : `Pflichtlast ${idx + 1}`,
          monthlyCents: resolveLegacyCents(item, 'monthlyCents', 'amount', 0),
          scope: isValidCustomObligationScope(item.scope) ? item.scope : 'SHARED_50_50',
        }))
    : [];

  // Budgets migrieren
  const rawBudgets = Array.isArray(root.budgets) ? root.budgets : null;
  const budgets: BudgetCategory[] = rawBudgets
    ? rawBudgets
        .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
        .map((b, idx) => ({
          id:
            typeof b.id === 'string' && b.id.trim().length > 0 ? b.id : `budget-migrated-${idx}`,
          name:
            typeof b.name === 'string' && b.name.trim().length > 0
              ? b.name.trim()
              : `Budget ${idx + 1}`,
          monthlyLimitCents: resolveLegacyCents(b, 'monthlyLimitCents', 'monthlyLimit', 10_000),
          icon: typeof b.icon === 'string' && b.icon.trim().length > 0 ? b.icon : 'Wallet',
          color: typeof b.color === 'string' && b.color.trim().length > 0 ? b.color : 'emerald',
          hasWeeklyPacer: Boolean(b.hasWeeklyPacer ?? false),
        }))
    : defaults.budgets;

  const fallbackBudgetId = budgets[0]?.id ?? 'budget-groceries';

  // Private Darlehen migrieren (V1 hieß ggf. loans, V2 hatte isPausedThisMonth)
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

          const monthlyRecords: Record<string, LoanMonthRecord> = {};
          if (l.monthlyRecords && typeof l.monthlyRecords === 'object') {
            for (const [ym, rec] of Object.entries(l.monthlyRecords as Record<string, unknown>)) {
              if (!isValidYearMonth(ym) || !rec || typeof rec !== 'object') {
                continue;
              }
              const recObj = rec as Record<string, unknown>;
              if (isValidLoanMonthStatus(recObj.status)) {
                const entry: LoanMonthRecord = { status: recObj.status };
                if (
                  recObj.status === 'PAID' &&
                  typeof recObj.paidCents === 'number' &&
                  Number.isFinite(recObj.paidCents)
                ) {
                  entry.paidCents = Math.max(0, Math.round(recObj.paidCents));
                }
                monthlyRecords[ym] = entry;
              }
            }
          }

          // Legacy V1/V2 isPausedThisMonth / paused -> in aktuellen Monat migrieren
          const legacyPaused = Boolean(l.isPausedThisMonth ?? l.paused ?? false);
          if (legacyPaused && isValidYearMonth(referenceYearMonth) && !monthlyRecords[referenceYearMonth]) {
            monthlyRecords[referenceYearMonth] = { status: 'PAUSED' };
          }

          return {
            id:
              typeof l.id === 'string' && l.id.trim().length > 0 ? l.id : `loan-migrated-${idx}`,
            name:
              typeof l.name === 'string' && l.name.trim().length > 0
                ? l.name.trim()
                : `Darlehen ${idx + 1}`,
            monthlyRateCents,
            totalAmountCents,
            remainingCents,
            monthlyRecords,
          };
        })
    : defaults.privateLoans;

  // Pay-in-30 migrieren
  const rawPayIn30Source = Array.isArray(root.payIn30Items)
    ? root.payIn30Items
    : Array.isArray(root.payIn30)
      ? root.payIn30
      : null;

  const payIn30Items: PayIn30Item[] = rawPayIn30Source
    ? rawPayIn30Source
        .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
        .map((p, idx) => {
          const paidYearMonth = isValidYearMonth(p.paidYearMonth) ? p.paidYearMonth : undefined;
          return {
            id:
              typeof p.id === 'string' && p.id.trim().length > 0
                ? p.id
                : `pay30-migrated-${idx}`,
            name:
              typeof p.name === 'string' && p.name.trim().length > 0
                ? p.name.trim()
                : `Pay-in-30 #${idx + 1}`,
            cents: resolveLegacyCents(p, 'cents', 'amount', 0),
            dueDate:
              typeof p.dueDate === 'string' && p.dueDate.trim().length > 0
                ? p.dueDate.trim()
                : getLocalTodayISO(),
            ...(paidYearMonth ? { paidYearMonth } : {}),
          };
        })
    : defaults.payIn30Items;

  // Monatsdaten migrieren
  const monthlyData: Record<string, MonthlyStateData> = {};
  if (root.monthlyData && typeof root.monthlyData === 'object') {
    for (const [ym, rawMonth] of Object.entries(root.monthlyData as Record<string, unknown>)) {
      if (!isValidYearMonth(ym) || !rawMonth || typeof rawMonth !== 'object') {
        continue;
      }
      const mObj = rawMonth as Record<string, unknown>;
      const entry: MonthlyStateData = {};

      if (mObj.budgetLimitAdjustmentsCents && typeof mObj.budgetLimitAdjustmentsCents === 'object') {
        const adj: Record<string, number> = {};
        for (const [bId, delta] of Object.entries(
          mObj.budgetLimitAdjustmentsCents as Record<string, unknown>
        )) {
          if (typeof delta === 'number' && Number.isFinite(delta) && Math.round(delta) !== 0) {
            adj[bId] = Math.round(delta);
          }
        }
        if (Object.keys(adj).length > 0) {
          entry.budgetLimitAdjustmentsCents = adj;
        }
      }

      if (
        typeof mObj.ingRolloverCreditCents === 'number' &&
        Number.isFinite(mObj.ingRolloverCreditCents) &&
        Math.round(mObj.ingRolloverCreditCents) > 0
      ) {
        entry.ingRolloverCreditCents = Math.max(0, Math.round(mObj.ingRolloverCreditCents));
      }

      if (mObj.sinkingFundDeposits && typeof mObj.sinkingFundDeposits === 'object') {
        const deposits: Record<string, SinkingFundDepositRecord> = {};
        for (const [sfId, dep] of Object.entries(
          mObj.sinkingFundDeposits as Record<string, unknown>
        )) {
          if (dep && typeof dep === 'object') {
            const depObj = dep as Record<string, unknown>;
            const paidByACents =
              typeof depObj.paidByACents === 'number' && Number.isFinite(depObj.paidByACents)
                ? Math.max(0, Math.round(depObj.paidByACents))
                : 0;
            const paidByBCents =
              typeof depObj.paidByBCents === 'number' && Number.isFinite(depObj.paidByBCents)
                ? Math.max(0, Math.round(depObj.paidByBCents))
                : 0;
            if (paidByACents > 0 || paidByBCents > 0) {
              deposits[sfId] = { paidByACents, paidByBCents };
            }
          }
        }
        if (Object.keys(deposits).length > 0) {
          entry.sinkingFundDeposits = deposits;
        }
      }

      if (
        entry.budgetLimitAdjustmentsCents ||
        entry.ingRolloverCreditCents ||
        entry.sinkingFundDeposits
      ) {
        monthlyData[ym] = entry;
      }
    }
  }

  // Legacy ingRolloverCreditCents aus V2-Config übernehmen
  const legacyIngRollover = resolveLegacyCents(
    rawConfig,
    'ingRolloverCreditCents',
    'ingRolloverCredit',
    0
  );
  if (
    legacyIngRollover > 0 &&
    isValidYearMonth(referenceYearMonth) &&
    !monthlyData[referenceYearMonth]?.ingRolloverCreditCents
  ) {
    monthlyData[referenceYearMonth] = {
      ...monthlyData[referenceYearMonth],
      ingRolloverCreditCents: legacyIngRollover,
    };
  }

  // Transaktionen migrieren
  const rawTransactions = Array.isArray(root.transactions) ? root.transactions : null;
  const transactions: Transaction[] = rawTransactions
    ? rawTransactions
        .map((t, idx) => migrateLegacyTransaction(t, idx, fallbackBudgetId))
        .filter((t): t is Transaction => t !== null)
    : defaults.transactions;

  return {
    schemaVersion: 3,
    config: {
      warmmieteCents,
      wohngeldCents,
      operatingCostsCents,
      kindergeldCents,
    },
    sinkingFundItems,
    privateSubscriptionItems,
    customObligations,
    budgets,
    privateLoans,
    payIn30Items,
    monthlyData,
    transactions,
  };
}
