import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { localeCatalog, normalizeLocale } from './catalog';

const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('weline.locale');
const navigatorLanguage = typeof navigator === 'undefined' ? 'en' : navigator.language;
const initialLocale = normalizeLocale(stored || navigatorLanguage || 'en');

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(localeCatalog).map(([locale, definition]) => [locale, { translation: definition.messages }]),
  ),
  lng: initialLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function applyLocale(locale: string): Promise<void> {
  const normalized = normalizeLocale(locale);
  await i18n.changeLanguage(normalized);
  const definition = localeCatalog[normalized];
  if (typeof document !== 'undefined') {
    document.documentElement.lang = normalized;
    document.documentElement.dir = definition.direction;
    const brand = definition.messages.brand;
    document.title = `${brand.name} ${brand.product}`;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('weline.locale', normalized);
  }
}

/**
 * UI locale preference: sticky user choice → system → optional agent fallback.
 * Never let host/agent language overwrite an explicit user (or first-paint system) choice.
 */
export function preferredUiLocale(agentLanguage?: string | null): string {
  if (typeof localStorage !== 'undefined') {
    const sticky = localStorage.getItem('weline.locale');
    if (sticky) return normalizeLocale(sticky);
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalizeLocale(navigator.language);
  }
  if (agentLanguage) return normalizeLocale(agentLanguage);
  return 'en';
}

void applyLocale(initialLocale);

export default i18n;
