
import { loadAppSettings } from "./appSettings";
import { formatCurrency } from "./appLocale";
import { sendBrowserNotification } from "./notifications";

const STORAGE_KEY = "cartsync-spending-ledger";
const EVENT_NAME = "cartsync:ledger-updated";

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `purchase-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLedger() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return [];

    const records = JSON.parse(saved);

    if (!Array.isArray(records)) return [];

    return records.filter(
      (record) =>
        record &&
        typeof record.id === "string" &&
        Number.isFinite(Number(record.amount)) &&
        Number(record.amount) >= 0
    );
  } catch (error) {
    console.error("Unable to read CartSync spending ledger:", error);
    return [];
  }
}

function notifyLedgerChanged() {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function saveLedger(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    notifyLedgerChanged();
    return true;
  } catch (error) {
    console.error("Unable to save CartSync spending ledger:", error);
    throw new Error("Could not save purchase. Check browser storage.");
  }
}

function notifyNewPurchase(transaction, previousRecords, nextRecords) {
  const settings = loadAppSettings();
  if (!settings.purchaseAlerts && !settings.budgetAlerts) return;

  if (settings.purchaseAlerts) {
    sendBrowserNotification(
      "Purchase recorded",
      `${transaction.name}: ${formatCurrency(transaction.amount, settings)}`
    );
  }

  if (!settings.budgetAlerts) return;

  let parentalData = {};
  try {
    parentalData = JSON.parse(localStorage.getItem("cartsync-parental-controls") || "{}");
  } catch {
    parentalData = {};
  }

  const configuredBudget = Number(parentalData.budget ?? 5000);
  const budget = Number.isFinite(configuredBudget) && configuredBudget > 0
    ? configuredBudget
    : 5000;
  const transactionDate = new Date(transaction.date);
  const sumMonth = (records) => records.reduce((sum, record) => {
    const date = new Date(record.date);
    return date.getFullYear() === transactionDate.getFullYear() &&
      date.getMonth() === transactionDate.getMonth()
      ? sum + Number(record.amount || 0)
      : sum;
  }, 0);

  const previousUtilization = (sumMonth(previousRecords) / budget) * 100;
  const currentUtilization = (sumMonth(nextRecords) / budget) * 100;
  const crossedThreshold = [70, 90, 100].filter(
    (threshold) => previousUtilization < threshold && currentUtilization >= threshold
  ).at(-1);

  if (crossedThreshold) {
    sendBrowserNotification(
      crossedThreshold >= 100 ? "Budget exceeded" : "Budget warning",
      `${crossedThreshold}% of the monthly budget has been used.`
    );
  }
}

/**
 * Get all confirmed purchases.
 */
export function getTransactions() {
  return readLedger();
}

/**
 * Record one completed purchase.
 * Amounts are stored in INR with two decimal places.
 */
export function addTransaction({
  name,
  amount,
  category = "Groceries",
  date = new Date().toISOString(),
  source = "manual",
  items = [],
  memberAllocations = [],
  invoice = null,
  id = createId(),
}) {
  const cleanName = String(name || "").trim();
  const numericAmount = Number(amount);

  if (!cleanName) {
    throw new Error("Purchase name is required.");
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Purchase amount must be greater than zero.");
  }

  if (!Number.isFinite(new Date(date).getTime())) {
    throw new Error("Purchase date is invalid.");
  }

  const transaction = {
    id,
    name: cleanName,
    amount: Math.round(numericAmount * 100) / 100,
    category: String(category || "Other"),
    date,
    source,
    items: Array.isArray(items) ? items : [],
    memberAllocations: Array.isArray(memberAllocations)
      ? memberAllocations
      : [],
    ...(invoice && typeof invoice === "object"
      ? {
          invoice: {
            storeName: String(invoice.storeName || "").trim() || null,
            invoiceNumber: String(invoice.invoiceNumber || "").trim() || null,
            invoiceDate: String(invoice.invoiceDate || "").trim() || null,
            paymentMethod: String(invoice.paymentMethod || "").trim() || null,
          }
        }
      : {}),
    createdAt: new Date().toISOString(),
  };

  const records = readLedger();

  records.unshift(transaction);
  saveLedger(records);
  notifyNewPurchase(transaction, records.slice(1), records);

  return transaction;
}

/**
 * Update an existing purchase.
 */
export function updateTransaction(id, updates) {
  const records = readLedger();
  const index = records.findIndex((record) => record.id === id);

  if (index === -1) {
    throw new Error("Purchase not found.");
  }

  const updated = {
    ...records[index],
    ...updates,
    id: records[index].id,
  };

  if (
    !String(updated.name || "").trim() ||
    !Number.isFinite(Number(updated.amount)) ||
    Number(updated.amount) <= 0
  ) {
    throw new Error("Enter a valid purchase name and amount.");
  }

  updated.name = String(updated.name).trim();
  updated.amount = Math.round(Number(updated.amount) * 100) / 100;

  records[index] = updated;
  saveLedger(records);

  return updated;
}

/**
 * Delete a purchase.
 */
export function deleteTransaction(id) {
  const records = readLedger();
  const updated = records.filter((record) => record.id !== id);

  if (updated.length === records.length) {
    throw new Error("Purchase not found.");
  }

  saveLedger(updated);
  return true;
}

/**
 * Subscribe to same-tab and other-tab ledger changes.
 */
export function subscribeToLedger(callback) {
  const handleUpdate = () => callback(readLedger());

  window.addEventListener(EVENT_NAME, handleUpdate);
  window.addEventListener("storage", handleStorage);

  function handleStorage(event) {
    if (event.key === STORAGE_KEY) {
      handleUpdate();
    }
  }

  return () => {
    window.removeEventListener(EVENT_NAME, handleUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * Calculate spending for a month.
 * Month uses JavaScript's 0-based month index (January = 0).
 */
export function getMonthlySpending(year, month) {
  return readLedger().filter((record) => {
    const date = new Date(record.date);

    return (
      date.getFullYear() === year &&
      date.getMonth() === month
    );
  });
}
