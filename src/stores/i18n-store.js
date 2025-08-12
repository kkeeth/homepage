import observable from '@riotjs/observable';
import en from '@/locales/en.json';
import ja from '@/locales/ja.json';

const STORAGE_KEY = 'preferred-language';

const translations = {
  en,
  ja,
};

const i18nStore = observable({
  currentLocale: localStorage.getItem(STORAGE_KEY) || 'en',

  t(key) {
    const keys = key.split('.');
    let value = translations[this.currentLocale];

    for (const k of keys) {
      value = value[k];
      if (!value) return key;
    }

    return value;
  },

  setLocale(locale) {
    if (translations[locale]) {
      this.currentLocale = locale;
      localStorage.setItem(STORAGE_KEY, locale);
      this.trigger('locale-changed');
    }
  },

  getAvailableLocales() {
    return Object.keys(translations);
  },
});

export default i18nStore;
