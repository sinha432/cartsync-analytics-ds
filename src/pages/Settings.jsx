import { toast } from "sonner";
import {
  Bell,
  CheckCircle2,
  Database,
  Download,
  Globe,
  Info,
  Moon,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Sun,
  User,
  UserRound
} from "lucide-react";
import { useAppSettings } from "../services/AppSettingsContext";
import { SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS } from "../services/appSettings";
import { DEMO_CURRENCY_RATES, translate } from "../services/appLocale";
import { requestNotificationPermission } from "../services/notifications";

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="bg-teal-50 text-teal-700 p-2.5 rounded-xl">
          <Icon size={21} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">{translate(title)}</h2>
          <p className="text-sm text-slate-500 mt-1">{translate(description)}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-600">{translate(label)}</label>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 cursor-pointer">
      <div>
        <p className="text-sm font-medium text-slate-700">{translate(label)}</p>
        <p className="text-xs text-slate-500 mt-1">{translate(description)}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="w-5 h-5 accent-teal-700 shrink-0"
      />
    </label>
  );
}

const inputClass = "w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white";

export default function Settings() {
  const { settings, updateSettings } = useAppSettings();
  const t = (text) => translate(text, settings.language);

  const updateSetting = (key, value) => {
    try {
      updateSettings({ [key]: value });
      return true;
    } catch (error) {
      console.error("Unable to save settings:", error);
      toast.error(t("Unable to save settings in this browser."));
      return false;
    }
  };

  const updateAlert = async (key, enabled) => {
    if (!enabled) {
      updateSetting(key, false);
      return;
    }

    let permission;
    try {
      permission = await requestNotificationPermission();
    } catch (error) {
      console.error("Unable to request browser notifications:", error);
      toast.error(t("Browser notification permission could not be requested."));
      return;
    }
    if (permission === "granted") {
      updateSetting(key, true);
      toast.success(t("Browser notifications enabled."));
    } else {
      updateSetting(key, false);
      toast.error(t(permission === "unsupported"
        ? "This browser does not support notifications."
        : "Allow notifications in your browser to enable this alert."));
    }
  };

  const saveSettings = () => {
    try {
      updateSettings(settings);
      toast.success(t("Your settings have been saved."));
    } catch (error) {
      console.error("Unable to save settings:", error);
      toast.error(t("Unable to save settings in this browser."));
    }
  };

  const exportData = () => {
    try {
      const exportedData = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith("cartsync-")) continue;
        const value = localStorage.getItem(key);
        try {
          exportedData[key] = JSON.parse(value);
        } catch {
          exportedData[key] = value;
        }
      }

      const blob = new Blob([JSON.stringify(exportedData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cartsync-backup.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("CartSync backup exported successfully."));
    } catch (error) {
      console.error("Unable to export CartSync data:", error);
      toast.error(t("Unable to export CartSync data."));
    }
  };

  const resetData = () => {
    const confirmed = window.confirm(t("This will delete your saved CartSync application data, including expense records and parental settings. Your app preferences will remain. Continue?"));
    if (!confirmed) return;

    try {
      const keysToRemove = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("cartsync-") && key !== SETTINGS_STORAGE_KEY) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      window.dispatchEvent(new CustomEvent("cartsync:ledger-updated"));
      window.dispatchEvent(new CustomEvent("cartsync:data-reset"));
      toast.success(t("CartSync application data has been reset."));
    } catch (error) {
      console.error("Unable to reset CartSync data:", error);
      toast.error(t("Unable to reset CartSync data."));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-teal-700">CARTSYNC ANALYTICS / PREFERENCES</p>
        <h1 className="text-3xl font-bold text-slate-800 mt-2">{t("Settings")}</h1>
        <p className="text-slate-500 mt-2">{t("Manage your account, application preferences and data.")}</p>
      </div>

      <Section icon={UserRound} title="Profile Settings" description="Manage your CartSync profile information.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Display Name">
            <input className={inputClass} value={settings.profileName} onChange={(event) => updateSetting("profileName", event.target.value)} placeholder={t("Enter your name")} />
          </Field>
          <Field label="Email Address">
            <input type="email" className={inputClass} value={settings.email} onChange={(event) => updateSetting("email", event.target.value)} placeholder={t("Enter your email")} />
          </Field>
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
          <User size={15} />
          {t("Profile information is stored in this browser.")}
        </div>
      </Section>

      <Section icon={Palette} title="Appearance" description="Choose your preferred application appearance.">
        <Field label="Theme preference">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => updateSetting("theme", "light")} className={`flex items-center justify-center gap-2 p-4 rounded-xl border ${settings.theme === "light" ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}>
              <Sun size={19} />{t("Light")}
            </button>
            <button type="button" onClick={() => updateSetting("theme", "dark")} className={`flex items-center justify-center gap-2 p-4 rounded-xl border ${settings.theme === "dark" ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}>
              <Moon size={19} />{t("Dark preference")}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">{t("Your theme is applied across the application and saved in this browser.")}</p>
          <button type="button" onClick={() => {
            if (updateSetting("theme", DEFAULT_SETTINGS.theme)) toast.success(t("Color preference reset to light."));
          }} className="mt-3 text-sm font-medium text-teal-700 hover:text-teal-800 underline underline-offset-2">
            {t("Reset color preference")}
          </button>
        </Field>
        <div className="mt-4 border-t border-slate-100">
          <Toggle label="Compact layout" description="Save your preference for a more compact interface." checked={settings.compactMode} onChange={(value) => updateSetting("compactMode", value)} />
        </div>
      </Section>

      <Section icon={Bell} title="Notifications" description="Choose which notifications you want to receive.">
        <div className="divide-y divide-slate-100">
          <Toggle label="Price alerts" description="Notifications when grocery prices change." checked={settings.priceAlerts} onChange={(value) => updateAlert("priceAlerts", value)} />
          <Toggle label="Budget warnings" description="Alerts when spending approaches your budget." checked={settings.budgetAlerts} onChange={(value) => updateAlert("budgetAlerts", value)} />
          <Toggle label="Purchase notifications" description="Notifications when purchases are recorded." checked={settings.purchaseAlerts} onChange={(value) => updateAlert("purchaseAlerts", value)} />
        </div>
      </Section>

      <Section icon={Globe} title="Regional Preferences" description="Customize your language, currency and date format.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Currency">
            <select className={inputClass} value={settings.currency} onChange={(event) => updateSetting("currency", event.target.value)}>
              <option value="INR">INR - Indian Rupee</option>
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
            </select>
          </Field>
          <Field label="Language">
            <select className={inputClass} value={settings.language} onChange={(event) => updateSetting("language", event.target.value)}>
              <option value="English">{t("English")}</option>
              <option value="Kannada">{t("Kannada")}</option>
              <option value="Hindi">{t("Hindi")}</option>
            </select>
          </Field>
          <Field label="Date Format">
            <select className={inputClass} value={settings.dateFormat} onChange={(event) => updateSetting("dateFormat", event.target.value)}>
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          {t("Amounts are stored as INR and converted using approximate demo rates. Currency settings do not use live exchange rates.")}
          {" "}{Object.entries(DEMO_CURRENCY_RATES).filter(([currency]) => currency !== "INR").map(([currency, rate]) => `₹100 ≈ ${(rate * 100).toFixed(2)} ${currency}`).join(" · ")}
        </p>
      </Section>

      <Section icon={Database} title="Data Management" description="Export a backup or reset your local application data.">
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={exportData} className="flex items-center justify-center gap-2 bg-teal-700 text-white px-5 py-3 rounded-xl hover:bg-teal-800">
            <Download size={18} />{t("Export Backup")}
          </button>
          <button type="button" onClick={resetData} className="flex items-center justify-center gap-2 border border-red-200 text-red-600 px-5 py-3 rounded-xl hover:bg-red-50">
            <RotateCcw size={18} />{t("Reset Application Data")}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-4">{t("Export creates a JSON backup of CartSync LocalStorage records. Reset permanently deletes matching application records after confirmation.")}</p>
      </Section>

      <Section icon={ShieldCheck} title="Privacy & Security" description="Information about how this prototype stores your data.">
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Info className="text-teal-700 shrink-0 mt-0.5" size={19} />
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("Browser-based storage")}</p>
              <p className="text-xs text-slate-500 mt-1">{t("CartSync currently stores data in your browser's LocalStorage. Data is not automatically synchronized across devices.")}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-teal-700 shrink-0 mt-0.5" size={19} />
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("PIN protection")}</p>
              <p className="text-xs text-slate-500 mt-1">{t("The current parental PIN is a demonstration feature, not production-grade authentication.")}</p>
            </div>
          </div>
        </div>
      </Section>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <p className="text-xs text-slate-400 flex items-center gap-2" role="status">
          <CheckCircle2 size={15} />{t("Your preferences are saved automatically.")}
        </p>
        <button type="button" onClick={saveSettings} className="flex items-center gap-2 bg-teal-700 text-white px-6 py-3 rounded-xl hover:bg-teal-800">
          <Save size={18} />{t("Save Settings")}
        </button>
      </div>
    </div>
  );
}