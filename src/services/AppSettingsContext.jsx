import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  applyAppSettings,
  loadAppSettings,
  saveAppSettings,
  subscribeToAppSettings
} from "./appSettings";

const AppSettingsContext = createContext(null);

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadAppSettings);
  const settingsRef = useRef(settings);

  useEffect(() => {
    applyAppSettings(settings);
  }, [settings]);

  useEffect(() => subscribeToAppSettings((nextSettings) => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
  }), []);

  const updateSettings = (updates) => {
    const nextSettings = saveAppSettings({ ...settingsRef.current, ...updates });
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    return nextSettings;
  };

  return (
    <AppSettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) throw new Error("useAppSettings must be used within AppSettingsProvider");
  return context;
}