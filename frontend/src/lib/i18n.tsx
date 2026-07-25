"use client";

/**
 * A deliberately tiny i18n layer — a locale context plus a `t(key)`
 * lookup — rather than pulling in a full i18n framework, in keeping with
 * this project's "own your dependencies" stance.
 *
 * Coverage is incremental: strings are translated as they're wrapped in
 * `t()`. A missing Hindi key falls back to English, and a missing key
 * entirely falls back to the key itself, so the UI never shows a blank —
 * untranslated surfaces simply stay English until they're wrapped.
 */

import { createContext, useCallback, useContext, useState } from "react";

import { Locale, getLocale, setLocale as persistLocale } from "./preferences";

type Dict = Record<string, string>;

const en: Dict = {
  // nav
  "nav.myCloud": "My Cloud",
  "nav.photos": "Photos",
  "nav.videos": "Videos",
  "nav.starred": "Starred",
  "nav.recent": "Recent",
  "nav.trash": "Trash",
  "nav.sharedWithMe": "Shared with me",
  "nav.activity": "Activity",
  // toolbar
  "toolbar.newFolder": "New folder",
  "toolbar.upload": "Upload",
  "toolbar.uploadFolder": "Upload folder",
  "toolbar.search": "Search all files…  (press /)",
  // settings
  "settings.back": "Back to Nimbus",
  "settings.title": "Settings",
  "settings.tab.profile": "Profile",
  "settings.tab.storage": "Storage",
  "settings.tab.security": "Security",
  "settings.tab.preferences": "Preferences",
  "settings.tab.about": "About",
  // preferences
  "prefs.appearance": "Appearance",
  "prefs.theme": "Theme",
  "prefs.theme.system": "System",
  "prefs.theme.light": "Light",
  "prefs.theme.dark": "Dark",
  "prefs.theme.help": "“System” follows your device's light or dark setting.",
  "prefs.language": "Language",
  "prefs.language.en": "English",
  "prefs.language.hi": "हिन्दी (Hindi)",
  "prefs.language.help": "Applies across the app's main navigation and settings.",
  // common
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.loading": "Loading…",
};

const hi: Dict = {
  "nav.myCloud": "मेरा क्लाउड",
  "nav.photos": "तस्वीरें",
  "nav.videos": "वीडियो",
  "nav.starred": "तारांकित",
  "nav.recent": "हाल के",
  "nav.trash": "कचरा",
  "nav.sharedWithMe": "मेरे साथ साझा",
  "nav.activity": "गतिविधि",
  "toolbar.newFolder": "नया फ़ोल्डर",
  "toolbar.upload": "अपलोड करें",
  "toolbar.uploadFolder": "फ़ोल्डर अपलोड करें",
  "toolbar.search": "सभी फ़ाइलें खोजें…  (/ दबाएँ)",
  "settings.back": "Nimbus पर वापस",
  "settings.title": "सेटिंग्स",
  "settings.tab.profile": "प्रोफ़ाइल",
  "settings.tab.storage": "भंडारण",
  "settings.tab.security": "सुरक्षा",
  "settings.tab.preferences": "प्राथमिकताएँ",
  "settings.tab.about": "परिचय",
  "prefs.appearance": "रूप",
  "prefs.theme": "थीम",
  "prefs.theme.system": "सिस्टम",
  "prefs.theme.light": "उजला",
  "prefs.theme.dark": "गहरा",
  "prefs.theme.help": "“सिस्टम” आपके डिवाइस की उजली या गहरी सेटिंग का अनुसरण करता है।",
  "prefs.language": "भाषा",
  "prefs.language.en": "English",
  "prefs.language.hi": "हिन्दी (Hindi)",
  "prefs.language.help": "ऐप के मुख्य नेविगेशन और सेटिंग्स में लागू होता है।",
  "common.save": "सहेजें",
  "common.cancel": "रद्द करें",
  "common.loading": "लोड हो रहा है…",
};

const DICTS: Record<Locale, Dict> = { en, hi };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: getLocale() returns "en" during the static-export
  // prerender (no localStorage) and the stored value once on the client
  // — the same pattern the rest of the app uses for local prefs.
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    setLocaleState(next);
    if (typeof document !== "undefined") document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: string) => DICTS[locale][key] ?? en[key] ?? key,
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
  );
}

export function useTranslation(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback so components used outside the provider (or during an
    // early render) still function in English rather than throwing.
    return { locale: "en", setLocale: () => {}, t: (key: string) => en[key] ?? key };
  }
  return ctx;
}
