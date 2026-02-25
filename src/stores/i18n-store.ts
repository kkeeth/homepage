import observable, { type ObservableInstance } from '@riotjs/observable';
import en from '@/locales/en.json';
import ja from '@/locales/ja.json';

const STORAGE_KEY = 'preferred-language';

type Locale = 'ja' | 'en';

const translations: Record<Locale, Record<string, unknown>> = { ja, en };

interface I18nStore extends ObservableInstance<unknown> {
  currentLocale: Locale;
  t(key: string): string;
  setLocale(locale: string): void;
  getAvailableLocales(): string[];
}

const i18nStore = observable({
  currentLocale: (localStorage.getItem(STORAGE_KEY) || 'ja') as Locale,

  t(this: I18nStore, key: string): string {
    const keys = key.split('.');
    let value: unknown = translations[this.currentLocale];
    for (const k of keys) {
      if (typeof value !== 'object' || value === null) return key;
      value = (value as Record<string, unknown>)[k];
    }
    return typeof value === 'string' ? value : key;
  },

  setLocale(this: I18nStore, locale: string): void {
    if (locale in translations) {
      this.currentLocale = locale as Locale;
      localStorage.setItem(STORAGE_KEY, locale);
      this.trigger('locale-changed');
    }
  },

  getAvailableLocales(): string[] {
    return Object.keys(translations);
  },
}) as unknown as I18nStore;

export default i18nStore;
