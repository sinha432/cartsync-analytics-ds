
import {
  ShoppingCart,
  TrendingDown,
  Users,
  Wallet,
  ShoppingBasket,
  ArrowRight
} from "lucide-react";

import { Link } from "react-router-dom";
import { useAppSettings } from "../services/AppSettingsContext";
import { formatCurrency, translate } from "../services/appLocale";

function StatCard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{title}</p>
        <Icon size={21} className="text-teal-700" />
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

export default function Dashboard() {
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  return (
    <div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">

        <StatCard
          title={t("Total Grocery Spending")}
          value={formatCurrency(2450, settings)}
          subtitle={t("Current shopping")}
          icon={ShoppingCart}
        />

        <StatCard
          title={t("Estimated Savings")}
          value={formatCurrency(350, settings)}
          subtitle={t("Through price comparison")}
          icon={TrendingDown}
        />

        <StatCard
          title={t("Household Members")}
          value="4"
          subtitle={t("Shared household")}
          icon={Users}
        />

        <StatCard
          title={t("Remaining Budget")}
          value={formatCurrency(1200, settings)}
          subtitle={t("Available balance")}
          icon={Wallet}
        />

      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">

        <div className="bg-white p-6 rounded-2xl border border-slate-200">
          <ShoppingBasket className="text-teal-700" size={28} />

          <h3 className="text-lg font-bold mt-4">
            {t("Grocery Intelligence")}
          </h3>

          <p className="text-slate-500 text-sm mt-2">
            {t("Compare grocery prices and discover better-value products.")}
          </p>

          <Link
            to="/comparison"
            className="inline-flex items-center gap-2 mt-5 bg-teal-700 text-white px-5 py-3 rounded-xl text-sm"
          >
            {t("Explore Comparison")} <ArrowRight size={16} />
          </Link>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200">
          <Users className="text-teal-700" size={28} />

          <h3 className="text-lg font-bold mt-4">
            {t("Shared Expense Management")}
          </h3>

          <p className="text-slate-500 text-sm mt-2">
            {t("Calculate fair payments based on individual consumption.")}
          </p>

          <Link
            to="/expenses"
            className="inline-flex items-center gap-2 mt-5 bg-teal-700 text-white px-5 py-3 rounded-xl text-sm"
          >
            {t("Manage Expenses")} <ArrowRight size={16} />
          </Link>
        </div>

      </section>

    </div>
  );
}
