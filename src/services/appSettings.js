export const SETTINGS_STORAGE_KEY = "cartsync-app-settings";

export const DEFAULT_SETTINGS = {
  profileName: "Ansu",
  email: "",
  theme: "light",
  compactMode: false,
  priceAlerts: false,
  budgetAlerts: false,
  purchaseAlerts: false,
  currency: "INR",
  language: "English",
  dateFormat: "DD/MM/YYYY"
};

const SETTINGS_EVENT = "cartsync:settings-updated";
const validCurrencies = new Set(["INR", "USD", "EUR", "GBP"]);
const validLanguages = new Set(["English", "Kannada", "Hindi"]);
const validDateFormats = new Set(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]);

function normalizeSettings(parsed) {
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    profileName: typeof parsed.profileName === "string" ? parsed.profileName : DEFAULT_SETTINGS.profileName,
    email: typeof parsed.email === "string" ? parsed.email : DEFAULT_SETTINGS.email,
    theme: parsed.theme === "dark" ? "dark" : "light",
    compactMode: parsed.compactMode === true,
    priceAlerts: parsed.priceAlerts === true,
    budgetAlerts: parsed.budgetAlerts === true,
    purchaseAlerts: parsed.purchaseAlerts === true,
    currency: validCurrencies.has(parsed.currency) ? parsed.currency : DEFAULT_SETTINGS.currency,
    language: validLanguages.has(parsed.language) ? parsed.language : DEFAULT_SETTINGS.language,
    dateFormat: validDateFormats.has(parsed.dateFormat) ? parsed.dateFormat : DEFAULT_SETTINGS.dateFormat
  };
}

export function loadAppSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }

    return normalizeSettings(parsed);
  } catch (error) {
    console.error("Unable to load settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAppSettings(settings) {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: normalized }));
  return normalized;
}

export function subscribeToAppSettings(callback) {
  const handleUpdate = (event) => callback(event.detail ?? loadAppSettings());
  const handleStorage = (event) => {
    if (event.key === SETTINGS_STORAGE_KEY) callback(loadAppSettings());
  };

  window.addEventListener(SETTINGS_EVENT, handleUpdate);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(SETTINGS_EVENT, handleUpdate);
    window.removeEventListener("storage", handleStorage);
  };
}

export function applyAppSettings(settings) {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.compact = String(settings.compactMode);
  document.documentElement.lang = settings.language === "Kannada" ? "kn" : settings.language === "Hindi" ? "hi" : "en";
  document.documentElement.style.colorScheme = settings.theme;
}
