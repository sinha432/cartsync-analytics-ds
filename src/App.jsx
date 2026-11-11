import Settings from "./pages/Settings";
import {
  ShoppingBasket,
  LayoutDashboard,
  Tags,
  ChartNoAxesCombined,
  Users,
  Wallet,
  ShieldCheck,
  Settings as SettingsIcon,
  Bell,
  Search,
  Menu,
  X
} from "lucide-react";

import {
  NavLink,
  Routes,
  Route,
  Outlet
} from "react-router-dom";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSettings } from "./services/AppSettingsContext";
import { translate } from "./services/appLocale";

import Dashboard from "./pages/Dashboard";
import GroceryComparison from "./pages/GroceryComparison";
import ValueMatcher from "./pages/ValueMatcher";
import PriceIntelligence from "./pages/PriceIntelligence";
import ExpenseSplitter from "./pages/ExpenseSplitter";
import BudgetManagement from "./pages/BudgetManagement";
import ParentalControls from "./pages/ParentalControls";

const menuItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "Grocery Comparison", path: "/comparison", icon: ShoppingBasket },
  { name: "Value Matcher", path: "/value-matcher", icon: Tags },
  { name: "Price Intelligence", path: "/price-intelligence", icon: ChartNoAxesCombined },
  { name: "Expense Splitter", path: "/expenses", icon: Users },
  { name: "Budget Management", path: "/budget", icon: Wallet },
  { name: "Parental Controls", path: "/parental-controls", icon: ShieldCheck },
];

function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { settings } = useAppSettings();
  const t = (text) => translate(text, settings.language);
  const searchTerm = search.trim().toLowerCase();
  const visibleMenuItems = menuItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm) ||
    t(item.name).toLowerCase().includes(searchTerm)
  );
  const showSettingsLink = "settings".includes(searchTerm) ||
    t("Settings").toLowerCase().includes(searchTerm);
  const profileInitial = settings.profileName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Fixed Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50
          h-screen w-64
          flex flex-col
          overflow-y-auto
          bg-white border-r border-slate-200 p-6
          transform transition-transform duration-300
          ${mobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
          }
        `}
      >

        {/* Logo */}
        <div className="flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-teal-700">
              CartSync
            </h1>

            <p className="text-xs text-slate-400 mt-1">
              SMART GROCERY ANALYTICS
            </p>
          </div>

          <button
            className="md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-10 space-y-2 flex-1" aria-label="Main navigation">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                onClick={() => {
                  setMobileOpen(false);
                  setSearch("");
                  setSearchOpen(false);
                }}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 p-3 rounded-xl transition ${
                    isActive
                      ? "bg-teal-50 text-teal-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                <Icon size={19} />
                <span className="text-sm">{t(item.name)}</span>
              </NavLink>
            );
          })}
          {showSettingsLink && (
            <NavLink
              to="/settings"
              onClick={() => {
                setMobileOpen(false);
                setSearch("");
                setSearchOpen(false);
              }}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 p-3 rounded-xl transition ${
                  isActive
                    ? "bg-teal-50 text-teal-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <SettingsIcon size={19} />
              <span className="text-sm">{t("Settings")}</span>
            </NavLink>
          )}
          {searchTerm && visibleMenuItems.length === 0 && !showSettingsLink && (
            <p className="px-3 py-2 text-sm text-slate-400">{t("No matching pages")}</p>
          )}
        </nav>

        {/* Settings */}
        <div className="mt-8 border-t border-slate-200 pt-5 shrink-0">
          <p className="px-2 text-xs text-slate-400">{settings.email}</p>
        </div>

      </aside>

      {/* Main Content */}
      <main className="min-h-screen min-w-0 md:ml-64">

        <div className="p-5 md:p-10">

          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-4 mb-6 sm:mb-10">

            <div className="flex min-w-0 flex-1 items-center gap-3">

              <button
                className="md:hidden p-2 bg-white border rounded-lg"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>

              <div>
                <h2 className="text-xl font-bold text-slate-800 sm:text-2xl">
                  {t("CartSync Analytics")}
                </h2>

                <p className="text-slate-500 mt-1 text-sm">
                  {t("Smart grocery and shared expense management")}
                </p>
              </div>

            </div>

            {/* Header Actions */}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">

              <div className="flex items-center gap-2">
                {searchOpen && (
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setSearchOpen(false);
                        setSearch("");
                      }
                    }}
                    placeholder={t("Search pages")}
                    aria-label="Search sidebar pages"
                    className="w-36 sm:w-48 p-3 bg-white rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  />
                )}
                <button
                  className="p-3 bg-white rounded-xl border hover:bg-slate-50"
                  aria-label={searchOpen ? "Close search" : "Search pages"}
                  aria-expanded={searchOpen}
                  onClick={() => {
                    if (searchOpen) setSearch("");
                    setSearchOpen((open) => !open);
                    if (!searchOpen && window.matchMedia("(max-width: 767px)").matches) {
                      setMobileOpen(true);
                    }
                  }}
                >
                  <Search size={19} />
                </button>
              </div>

              <button
                className="p-3 bg-white rounded-xl border hover:bg-slate-50"
                aria-label="Notifications"
                onClick={() => toast.info(t("Manage browser alerts in Settings."))}
              >
                <Bell size={19} />
              </button>

              <button
                type="button"
                title={settings.profileName}
                aria-label={`Profile for ${settings.profileName}`}
                onClick={() => toast.info(settings.email || "Add an email address in Settings.")}
                className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold"
              >
                {profileInitial}
              </button>

            </div>

          </header>

          {/* Page Content */}
          <Outlet />

        </div>

      </main>

    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="comparison" element={<GroceryComparison />} />
        <Route path="value-matcher" element={<ValueMatcher />} />
        <Route path="price-intelligence" element={<PriceIntelligence />} />
        <Route path="expenses" element={<ExpenseSplitter />} />
        <Route path="budget" element={<BudgetManagement />} />
        <Route path="parental-controls" element={<ParentalControls />} />
      <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
