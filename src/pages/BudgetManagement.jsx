
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppSettings } from "../services/AppSettingsContext";
import { formatCurrency, formatDate, translate } from "../services/appLocale";
import { toast } from "sonner";
import {
  Wallet,
  Receipt,
  PiggyBank,
  ShoppingCart,
  RefreshCw,
  Trash2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  getTransactions,
  deleteTransaction,
  subscribeToLedger,
} from "../services/spendingLedger";

const PARENT_KEY = "cartsync-parental-controls";
const CART_KEY = "cartsync-expense-data";

const money = (value) => formatCurrency(Number(value) || 0);

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getCartEstimate() {
  const cart = readJSON(CART_KEY, null);

  if (!cart || !Array.isArray(cart.items)) return 0;

  const subtotal = cart.items.reduce(
    (total, item) =>
      total + Number(
        item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 1)
      ),
    0
  );

  const discount = Number(cart.discount || 0);
  const fees = Number(cart.additionalFees || 0);

  return Math.max(0, subtotal - discount + fees);
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function StatCard({ title, value, subtitle, icon: Icon, accent = "teal" }) {
  const styles = {
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h2 className="text-2xl font-bold text-slate-800 mt-2">
            {value}
          </h2>
        </div>
        <div className={`p-3 rounded-xl ${styles[accent]}`}>
          <Icon size={21} />
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">{subtitle}</p>
    </section>
  );
}

export default function BudgetManagement() {
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  const [transactions, setTransactions] = useState(() => getTransactions());
  const [budget, setBudget] = useState(() => {
    const data = readJSON(PARENT_KEY, {});
    return Number(data.budget ?? 5000);
  });
  const [cartEstimate, setCartEstimate] = useState(getCartEstimate);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    getMonthKey(new Date())
  );

  const refreshData = useCallback(() => {
    setTransactions(getTransactions());

    const parentData = readJSON(PARENT_KEY, {});
    setBudget(Number(parentData.budget ?? 5000));

    setCartEstimate(getCartEstimate());
  }, []);

  useEffect(() => {
    refreshData();

    const unsubscribe = subscribeToLedger((records) => {
      setTransactions(records);
      const parentData = readJSON(PARENT_KEY, {});
      setBudget(Number(parentData.budget ?? 5000));
      setCartEstimate(getCartEstimate());
    });

    const handleStorage = (event) => {
      if (
        event.key === PARENT_KEY ||
        event.key === CART_KEY
      ) {
        refreshData();
      }
    };

    window.addEventListener("storage", handleStorage);

    // Also refresh when returning to this browser tab.
    window.addEventListener("focus", refreshData);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshData);
    };
  }, [refreshData]);

  const monthTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const date = new Date(transaction.date);

      return (
        !Number.isNaN(date.getTime()) &&
        getMonthKey(date) === selectedMonth
      );
    });
  }, [transactions, selectedMonth]);

  const spent = monthTransactions.reduce(
    (total, transaction) => total + Number(transaction.amount || 0),
    0
  );

  const remaining = budget - spent;
  const percentage = budget > 0 ? (spent / budget) * 100 : 0;
  const progress = Math.min(100, Math.max(0, percentage));

  const status =
    percentage >= 100
      ? {
          title: "Budget exceeded",
          description: "Recorded spending has reached or exceeded the budget.",
          color: "red",
          icon: AlertTriangle,
        }
      : percentage >= 90
      ? {
          title: "Critical spending level",
          description: "You have used at least 90% of your monthly budget.",
          color: "red",
          icon: AlertTriangle,
        }
      : percentage >= 70
      ? {
          title: "Budget warning",
          description: "You have used at least 70% of your monthly budget.",
          color: "amber",
          icon: AlertTriangle,
        }
      : {
          title: "Spending is within budget",
          description: "Recorded spending is below the 70% warning level.",
          color: "teal",
          icon: CheckCircle2,
        };

  const StatusIcon = status.icon;

  const categoryTotals = useMemo(() => {
    const totals = {};

    monthTransactions.forEach((transaction) => {
      const category = transaction.category || "Other";
      totals[category] =
        (totals[category] || 0) + Number(transaction.amount || 0);
    });

    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [monthTransactions]);

  const trend = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const selectedDate = new Date(year, month - 1, 1);

    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth() - 5 + index,
        1
      );

      const key = getMonthKey(date);

      const total = transactions
        .filter((transaction) => {
          const transactionDate = new Date(transaction.date);
          return (
            !Number.isNaN(transactionDate.getTime()) &&
            getMonthKey(transactionDate) === key
          );
        })
        .reduce(
          (sum, transaction) => sum + Number(transaction.amount || 0),
          0
        );

      return {
        label: formatDate(date, settings, { month: "short" }),
        amount: total,
      };
    });
  }, [transactions, selectedMonth, settings]);

  const maxTrend = Math.max(1, ...trend.map((item) => item.amount));

  const handleDelete = (id) => {
    const confirmed = window.confirm(
      "Delete this purchase from the shared spending ledger?"
    );

    if (!confirmed) return;

    try {
      deleteTransaction(id);
      refreshData();
      toast.success("Purchase deleted.");
    } catch (error) {
      toast.error(error.message || "Unable to delete purchase.");
    }
  };

  const changeMonth = (event) => {
    setSelectedMonth(event.target.value);
  };

  const selectedMonthLabel = formatDate(
    new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1, 1),
    settings,
    { month: "long", year: true }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700">
            CARTSYNC ANALYTICS / HOUSEHOLD FINANCE
          </p>
          <h1 className="text-3xl font-bold text-slate-800 mt-2">
            {t("Budget Management")}
          </h1>
          <p className="text-slate-500 mt-2">
            {t("Monitor confirmed household purchases and monthly spending.")}
          </p>
        </div>

        <button
          onClick={refreshData}
          className="border border-slate-300 bg-white rounded-xl px-4 py-3 flex items-center gap-2 hover:bg-slate-50"
        >
          <RefreshCw size={17} />
          {t("Refresh data")}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title={t("Monthly Budget")}
          value={money(budget)}
          subtitle={t("Limit from Parental Controls")}
          icon={Wallet}
        />
        <StatCard
          title={t("Recorded Spending")}
          value={money(spent)}
          subtitle={`${monthTransactions.length} confirmed purchase(s)`}
          icon={Receipt}
          accent="blue"
        />
        <StatCard
          title={t("Remaining Budget")}
          value={money(remaining)}
          subtitle={remaining < 0 ? "Amount over budget" : "Available this month"}
          icon={PiggyBank}
          accent={remaining < 0 ? "red" : "teal"}
        />
        <StatCard
          title={t("Current Cart Estimate")}
          value={money(cartEstimate)}
          subtitle="Not counted as spending until purchase confirmation"
          icon={ShoppingCart}
          accent="amber"
        />
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {t("Budget Utilization")}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Based on shared ledger purchases for {selectedMonthLabel}.
            </p>
          </div>

          <input
            type="month"
            value={selectedMonth}
            onChange={changeMonth}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-between text-sm font-medium">
          <span>{money(spent)} spent</span>
          <span>{percentage.toFixed(1)}%</span>
        </div>

        <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage >= 100
                ? "bg-red-600"
                : percentage >= 70
                ? "bg-amber-500"
                : "bg-teal-600"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-slate-500">
          <span>{money(0)}</span>
              <span>{t("Budget limit")}: {money(budget)}</span>
        </div>

        <div
          className={`rounded-xl border p-4 flex items-start gap-3 ${
            status.color === "red"
              ? "bg-red-50 border-red-200 text-red-800"
              : status.color === "amber"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-teal-50 border-teal-200 text-teal-800"
          }`}
        >
       <StatusIcon size={21} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{t(status.title)}</p>
            <p className="text-sm mt-1">{t(status.description)}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-slate-800">
            {t("Category-wise Spending")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Breakdown for {selectedMonthLabel}.
          </p>

          {categoryTotals.length === 0 ? (
            <p className="text-center text-slate-500 py-12">
              {t("No category spending recorded for this month.")}
            </p>
          ) : (
            <div className="space-y-5 mt-6">
              {categoryTotals.map(([category, amount]) => (
                <div key={category}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-slate-700">
                      {category}
                    </span>
                    <span className="text-slate-600">{money(amount)}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full"
                      style={{
                        width: `${
                          spent > 0 ? (amount / spent) * 100 : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-slate-800">
            {t("Six-month Spending Trend")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Based on confirmed purchases in the shared ledger.
          </p>

          <div className="flex items-end justify-between gap-3 h-52 mt-6">
            {trend.map((item) => (
              <div
                key={item.label}
                className="flex-1 flex flex-col items-center justify-end h-full gap-2"
              >
                <span className="text-xs text-slate-500">
                  {item.amount > 0 ? money(item.amount) : "—"}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full bg-teal-500 rounded-t-lg min-h-1 transition-all duration-500"
                    style={{
                      height: `${
                        item.amount > 0
                          ? Math.max(5, (item.amount / maxTrend) * 100)
                          : 2
                      }%`,
                    }}
                    title={`${item.label}: ${money(item.amount)}`}
                  />
                </div>
                <span className="text-xs text-slate-500">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {t("Transaction History")}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {monthTransactions.length} recorded purchase(s) in {selectedMonthLabel}.
            </p>
          </div>
          <TrendingUp className="text-teal-700" />
        </div>

        {monthTransactions.length === 0 ? (
          <div className="text-center py-12">
            <Receipt size={35} className="mx-auto text-slate-300 mb-3" />
            <p className="font-semibold text-slate-600">
              {t("No transactions found")}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {t("Confirm a purchase in Expense Splitter to see it here.")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto mt-5">
            <table className="w-full text-sm text-left">
              <thead className="text-slate-500 border-b">
                <tr>
                  <th className="py-3 pr-4">{t("Purchase")}</th>
                  <th className="py-3 pr-4">{t("Category")}</th>
                  <th className="py-3 pr-4">{t("Date")}</th>
                  <th className="py-3 pr-4 text-right">{t("Amount")}</th>
                  <th className="py-3 text-right">{t("Action")}</th>
                </tr>
              </thead>
              <tbody>
                {monthTransactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b last:border-0">
                    <td className="py-4 pr-4 font-medium text-slate-800">
                      {transaction.name}
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      {transaction.category || "Other"}
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      {formatDate(transaction.date, settings)}
                    </td>
                    <td className="py-4 pr-4 text-right font-semibold">
                      {money(transaction.amount)}
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => handleDelete(transaction.id)}
                        title={t("Delete purchase")}
                        aria-label={`Delete ${transaction.name}`}
                        className="text-red-600 hover:bg-red-50 rounded-lg p-2"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
