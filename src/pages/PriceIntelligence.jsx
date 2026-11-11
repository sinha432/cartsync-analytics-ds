
import { useEffect, useMemo, useState } from "react";
import { useAppSettings } from "../services/AppSettingsContext";
import { formatCurrency, translate } from "../services/appLocale";
import { sendBrowserNotification } from "../services/notifications";

import {
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  IndianRupee,
  RefreshCw
} from "lucide-react";

import {
  getAllPriceComparisons,
  getStatusStyles
} from "../services/pricingService";

const formatPrice = (value) => formatCurrency(value);

const formatVariance = (value) => {
  if (value === null) return "Unavailable";

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
};

export default function PriceIntelligence() {
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");

  const allComparisons = useMemo(
    () => getAllPriceComparisons(),
    []
  );

  const categories = [
    "All",
    ...new Set(allComparisons.map((item) => item.category))
  ];

  const filteredData = allComparisons.filter((item) => {
    const matchesSearch =
      `${item.productName} ${item.brand} ${item.storeName}`
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesCategory =
      category === "All" || item.category === category;

    const matchesStatus =
      status === "All" || item.status === status;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const highAlerts = allComparisons.filter(
    (item) => item.status === "High"
  ).length;

  useEffect(() => {
    if (!settings.priceAlerts) return;

    const storageKey = "cartsync-price-alerts-sent";
    let notified = new Set();
    try {
      notified = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));
    } catch {
      notified = new Set();
    }

    const newlyNotified = [];
    allComparisons.filter((item) => item.status === "High").forEach((item) => {
      const key = `${item.productId}:${item.storeName}:${item.currentPrice}`;
      if (notified.has(key)) return;

      sendBrowserNotification(
        "High grocery price",
        `${item.productName} at ${item.storeName} is above its baseline.`
      );
      notified.add(key);
      newlyNotified.push(key);
    });

    if (newlyNotified.length) {
      localStorage.setItem(storageKey, JSON.stringify([...notified]));
    }
  }, [allComparisons, settings.priceAlerts]);

  const moderateAlerts = allComparisons.filter(
    (item) => item.status === "Moderate"
  ).length;

  const goodPrices = allComparisons.filter(
    (item) => item.status === "Good"
  ).length;

  const highRate = allComparisons.length
    ? ((highAlerts / allComparisons.length) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">

      {/* Heading */}
      <div>
        <p className="text-sm font-medium text-teal-700">
          CARTSYNC ANALYTICS / PRICE MONITORING
        </p>

        <h1 className="text-3xl font-bold text-slate-800 mt-2">
          {t("Price Intelligence")}
        </h1>

        <p className="text-slate-500 mt-2">
          {t("Monitor product prices against predefined market baselines.")}
        </p>

        <p className="text-xs text-amber-700 mt-2">
          Demo mode: All prices and baselines are illustrative.
        </p>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        <SummaryCard
          title={t("Products Monitored")}
          value={new Set(allComparisons.map(x => x.productId)).size}
          subtitle={t("Unique grocery products")}
          icon={Activity}
        />

        <SummaryCard
          title={t("High Price Alerts")}
          value={highAlerts}
          subtitle={t("More than 10% above baseline")}
          icon={AlertTriangle}
          color="text-red-600"
        />

        <SummaryCard
          title={t("Moderate Alerts")}
          value={moderateAlerts}
          subtitle={t("Up to 10% above baseline")}
          icon={TrendingUp}
          color="text-yellow-600"
        />

        <SummaryCard
          title={t("Good Price Listings")}
          value={goodPrices}
          subtitle={t("At or below baseline")}
          icon={TrendingDown}
          color="text-green-600"
        />

      </section>

      {/* Alert overview */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">

        <div className="flex justify-between items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {t("Price Alert Overview")}
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              {t("Distribution of store listings by price status.")}
            </p>
          </div>

          <RefreshCw size={21} className="text-teal-700" />
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">

          <AlertBox
            label={t("Good")}
            count={goodPrices}
            color="bg-green-500"
            textColor="text-green-700"
          />

          <AlertBox
            label={t("Moderate")}
            count={moderateAlerts}
            color="bg-yellow-500"
            textColor="text-yellow-700"
          />

          <AlertBox
            label={t("High")}
            count={highAlerts}
            color="bg-red-500"
            textColor="text-red-700"
          />

        </div>

        <p className="text-xs text-slate-400 mt-5">
          High-alert listing percentage: {highRate}%
        </p>

      </section>

      {/* Filters */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">

        <h2 className="font-bold text-slate-800 mb-4">
          {t("Price Monitoring")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          <div className="flex items-center gap-2 border rounded-xl px-3">
            <Search size={18} className="text-slate-400" />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search products or stores")}
              className="w-full p-3 outline-none text-sm"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border rounded-xl p-3 text-sm outline-none"
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item === "All" ? "All Categories" : item}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded-xl p-3 text-sm outline-none"
          >
            <option value="All">{t("All Price Statuses")}</option>
            <option value="Good">{t("Good")}</option>
            <option value="Moderate">{t("Moderate")}</option>
            <option value="High">{t("High")}</option>
          </select>

        </div>

      </section>

      {/* Price comparison table */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">

        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">
            {t("Store-wise Price Variations")}
          </h2>

          <span className="text-xs text-slate-500">
            {filteredData.length} listings
          </span>
        </div>

        {filteredData.length === 0 ? (
          <p className="text-center py-10 text-slate-500">
            No matching price records found.
          </p>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full text-sm text-left">

              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-4">{t("Product")}</th>
                  <th className="p-4">{t("Store")}</th>
                  <th className="p-4">{t("Current Price")}</th>
                  <th className="p-4">{t("Baseline")}</th>
                  <th className="p-4">{t("Variation")}</th>
                  <th className="p-4">{t("Status")}</th>
                </tr>
              </thead>

              <tbody>
                {filteredData.map((item, index) => (
                  <tr
                    key={`${item.productId}-${item.storeName}-${index}`}
                    className="border-t border-slate-100"
                  >

                    <td className="p-4">
                      <p className="font-semibold text-slate-800">
                        {item.productName}
                      </p>

                      <p className="text-xs text-slate-400 mt-1">
                        {item.quantity}
                      </p>
                    </td>

                    <td className="p-4">
                      {item.storeName}
                    </td>

                    <td className="p-4 font-semibold">
                      {formatPrice(item.currentPrice)}
                    </td>

                    <td className="p-4 text-slate-500">
                      {formatPrice(item.baselinePrice)}
                    </td>

                    <td className={`p-4 font-semibold ${
                      item.variance > 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}>
                      {formatVariance(item.variance)}
                    </td>

                    <td className="p-4">
                      <span className={`inline-flex border rounded-full px-3 py-1 text-xs font-medium ${getStatusStyles(item.status)}`}>
                        {item.status}
                      </span>
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>

          </div>
        )}

        <p className="text-xs text-slate-400 mt-4">
          Baseline prices last updated using the dates recorded in the demonstration dataset.
        </p>

      </section>

      {/* Explanation */}
      <section className="bg-teal-50 border border-teal-100 rounded-2xl p-6">

        <div className="flex gap-3 items-center">
          <IndianRupee className="text-teal-700" size={24} />

          <h2 className="font-bold text-teal-900">
            How Price Intelligence Works
          </h2>
        </div>

        <p className="text-sm text-teal-900 mt-3">
          CartSync compares each store's listed product price
          with its predefined market baseline. It calculates the
          percentage difference and assigns an alert status.
        </p>

        <p className="text-xs text-teal-800 mt-3">
          Delivery charges and platform fees are excluded from
          this product-price variance calculation.
        </p>

      </section>

    </div>
  );
}

function SummaryCard({ title, value, subtitle, icon: Icon, color = "text-teal-700" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">

      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{title}</p>
        <Icon size={21} className={color} />
      </div>

      <h3 className="text-2xl font-bold mt-4 text-slate-800">
        {value}
      </h3>

      <p className="text-xs text-slate-400 mt-2">
        {subtitle}
      </p>

    </div>
  );
}

function AlertBox({ label, count, color, textColor }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${color}`} />
        <span className={`font-semibold ${textColor}`}>
          {label}
        </span>
      </div>

      <h3 className="text-2xl font-bold mt-3 text-slate-800">
        {count}
      </h3>

      <p className="text-xs text-slate-400 mt-1">
        Store listings
      </p>
    </div>
  );
}
