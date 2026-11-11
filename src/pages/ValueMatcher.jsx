
import { useState } from "react";
import { useAppSettings } from "../services/AppSettingsContext";
import { formatCurrency, translate } from "../services/appLocale";

import {
  Search,
  Tags,
  TrendingDown,
  Star,
  Award,
  IndianRupee,
  ArrowDownRight
} from "lucide-react";

import { alternatives } from "../data/alternatives";

import {
  rankByValue,
  calculateUnitPrice,
  calculateSavings
} from "../services/valueMatcherService";

const categories = [
  "Dairy",
  "Staples",
  "Snacks",
  "Cooking Essentials"
];

const productTypes = [
  { label: "Milk", category: "Dairy" },
  { label: "Rice", category: "Staples" },
  { label: "Biscuits", category: "Snacks" },
  { label: "Cooking Oil", category: "Cooking Essentials" }
];

const formatPrice = (value) => formatCurrency(value);

export default function ValueMatcher() {
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  const [selectedType, setSelectedType] = useState("Milk");
  const [referenceId, setReferenceId] = useState(1);
  const [search, setSearch] = useState("");

  const rankedProducts = rankByValue(selectedType);

  const filteredProducts = rankedProducts.filter((item) =>
    `${item.brand} ${item.productName}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const reference =
    rankedProducts.find((item) => item.id === Number(referenceId)) ||
    rankedProducts[0];

  const cheapest = rankedProducts[0];

  const referenceSavings = reference
    ? calculateSavings(reference, cheapest)
    : { amount: 0, percentage: 0 };

  const category = productTypes.find(
    (item) => item.label === selectedType
  )?.category;

  return (
    <div className="space-y-6">

      {/* Heading */}
      <div>
        <p className="text-sm font-medium text-teal-700">
          CARTSYNC ANALYTICS / VALUE INTELLIGENCE
        </p>

        <h1 className="text-3xl font-bold text-slate-800 mt-2">
          {t("Cross-Brand Value Matcher")}
        </h1>

        <p className="text-slate-500 mt-2">
          {t("Discover affordable alternatives using unit-price")}{" "}
          {t("and customer-rating comparisons.")}
        </p>

        <p className="text-xs text-amber-700 mt-2">
          {t("Demonstration dataset. Prices and ratings are illustrative.")}
        </p>
      </div>

      {/* Categories */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="font-bold text-slate-800 mb-4">
          {t("Select Grocery Category")}
        </h2>

        <div className="flex flex-wrap gap-3">
          {categories.map((categoryName) => (
            <button
              key={categoryName}
              onClick={() => {
                const nextType = productTypes.find(
                  (item) => item.category === categoryName
                )?.label;

                if (nextType) {
                  setSelectedType(nextType);
                  setReferenceId(null);
                  setSearch("");
                }
              }}
              className={`px-5 py-3 rounded-xl text-sm font-medium transition ${
                category === categoryName
                  ? "bg-teal-700 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-teal-50"
              }`}
            >
              {t(categoryName)}
            </button>
          ))}
        </div>
      </div>

      {/* Product Selection */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">

        <h2 className="font-bold text-slate-800">
          {t("Product Comparison")}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <label className="text-sm text-slate-600 block mb-2">
              {t("Product type")}
            </label>

            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setReferenceId(null);
                setSearch("");
              }}
              className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:border-teal-600"
            >
              {productTypes.map((item) => (
                <option key={item.label} value={item.label}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-600 block mb-2">
              {t("Reference brand")}
            </label>

            <select
              value={reference?.id ?? ""}
              onChange={(e) => setReferenceId(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:border-teal-600"
            >
              {rankedProducts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.brand}
                </option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3">
          <Search size={19} className="text-slate-400" />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search brands or products...")}
            className="w-full outline-none text-sm"
          />
        </div>

      </div>

      {/* Recommendation */}
      {reference && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-6">

          <div className="flex items-center gap-3">
            <Award className="text-teal-700" size={26} />

            <h2 className="font-bold text-teal-900">
              {t("Best Unit-Price Option")}
            </h2>
          </div>

          <h3 className="text-xl font-bold text-teal-900 mt-4">
            {cheapest.brand}
          </h3>

          <p className="text-sm text-teal-800 mt-1">
            {cheapest.productName}
          </p>

          <div className="flex flex-wrap gap-8 mt-5">

            <div>
              <p className="text-xs text-teal-700">
                {t("Unit price")}
              </p>

              <h3 className="text-2xl font-bold text-teal-900">
                {formatPrice(cheapest.unitPrice)}
                <span className="text-sm font-normal">
                  /{cheapest.unit === "g" ? "kg" : cheapest.unit === "ml" ? "L" : cheapest.unit}
                </span>
              </h3>
            </div>

            <div>
              <p className="text-xs text-teal-700">
                {t("Potential savings vs reference")}
              </p>

              <h3 className="text-2xl font-bold text-teal-900">
                {formatPrice(Math.max(0, referenceSavings.amount))}
              </h3>
            </div>

          </div>

          <p className="text-xs text-teal-800 mt-4">
            Recommendation is based on the lowest normalized
            unit price, not a guarantee of superior quality.
          </p>
        </div>
      )}

      {/* Product Results */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">

        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">
            {t("Alternative Brand Comparison")}
          </h2>

          <span className="text-xs text-slate-500">
            {filteredProducts.length} results
          </span>
        </div>

        {filteredProducts.length === 0 ? (
          <p className="text-center text-slate-500 py-10">
            No matching brands found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">

              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-4">{t("Brand")}</th>
                  <th className="p-4">{t("Package")}</th>
                  <th className="p-4">{t("Price")}</th>
                  <th className="p-4">{t("Unit Price")}</th>
                  <th className="p-4">{t("Rating")}</th>
                  <th className="p-4">{t("Status")}</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((item) => {
                  const isCheapest = item.id === cheapest.id;
                  const isReference = item.id === reference?.id;

                  return (
                    <tr
                      key={item.id}
                      className="border-t border-slate-100"
                    >
                      <td className="p-4 font-semibold">
                        {item.brand}

                        {isReference && (
                          <span className="block text-xs text-blue-600 font-normal">
                            Reference
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        {item.quantity} {item.unit}
                      </td>

                      <td className="p-4">
                        {formatPrice(item.price)}
                      </td>

                      <td className="p-4 font-semibold">
                        {formatPrice(calculateUnitPrice(item))}
                        /{item.unit === "g" ? "kg" : item.unit === "ml" ? "L" : item.unit}
                      </td>

                      <td className="p-4">
                        <span className="inline-flex items-center gap-1">
                          <Star
                            size={14}
                            className="text-amber-500 fill-amber-500"
                          />
                          {item.rating.toFixed(1)}
                        </span>
                      </td>

                      <td className="p-4">
                        {isCheapest ? (
                          <span className="text-xs bg-teal-50 text-teal-700 px-3 py-1 rounded-full">
                            Best price
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Alternative
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}
      </div>

      {/* Insights */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <TrendingDown size={23} className="text-teal-700" />

          <h2 className="font-bold text-slate-800">
            {t("Value Insights")}
          </h2>
        </div>

        {reference && (
          <div className="mt-4 space-y-3">

            <p className="text-sm text-slate-600">
              Reference brand: <strong>{reference.brand}</strong>
            </p>

            <p className="text-sm text-slate-600">
              Lowest unit price: <strong>{cheapest.brand}</strong>
            </p>

            <p className="text-sm text-slate-600 flex items-center gap-1">
              <ArrowDownRight size={16} className="text-teal-700" />

              {referenceSavings.amount >= 0
                ? `${referenceSavings.percentage.toFixed(1)}% lower unit price compared with the reference.`
                : `${Math.abs(referenceSavings.percentage).toFixed(1)}% higher unit price than the lowest option.`}
            </p>

          </div>
        )}
      </div>

    </div>
  );
}
