import { formatCentsToEuro } from './finance';
import {
  AppStateV3,
  createDefaultAppStateV3,
  getTransactionDateISO,
  migrateStateToV3,
  PaymentMethod,
  SPECIAL_TASCHENGELD_BUDGET_ID,
  Transaction,
} from './model';

export const STORAGE_KEY_V3 = 'flowpilot_partner_a_state_v3';
export const STORAGE_KEY_V2 = 'flowpilot_partner_a_state_v2';
export const LEGACY_STORAGE_KEYS = [
  STORAGE_KEY_V2,
  'flowpilot_partner_a_state_v1',
  'flowpilot_state_v1',
  'flowpilot_state',
];

/**
 * Lädt den Anwendungszustand aus localStorage.
 * Führt bei Vorhandensein eines V1- oder V2-Schemas automatisch eine verlustfreie Migration auf V3 durch.
 */
export function loadAppStateFromStorage(
  storage: Storage | undefined = getBrowserStorage()
): AppStateV3 {
  if (!storage) {
    return createDefaultAppStateV3();
  }

  try {
    const rawV3 = storage.getItem(STORAGE_KEY_V3);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as unknown;
      return migrateStateToV3(parsed);
    }

    // Prüfe auf Legacy V2 / V1 Keys und migriere automatisch
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const rawLegacy = storage.getItem(legacyKey);
      if (rawLegacy) {
        const parsedLegacy = JSON.parse(rawLegacy) as unknown;
        const migratedState = migrateStateToV3(parsedLegacy);
        saveAppStateToStorage(migratedState, storage);
        return migratedState;
      }
    }
  } catch (err) {
    console.error('[FlowPilot Storage] Fehler beim Laden/Migrieren aus localStorage:', err);
  }

  const initial = createDefaultAppStateV3();
  saveAppStateToStorage(initial, storage);
  return initial;
}

/**
 * Atomare Persistenz des AppStateV3 in localStorage.
 */
export function saveAppStateToStorage(
  state: AppStateV3,
  storage: Storage | undefined = getBrowserStorage()
): boolean {
  if (!storage) {
    return false;
  }

  try {
    const normalized = migrateStateToV3(state);
    const serialized = JSON.stringify(normalized);
    storage.setItem(STORAGE_KEY_V3, serialized);
    return true;
  } catch (err) {
    console.error('[FlowPilot Storage] Fehler beim Speichern in localStorage:', err);
    return false;
  }
}

/**
 * Setzt den Zustand in localStorage auf die Werkseinstellungen (V3 Defaults) zurück.
 */
export function resetAppStateInStorage(
  storage: Storage | undefined = getBrowserStorage()
): AppStateV3 {
  const defaults = createDefaultAppStateV3();
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

function formatTransactionRow(tx: Transaction, state: AppStateV3): string {
  const isoDate = getTransactionDateISO(tx);
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
      zuordnungLabel = 'Pflichtdeckung & Taschengeld A';
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
      kategorieLabel = tx.category || 'Privat A';
      zahlungswegLabel = 'Bargeld / Privat A';
      zuordnungLabel = 'Privat Partner A (100%)';
      break;
    }
    case 'EXPENSE_SHARED': {
      typLabel = 'EXPENSE_SHARED';
      zahlungswegLabel = formatPaymentMethodLabel(tx.paymentMethod);
      if (tx.budgetId === SPECIAL_TASCHENGELD_BUDGET_ID) {
        kategorieLabel = 'Gemeinsam: Taschengeld (50:50)';
        zuordnungLabel = tx.markedForCashClearing
          ? 'Taschengeld 50:50 (Barkauf-Verrechnung)'
          : 'Taschengeld 50:50';
      } else {
        const budget = state.budgets.find((b) => b.id === tx.budgetId);
        kategorieLabel = budget ? `Alltag: ${budget.name}` : tx.budgetId;
        zuordnungLabel = tx.markedForCashClearing
          ? 'Gemeinschaftlich 50:50 (Barkauf-Verrechnung)'
          : 'Gemeinschaftlich 50:50';
      }
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
export function buildTransactionsCsvWithBom(state: AppStateV3): string {
  const header = 'Datum;Typ;Kategorie;Betrag_EUR;Zahlungsweg;Zuordnung;Notiz';
  const sortedTransactions = [...state.transactions].sort((a, b) => {
    const dateCmp = getTransactionDateISO(b).localeCompare(getTransactionDateISO(a));
    return dateCmp !== 0 ? dateCmp : b.timestamp - a.timestamp;
  });
  const rows = sortedTransactions.map((tx) => formatTransactionRow(tx, state));
  return `\uFEFF${[header, ...rows].join('\r\n')}`;
}

/**
 * Löst den clientseitigen Download der Transaktionen als CSV-Datei via Blob aus.
 */
export function downloadTransactionsCsv(state: AppStateV3, filename?: string): void {
  const csvContent = buildTransactionsCsvWithBom(state);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, filename ?? `flowpilot-export-${dateStr}.csv`);
}

/**
 * Exportiert den gesamten AppStateV3 als formatierten JSON-String.
 */
export function buildJsonBackupString(state: AppStateV3): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Löst den clientseitigen Download eines vollständigen JSON-Backups aus.
 */
export function downloadJsonBackup(state: AppStateV3, filename?: string): void {
  const jsonContent = buildJsonBackupString(state);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, filename ?? `flowpilot-backup-v3-${dateStr}.json`);
}

/**
 * Importiert und migriert einen JSON-Backup-String (V1, V2 oder V3) sicher nach AppStateV3.
 */
export function parseAndMigrateJsonBackup(jsonText: string): AppStateV3 {
  const parsed = JSON.parse(jsonText) as unknown;
  return migrateStateToV3(parsed);
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
