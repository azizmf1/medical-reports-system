import React, { createContext, useContext, useEffect, useState } from 'react';
import en from './en.json';
import ar from './ar.json';

const dicts = { en, ar };
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem('mrms_lang') || 'ar');

  useEffect(() => {
    localStorage.setItem('mrms_lang', lang);
    // Arabic renders full RTL: the whole layout direction flips.
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const t = (key, params = {}) => {
    let s = dicts[lang][key] ?? dicts.en[key] ?? key;
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v ?? '');
    return s;
  };
  // Pick the right language variant from a bilingual object ({label_en,label_ar} etc.)
  const pick = (obj, base) => (lang === 'ar' ? obj?.[`${base}_ar`] : obj?.[`${base}_en`]) ?? '';
  const toggle = () => setLang(lang === 'ar' ? 'en' : 'ar');

  return <I18nContext.Provider value={{ lang, t, pick, toggle }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
