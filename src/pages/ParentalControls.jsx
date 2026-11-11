
import { useEffect, useMemo, useState } from "react";
import { useAppSettings } from "../services/AppSettingsContext";
import { formatCurrency, formatDate, fromBaseCurrency, toBaseCurrency, translate } from "../services/appLocale";
import { toast } from "sonner";
import { sendBrowserNotification } from "../services/notifications";
import {
  ShieldCheck,
  LockKeyhole,
  Wallet,
  AlertTriangle,
  Plus,
  Trash2,
  ShoppingBag,
  Settings,
  TrendingUp,
  CheckCircle2
} from "lucide-react";

const STORAGE_KEY = "cartsync-parental-controls";

const DEFAULT_CATEGORIES = [
  "Groceries",
  "Snacks",
  "Beverages",
  "Personal Care",
  "Luxury Items",
  "Other"
];

const money = (value) => formatCurrency(value);

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const data = JSON.parse(saved);

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

const initialData = loadData();

export default function ParentalControls() {
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  const [pin, setPin] = useState(initialData?.pin || "");
  const [unlocked, setUnlocked] = useState(false);

  const [pinInput, setPinInput] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showForgotPin, setShowForgotPin] = useState(false);

  const [budget, setBudget] = useState(
    String(initialData?.budget ?? 5000)
  );

  const [restrictedCategories, setRestrictedCategories] = useState(
    initialData?.restrictedCategories ?? ["Snacks", "Luxury Items"]
  );

  const [transactions, setTransactions] = useState(
    Array.isArray(initialData?.transactions)
      ? initialData.transactions
      : []
  );

  const [purchaseName, setPurchaseName] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseCategory, setPurchaseCategory] = useState("Groceries");

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const isError = /must|does not match|enter|incorrect|invalid|unable/i.test(message);
    (isError ? toast.error : toast.success)(translate(message, settings.language));
  }, [message, settings.language]);

  // Persist settings and transactions
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pin,
          budget,
          restrictedCategories,
          transactions
        })
      );
    } catch (error) {
      console.error("Unable to save parental settings:", error);
    }
  }, [pin, budget, restrictedCategories, transactions]);

  // Current month's transactions
  const monthlyTransactions = useMemo(() => {
    const now = new Date();

    return transactions.filter((transaction) => {
      const date = new Date(transaction.date);

      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    });
  }, [transactions]);

  const spent = monthlyTransactions.reduce(
    (total, transaction) => total + transaction.amount,
    0
  );

  const budgetValue = Number(budget);
  const validBudget =
    Number.isFinite(budgetValue) && budgetValue > 0;

  const percentage = validBudget
    ? (spent / budgetValue) * 100
    : 0;

  const remaining = validBudget ? budgetValue - spent : 0;

  const alertLevel =
    percentage >= 100
      ? "Exceeded"
      : percentage >= 90
      ? "Critical"
      : percentage >= 70
      ? "Warning"
      : "Safe";

  // PIN setup
  const setupPin = () => {
    if (!/^\d{4,6}$/.test(pinInput)) {
      setMessage("PIN must contain 4 to 6 digits.");
      return;
    }

    if (pinInput !== confirmPin) {
      setMessage("PIN confirmation does not match.");
      return;
    }

    setPin(pinInput);
    setUnlocked(true);
    setPinInput("");
    setConfirmPin("");
    setMessage("Parent PIN successfully configured.");
  };

  // PIN verification for returning users
  const verifyPin = () => {
    if (!/^\d{4,6}$/.test(pinInput)) {
      setMessage("Enter your 4 to 6 digit parent PIN.");
      setShowForgotPin(false);
      return;
    }

    if (pinInput === pin) {
      setUnlocked(true);
      setPinInput("");
      setMessage("");
      setShowForgotPin(false);
    } else {
      setMessage("Incorrect PIN. Please try again.");
      setPinInput("");
      setShowForgotPin(true);
    }
  };

  // Demo-only recovery: this prototype has no email/OTP identity verification.
  const resetForgottenPin = () => {
    const confirmed = window.confirm(
      "Forgot PIN recovery will remove the current PIN on this browser. " +
      "Anyone with access to this device can perform this demo reset. Continue?"
    );

    if (!confirmed) return;

    setPin("");
    setUnlocked(false);
    setPinInput("");
    setConfirmPin("");
    setShowForgotPin(false);
    setMessage("PIN reset on this device. Create and confirm a new PIN.");
  };

  // Add purchase
  const addPurchase = () => {
    const name = purchaseName.trim();
    const amount = Number(purchaseAmount);

    if (!name || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid purchase name and amount.");
      return;
    }

    const newTransaction = {
      id: crypto.randomUUID(),
      name,
      amount: Math.round(amount * 100) / 100,
      category: purchaseCategory,
      date: new Date().toISOString(),
      restricted: restrictedCategories.includes(purchaseCategory)
    };

    setTransactions((old) => [
      newTransaction,
      ...old
    ]);

    setPurchaseName("");
    setPurchaseAmount("");
    const feedback = newTransaction.restricted
      ? "Purchase recorded. Warning: This category is restricted."
      : "Purchase recorded successfully.";
    setMessage(feedback);
    if (settings.purchaseAlerts) {
      sendBrowserNotification("Purchase recorded", `${name}: ${money(newTransaction.amount)}`);
    }
    if (settings.budgetAlerts && validBudget) {
      const currentSpend = monthlyTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const previousUsage = (currentSpend / budgetValue) * 100;
      const nextUsage = ((currentSpend + newTransaction.amount) / budgetValue) * 100;
      const crossedThreshold = [70, 90, 100].filter((threshold) => previousUsage < threshold && nextUsage >= threshold).at(-1);
      if (crossedThreshold) {
        sendBrowserNotification(
          crossedThreshold >= 100 ? "Budget exceeded" : "Budget warning",
          `${crossedThreshold}% of the monthly budget has been used.`
        );
      }
    }
  };

  // Toggle restricted categories
  const toggleCategory = (category) => {
    setRestrictedCategories((old) =>
      old.includes(category)
        ? old.filter((item) => item !== category)
        : [...old, category]
    );
  };

  // Remove transaction
  const removeTransaction = (id) => {
    setTransactions((old) =>
      old.filter((transaction) => transaction.id !== id)
    );
    setMessage("Transaction removed.");
  };

  // Change PIN
  const changePin = () => {
    if (!/^\d{4,6}$/.test(pinInput)) {
      setMessage("Enter a new PIN containing 4 to 6 digits.");
      return;
    }

    if (pinInput !== confirmPin) {
      setMessage("PIN confirmation does not match.");
      return;
    }

    setPin(pinInput);
    setPinInput("");
    setConfirmPin("");
    setMessage("PIN updated successfully.");
  };

  // PIN setup screen
  if (!pin) {
    return (
      <div className="space-y-6">
        <PageHeading t={t} />

        <section className="bg-white border rounded-2xl p-8 max-w-xl mx-auto">
          <LockKeyhole
            size={42}
            className="mx-auto text-teal-700 mb-4"
          />

          <h2 className="text-xl font-bold text-center">
            Configure Parent PIN
          </h2>

          <p className="text-sm text-slate-500 text-center mt-2 mb-6">
            Create a 4 to 6 digit PIN to access parental settings.
          </p>

          <div className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) =>
                setPinInput(e.target.value.replace(/\D/g, ""))
              }
              placeholder="Create PIN"
              className="w-full border rounded-xl p-3"
            />

            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, ""))
              }
              placeholder="Confirm PIN"
              className="w-full border rounded-xl p-3"
            />

            <button
              onClick={setupPin}
              className="w-full bg-teal-700 text-white rounded-xl p-3 font-medium"
            >
              Set Parent PIN
            </button>

            {message && (
              <p role="alert" className="text-sm text-red-600">
                {message}
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  // Locked screen
  if (!unlocked) {
    return (
      <div className="space-y-6">
        <PageHeading t={t} />

        <section className="bg-white border rounded-2xl p-8 max-w-xl mx-auto">
          <ShieldCheck
            size={45}
            className="mx-auto text-teal-700 mb-4"
          />

          <h2 className="text-xl font-bold text-center">
            Parent Authentication
          </h2>

          <p className="text-sm text-slate-500 text-center mt-2 mb-6">
            Enter your parent PIN to access budget controls.
          </p>

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinInput}
            onChange={(e) =>
              setPinInput(e.target.value.replace(/\\D/g, "").slice(0, 6))
            }
            onKeyDown={(e) => e.key === "Enter" && verifyPin()}
            placeholder="Enter parent PIN"
            autoComplete="off"
            className="w-full border rounded-xl p-3"
          />

          <button
            onClick={verifyPin}
            disabled={pinInput.length < 4}
            className="w-full bg-teal-700 text-white rounded-xl p-3 mt-4 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Verify PIN
          </button>

          {message && (
            <p role="alert" className="text-sm text-red-600 mt-3">
              {message}
            </p>
          )}

          {showForgotPin && (
            <div className="mt-4 border border-amber-200 bg-amber-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-900">
                Forgot your parent PIN?
              </p>
              <p className="text-xs text-amber-800 mt-1">
                This prototype has no email or OTP verification. Resetting
                removes the PIN on this browser and lets you create a new one.
              </p>
              <button
                type="button"
                onClick={resetForgottenPin}
                className="mt-3 text-sm font-semibold text-amber-900 underline underline-offset-2"
              >
                Forgot PIN? Reset and create a new PIN
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <PageHeading t={t} />

      {/* Budget Overview */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <StatCard
          title="Monthly Budget"
          value={money(validBudget ? budgetValue : 0)}
          icon={Wallet}
        />

        <StatCard
          title="Total Spent"
          value={money(spent)}
          icon={ShoppingBag}
        />

        <StatCard
          title="Remaining Budget"
          value={money(remaining)}
          icon={TrendingUp}
        />

      </section>

      {/* Monthly Budget */}
      <section className="bg-white border rounded-2xl p-5">

        <div className="flex items-center gap-2 mb-5">
          <Wallet className="text-teal-700" />
          <h2 className="text-lg font-bold">
            {t("Monthly Budget Settings")}
          </h2>
        </div>

        <label className="block text-sm text-slate-500 mb-2">
            {t("Monthly spending limit")} ({settings.currency})
        </label>

        <div className="flex flex-wrap gap-3">
          <input
            type="number"
            min="1"
            step="0.01"
            value={budget === "" ? "" : fromBaseCurrency(budget, settings)}
            onChange={(e) => setBudget(e.target.value === "" ? "" : String(toBaseCurrency(e.target.value, settings)))}
            className="border rounded-xl p-3 flex-1 min-w-40"
          />
        </div>

        {!validBudget && (
          <p className="text-sm text-red-600 mt-2">
            Enter a valid monthly budget greater than zero.
          </p>
        )}

        {validBudget && (
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">
                Budget Utilization
              </span>
              <span className="font-semibold">
                {percentage.toFixed(1)}%
              </span>
            </div>

            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  percentage >= 100
                    ? "bg-red-600"
                    : percentage >= 90
                    ? "bg-orange-500"
                    : percentage >= 70
                    ? "bg-yellow-500"
                    : "bg-teal-600"
                }`}
                style={{
                  width: `${Math.min(percentage, 100)}%`
                }}
              />
            </div>

            <p className="text-sm text-slate-500 mt-3">
              {money(spent)} spent out of {money(budgetValue)}
            </p>
          </div>
        )}
      </section>

      {/* Spending Alerts */}
      <section className="bg-white border rounded-2xl p-5">

        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="text-teal-700" />
          <h2 className="text-lg font-bold">
            Spending Alerts
          </h2>
        </div>

        <div className="flex items-start gap-3">
          {alertLevel === "Safe" ? (
            <CheckCircle2 className="text-green-600 mt-1" />
          ) : (
            <AlertTriangle className="text-orange-500 mt-1" />
          )}

          <div>
            <p className="font-semibold">
              {alertLevel === "Safe"
                ? "Budget is under control"
                : alertLevel === "Warning"
                ? "70% budget warning"
                : alertLevel === "Critical"
                ? "90% budget warning"
                : "Monthly budget exceeded"}
            </p>

            <p className="text-sm text-slate-500 mt-1">
              {percentage.toFixed(1)}% of the monthly budget has been used.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          {[70, 90, 100].map((threshold) => (
            <div
              key={threshold}
              className={`rounded-xl p-3 text-center ${
                percentage >= threshold
                  ? "bg-orange-50 text-orange-700"
                  : "bg-slate-50 text-slate-500"
              }`}
            >
              <p className="font-bold text-lg">
                {threshold}%
              </p>
              <p className="text-xs">
                {percentage >= threshold ? "Reached" : "Pending"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Restricted Categories */}
      <section className="bg-white border rounded-2xl p-5">

        <div className="flex items-center gap-2 mb-4">
          <Settings className="text-teal-700" />
          <h2 className="text-lg font-bold">
            Restricted Purchase Categories
          </h2>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          Select categories that should be flagged for parental review.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEFAULT_CATEGORIES.map((category) => (
            <label
              key={category}
              className="flex items-center gap-3 border rounded-xl p-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={restrictedCategories.includes(category)}
                onChange={() => toggleCategory(category)}
                className="accent-teal-700"
              />

              <span className="text-sm font-medium">
                {category}
              </span>

              {restrictedCategories.includes(category) && (
                <span className="ml-auto text-xs text-red-600">
                  Restricted
                </span>
              )}
            </label>
          ))}
        </div>
      </section>

      {/* Record Purchase */}
      <section className="bg-white border rounded-2xl p-5">

        <div className="flex items-center gap-2 mb-4">
          <Plus className="text-teal-700" />
          <h2 className="text-lg font-bold">
            {t("Record Purchase")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          <input
            value={purchaseName}
            onChange={(e) => setPurchaseName(e.target.value)}
            placeholder="Purchase name"
            className="border rounded-xl p-3"
          />

          <input
            type="number"
            min="0.01"
            step="0.01"
            value={purchaseAmount === "" ? "" : fromBaseCurrency(purchaseAmount, settings)}
            onChange={(e) => setPurchaseAmount(e.target.value === "" ? "" : String(toBaseCurrency(e.target.value, settings)))}
            placeholder={`Amount (${settings.currency})`}
            className="border rounded-xl p-3"
          />

          <select
            value={purchaseCategory}
            onChange={(e) => setPurchaseCategory(e.target.value)}
            className="border rounded-xl p-3 bg-white"
          >
            {DEFAULT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

        </div>

        <button
          onClick={addPurchase}
          className="mt-4 bg-teal-700 text-white rounded-xl px-5 py-3 flex items-center gap-2"
        >
          <Plus size={18} />
          Record Spending
        </button>
      </section>

      {/* Transaction History */}
      <section className="bg-white border rounded-2xl p-5">

        <h2 className="text-lg font-bold mb-4">
          Monthly Spending History
        </h2>

        {monthlyTransactions.length === 0 ? (
          <p className="text-center text-slate-500 py-8">
            No purchases recorded this month.
          </p>
        ) : (
          <div className="space-y-3">
            {monthlyTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-wrap justify-between gap-3 border rounded-xl p-4"
              >
                <div>
                  <p className="font-semibold">
                    {transaction.name}
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    {transaction.category} ·{" "}
                    {formatDate(transaction.date)}
                  </p>

                  {transaction.restricted && (
                    <span className="text-xs text-red-600 font-medium">
                      Restricted category
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-bold">
                    {money(transaction.amount)}
                  </span>

                  <button
                    onClick={() => removeTransaction(transaction.id)}
                    aria-label={`Remove ${transaction.name}`}
                    className="text-red-500"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Change PIN */}
      <section className="bg-white border rounded-2xl p-5">

        <div className="flex items-center gap-2 mb-4">
          <LockKeyhole className="text-teal-700" />
          <h2 className="text-lg font-bold">
            Change Parent PIN
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinInput}
            onChange={(e) =>
              setPinInput(e.target.value.replace(/\D/g, ""))
            }
            placeholder="New 4–6 digit PIN"
            className="border rounded-xl p-3"
          />

          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmPin}
            onChange={(e) =>
              setConfirmPin(e.target.value.replace(/\D/g, ""))
            }
            placeholder="Confirm new PIN"
            className="border rounded-xl p-3"
          />
        </div>

        <button
          onClick={changePin}
          className="mt-4 bg-slate-800 text-white rounded-xl px-5 py-3"
        >
          Update PIN
        </button>

        <button
          onClick={() => {
            setUnlocked(false);
            setPinInput("");
            setMessage("");
          }}
          className="ml-3 mt-4 border rounded-xl px-5 py-3"
        >
          Lock Controls
        </button>
      </section>

      {message && (
        <div
          role="status"
          className="bg-teal-50 border border-teal-100 text-teal-800 rounded-xl p-4 text-sm"
        >
          {message}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Demo limitation: PIN and budget data are stored in browser
        LocalStorage. This is not secure authentication or an
        enforceable purchase restriction.
      </p>

    </div>
  );
}

function PageHeading({ t }) {
  return (
    <div>
      <p className="text-sm font-medium text-teal-700">
        CARTSYNC ANALYTICS / PARENTAL MANAGEMENT
      </p>

      <h1 className="text-3xl font-bold text-slate-800 mt-2">
        {t("Parental Budget Guardrails")}
      </h1>

      <p className="text-slate-500 mt-2">
        {t("Configure spending limits and monitor household purchases.")}
      </p>
    </div>
  );
}

function StatCard({ title, value, icon: Icon }) {
  return (
    <div className="bg-white border rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{translate(title)}</p>
        <Icon className="text-teal-700" size={22} />
      </div>

      <p className="text-2xl font-bold text-slate-800 mt-3">
        {value}
      </p>
    </div>
  );
}
