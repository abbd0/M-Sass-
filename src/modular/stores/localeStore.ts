/**
 * localeStore — i18n + RTL state (Zustand).
 * Mirrors the Next.js middleware-driven locale routing (/en/ vs /ar/):
 * switching locale flips <html lang dir> so the whole Tailwind layout
 * re-flips automatically for RTL Arabic.
 */
import { create } from 'zustand';

export type Locale = 'en' | 'ar';

interface LocaleState {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
}

const applyDom = (l: Locale) => {
  const html = document.documentElement;
  html.lang = l;
  html.dir = l === 'ar' ? 'rtl' : 'ltr';
  try {
    localStorage.setItem('medistream.locale', l); // offline persistence
  } catch {}
};

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: (localStorage.getItem('medistream.locale') as Locale) || 'en',
  dir: localStorage.getItem('medistream.locale') === 'ar' ? 'rtl' : 'ltr',
  setLocale: (locale) => {
    applyDom(locale);
    set({ locale, dir: locale === 'ar' ? 'rtl' : 'ltr' });
  },
  toggleLocale: () => get().setLocale(get().locale === 'en' ? 'ar' : 'en'),
}));
