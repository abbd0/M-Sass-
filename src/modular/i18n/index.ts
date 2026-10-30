import en from './en.json';
import ar from './ar.json';
import { useLocaleStore, type Locale } from '../stores/localeStore';

const bundles: Record<Locale, Record<string, string>> = { en, ar };

/** t('visits.title') — flat-key JSON locale bundles (en.json / ar.json) */
export function t(key: string): string {
  const { locale } = useLocaleStore.getState();
  return bundles[locale]?.[key] ?? bundles.en[key] ?? key;
}

/** React hook form so components re-render on locale switch */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: string) => bundles[locale]?.[key] ?? bundles.en[key] ?? key;
}
