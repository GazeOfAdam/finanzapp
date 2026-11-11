import { formatCentsToEuro } from './finance';
import {
  AppStateV2,
  createDefaultAppStateV2,
  migrateStateToV2,
  PaymentMethod,
  Transaction,
} from './model';

export const STORAGE_KEY_V2 = 'flowpilot_partner_a_state_v2';
export const LEGACY_STORAGE_KEYS = [
  'flowpilot_partner_a_state_v1',
  'flowpilot_state_v1',
  'flowpilot_state',
];

/**
 * Lädt den Anwendungszustand aus localStorage.
 * Führt bei Vorhandensein eines V1-Schemas automatisch eine verlustfreie Migration auf V2 durch.
 */
export function loadAppStateFromStorage(storage: Storage | undefined = getBrowserStorage()): AppStateV2 {
  if (!storage) {
    return createDefaultAppStateV2();
  }

  try {
    const rawV2 = storage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as unknown;
      const migrated = migrateStateToV2(parsed);
      return migrated;
    }

    // Prüfe auf Legacy V1 Keys und migriere automatisch
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const rawLegacy = storage.getItem(legacyKey);
      if (rawLegacy) {
        const parsedLegacy = JSON.parse(rawLegacy) as unknown;
        const migratedState = migrateStateToV2(parsedLegacy);
        saveAppStateToStorage(migratedState, storage);
        return migratedState;
      }
    }
  } catch (err) {
    console.error('[FlowPilot Storage] Fehler beim Laden/Migrieren aus localStorage:', err);
  }

  const initial = createDefaultAppStateV2();
  saveAppStateToStorage(initial, storage);
  return initial;
}

/**
 * Atomare Persistenz des AppStateV2 in localStorage.
 */
export function saveAppStateToStorage(
  state: AppStateV2,
  storage: Storage | undefined = getBrowserStorage()
): boolean {
  if (!storage) {
    return false;
  }

  try {
    const normalized = migrateStateToV2(state);
    const serialized = JSON.stringify(normalized);
    storage.setItem(STORAGE_KEY_V2, serialized);
    return true;
  } catch (err) {
    console.error('[FlowPilot Storage] Fehler beim Speichern in localStorage:', err);
    return false;
  }
}

/**
 * Setzt den Zustand in localStorage auf die Werkseinstellungen (V2 Defaults) zurück.
 */
export function resetAppStateInStorage(
  storage: Storage | undefined = getBrowserStorage()
): AppStateV2 {
  const defaults = createDefaultAppStateV2();
  saveAppStateToStorage(defaults, storage);
  return defaults;
}

function getBrowserStorage(): Storage | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function formatPaymentMethodLabel(method?: PaymentMethod): string {
  switch (method) {
    case 'CASH_A':
      return 'Bargeld Partner A';
    case 'CASH_B':
      return 'Bargeld Partner B';
    case 'GIRO_SHARED':
      return 'Gemeinschaftskonto Giro';
    case 'GIRO_PRIVATE_A':
      return 'Privatkonto Giro A';
    default:
      return '-';
  }
}

function sanitizeCsvCell(value: string): string {
  const cleaned = value.replace(/\r?\n|\r/g, ' ').replace(/;/g, ',').trim();
  if (cleaned.includes('"')) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }
  return cleaned;
}

function formatTransactionRow(tx: Transaction, state: AppStateV2): string {
  const dateObj = new Date(tx.timestamp);
  const isoDate = Number.isNaN(dateObj.getTime())
    ? '1970-01-01'
    : dateObj.toISOString().slice(0, 10);

  const amountEur = formatCentsToEuro(tx.cents, false);

  let typLabel = '';
  let kategorieLabel = '';
  let zahlungswegLabel = '';
  let zuordnungLabel = '';

  switch (tx.type) {
    case 'INCOME_SALARY': {
      typLabel = 'INCOME_SALARY';
      kategorieLabel = 'Gehalt';
      zahlungswegLabel = 'Privatkonto Giro A';
      zuordnungLabel = 'Pflichtdeckung Partner A';
      break;
    }
    case 'INCOME_TIP': {
      typLabel = 'INCOME_TIP';
      kategorieLabel = 'Schicht-Trinkgeld';
      zahlungswegLabel = 'Bargeld Partner A';
      zuordnungLabel = 'Trinkgeld-Waterfall';
      break;
    }
    case 'DEPOSIT_CONFIRMED': {
      typLabel = 'DEPOSIT_CONFIRMED';
      kategorieLabel = 'Bankeinzahlung';
      zahlungswegLabel = 'Bargeld -> Bankkonto';
      zuordnungLabel = 'Transfer BargeldReserviertBank';
      break;
    }
    case 'EXPENSE_PRIVATE_A': {
      typLabel = 'EXPENSE_PRIVATE_A';
      kategorieLabel = tx.category || 'Privatausgabe';
      zahlungswegLabel = 'Bargeld / Privat A';
      zuordnungLabel = 'Privat Partner A (100%)';
      break;
    }
    case 'EXPENSE_SHARED': {
      const budget = state.budgets.find((b) => b.id === tx.budgetId);
      typLabel = 'EXPENSE_SHARED';
      kategorieLabel = budget ? budget.name : tx.budgetId;
      zahlungswegLabel = formatPaymentMethodLabel(tx.paymentMethod);
      zuordnungLabel = tx.markedForCashClearing
        ? 'Gemeinschaftlich 50:50 (Barkauf-Verrechnung)'
        : 'Gemeinschaftlich 50:50';
      break;
    }
    case 'EXPENSE_BUFFER': {
      typLabel = 'EXPENSE_BUFFER';
      kategorieLabel = 'Gemeinschaftlich: Puffer';
      zahlungswegLabel = formatPaymentMethodLabel(tx.paymentMethod);
      zuordnungLabel = 'Dynamischer 2x-Puffer (50% Taschengeld A)';
      break;
    }
  }

  const noteText = tx.note ?? '';

  return [
    sanitizeCsvCell(isoDate),
    sanitizeCsvCell(typLabel),
    sanitizeCsvCell(kategorieLabel),
    sanitizeCsvCell(amountEur),
    sanitizeCsvCell(zahlungswegLabel),
    sanitizeCsvCell(zuordnungLabel),
    sanitizeCsvCell(noteText),
  ].join(';');
}

/**
 * Erzeugt den CSV-Inhalt inklusive UTF-8-BOM (\uFEFF) und Semikolon-Trennung:
 * Header: Datum;Typ;Kategorie;Betrag_EUR;Zahlungsweg;Zuordnung;Notiz
 */
export function buildTransactionsCsvWithBom(state: AppStateV2): string {
  const header = 'Datum;Typ;Kategorie;Betrag_EUR;Zahlungsweg;Zuordnung;Notiz';
  const sortedTransactions = [...state.transactions].sort((a, b) => b.timestamp - a.timestamp);
  const rows = sortedTransactions.map((tx) => formatTransactionRow(tx, state));
  return `\uFEFF${[header, ...rows].join('\r\n')}`;
}

/**
 * Löst den clientseitigen Download der Transaktionen als CSV-Datei via Blob aus.
 */
export function downloadTransactionsCsv(state: AppStateV2, filename?: string): void {
  const csvContent = buildTransactionsCsvWithBom(state);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, filename ?? `flowpilot-export-${dateStr}.csv`);
}

/**
 * Exportiert den gesamten AppStateV2 als formatierten JSON-String.
 */
export function buildJsonBackupString(state: AppStateV2): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Löst den clientseitigen Download eines vollständigen JSON-Backups aus.
 */
export function downloadJsonBackup(state: AppStateV2, filename?: string): void {
  const jsonContent = buildJsonBackupString(state);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, filename ?? `flowpilot-backup-v2-${dateStr}.json`);
}

/**
 * Importiert und migriert einen JSON-Backup-String (V1 oder V2) sicher nach AppStateV2.
 */
export function parseAndMigrateJsonBackup(jsonText: string): AppStateV2 {
  const parsed = JSON.parse(jsonText) as unknown;
  return migrateStateToV2(parsed);
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
