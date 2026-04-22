// i18n configuration.
//
// Hebrew is the default source language; English is the first target.
// Keys are grouped by feature namespace (nav, auth, dashboard, customers,
// properties, owners, deals, reports, activity, reminders, office,
// settings, profile, shared, errors, toasts, public.prospectSign,
// public.landing, public.agentPortal).
//
// Usage in a component:
//   import { useTranslation } from 'react-i18next';
//   const { t } = useTranslation();
//   <button>{t('shared.buttons.save')}</button>
//
// Interpolation:
//   t('dashboard.counters.hotLeads', { count: 3 })
//   → "3 לידים חמים ממתינים"
//
// Switch language at runtime:
//   i18n.changeLanguage('en');
// The app persists the choice in localStorage (key `estia-lang`); the
// default is Hebrew. dir="rtl" / "ltr" is applied on <html> when the
// language flips — see applyLangDir().

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Hebrew resources — eager-imported so the first paint has copy and no
// loading flash on the default language. Keep bundles small enough to
// make this cheap (all he/*.json together ≤ 80KB zipped even for the
// full product).
import heNav         from './locales/he/nav.json';
import heAuth        from './locales/he/auth.json';
import heDashboard   from './locales/he/dashboard.json';
import heShared      from './locales/he/shared.json';
import heCustomers   from './locales/he/customers.json';
import heProperties  from './locales/he/properties.json';
import heOwners      from './locales/he/owners.json';
import heDeals       from './locales/he/deals.json';
import heReports     from './locales/he/reports.json';
import heActivity    from './locales/he/activity.json';
import heReminders   from './locales/he/reminders.json';
import heOffice      from './locales/he/office.json';
import heSettings    from './locales/he/settings.json';
import heProfile     from './locales/he/profile.json';
import heErrors      from './locales/he/errors.json';
import heToasts      from './locales/he/toasts.json';
import hePublic      from './locales/he/public.json';

// English stubs — empty objects for now. As keys are filled in, they
// override the Hebrew fallback. fallbackLng below keeps the UI in
// Hebrew for any English key that's still missing, so switching to
// English is safe from day one.
import enNav         from './locales/en/nav.json';
import enAuth        from './locales/en/auth.json';
import enDashboard   from './locales/en/dashboard.json';
import enShared      from './locales/en/shared.json';
import enCustomers   from './locales/en/customers.json';
import enProperties  from './locales/en/properties.json';
import enOwners      from './locales/en/owners.json';
import enDeals       from './locales/en/deals.json';
import enReports     from './locales/en/reports.json';
import enActivity    from './locales/en/activity.json';
import enReminders   from './locales/en/reminders.json';
import enOffice      from './locales/en/office.json';
import enSettings    from './locales/en/settings.json';
import enProfile     from './locales/en/profile.json';
import enErrors      from './locales/en/errors.json';
import enToasts      from './locales/en/toasts.json';
import enPublic      from './locales/en/public.json';

export const SUPPORTED_LANGS = ['he', 'en'];
export const DEFAULT_LANG = 'he';
const LANG_STORAGE_KEY = 'estia-lang';

function storedLang() {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    if (SUPPORTED_LANGS.includes(v)) return v;
  } catch { /* jsdom / SSR */ }
  return DEFAULT_LANG;
}

export function applyLangDir(lang) {
  // Hebrew / Arabic → RTL. English / everything else → LTR.
  const rtl = lang === 'he' || lang === 'ar';
  try {
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  } catch { /* jsdom */ }
}

i18n
  .use(initReactI18next)
  .init({
    lng: storedLang(),
    fallbackLng: 'he',
    supportedLngs: SUPPORTED_LANGS,
    // Split keys with `:` for namespace, `.` for nesting. Default.
    nsSeparator: ':',
    keySeparator: '.',
    interpolation: {
      // React already escapes, so i18next shouldn't.
      escapeValue: false,
    },
    // Per-namespace resource map. Namespaces match the JSON file names.
    resources: {
      he: {
        nav:        heNav,
        auth:       heAuth,
        dashboard:  heDashboard,
        shared:     heShared,
        customers:  heCustomers,
        properties: heProperties,
        owners:     heOwners,
        deals:      heDeals,
        reports:    heReports,
        activity:   heActivity,
        reminders:  heReminders,
        office:     heOffice,
        settings:   heSettings,
        profile:    heProfile,
        errors:     heErrors,
        toasts:     heToasts,
        public:     hePublic,
      },
      en: {
        nav:        enNav,
        auth:       enAuth,
        dashboard:  enDashboard,
        shared:     enShared,
        customers:  enCustomers,
        properties: enProperties,
        owners:     enOwners,
        deals:      enDeals,
        reports:    enReports,
        activity:   enActivity,
        reminders:  enReminders,
        office:     enOffice,
        settings:   enSettings,
        profile:    enProfile,
        errors:     enErrors,
        toasts:     enToasts,
        public:     enPublic,
      },
    },
    defaultNS: 'shared',
    ns: [
      'nav', 'auth', 'dashboard', 'shared', 'customers', 'properties',
      'owners', 'deals', 'reports', 'activity', 'reminders', 'office',
      'settings', 'profile', 'errors', 'toasts', 'public',
    ],
    react: {
      useSuspense: false,
    },
  });

// Apply dir on boot + on every language change.
applyLangDir(i18n.language);
i18n.on('languageChanged', (lang) => {
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* ignore */ }
  applyLangDir(lang);
});

export default i18n;
