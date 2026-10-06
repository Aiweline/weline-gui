import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { localeCatalog, normalizeLocale } from './catalog';

const stored = localStorage.getItem('weline.locale');
const initialLocale = normalizeLocale(stored || navigator.language || 'en');

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
  document.documentElement.lang = normalized;
  document.documentElement.dir = definition.direction;
  localStorage.setItem('weline.locale', normalized);
}

void applyLocale(initialLocale);

export default i18n;
