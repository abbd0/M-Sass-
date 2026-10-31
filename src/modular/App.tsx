/**
 * App shell — layout, locale-aware nav (en/ar with RTL flip), auth gate.
 */
import { useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useLocaleStore } from './stores/localeStore';
import { useT } from './i18n';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Visits } from './components/Visits';
import { OcrPage } from './components/OcrPage';
import { AsrPage } from './components/AsrPage';
import { SystemPage } from './components/SystemPage';

type Page = 'dashboard' | 'visits' | 'ocr' | 'asr' | 'system';

export function App() {
  const t = useT();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { locale, toggleLocale } = useLocaleStore();
  const [page, setPage] = useState<Page>('dashboard');

  if (!isAuthenticated) {
    return (
      <div className={`app ${locale === 'ar' ? 'rtl' : ''}`}>
        <TopBar minimal />
        <Login />
      </div>
    );
  }

  const navItems: Array<[Page, string, string]> = [
    ['dashboard', '📊', 'nav.dashboard'],
    ['visits', '🩺', 'nav.visits'],
    ['ocr', '📷', 'nav.ocr'],
    ['asr', '🎙️', 'nav.asr'],
    ['system', '🛡️', 'nav.system'],
  ];

  return (
    <div className={`app ${locale === 'ar' ? 'rtl' : ''}`}>
      <TopBar />
      <div className="shell">
        <aside className="sidebar card">
          {navItems.map(([id, icon, key]) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <span>{icon}</span> {t(key)}
            </button>
          ))}
          <div className="role-badge mono">@Roles: {user!.role}</div>
        </aside>
        <main className="content">
          {page === 'dashboard' && <Dashboard />}
          {page === 'visits' && <Visits />}
          {page === 'ocr' && <OcrPage />}
          {page === 'asr' && <AsrPage />}
          {page === 'system' && <SystemPage />}
        </main>
      </div>
    </div>
  );
}

function TopBar({ minimal = false }: { minimal?: boolean }) {
  const t = useT();
  const { user, logout } = useAuthStore();
  const { locale, toggleLocale } = useLocaleStore();
  return (
    <header className="topbar">
      <div className="row gap">
        <span className="logo-cross">✚</span>
        <div>
          <h1 className="title">{t('app.title')}</h1>
          <p className="subtitle">{t('app.subtitle')}</p>
        </div>
      </div>
      <div className="row gap">
        <button className="btn small ghost" onClick={toggleLocale} title="Toggle EN/AR + RTL">
          🌐 {locale === 'en' ? 'العربية' : 'English'}
        </button>
        {!minimal && user && (
          <div className="row gap user-chip">
            <span className="mono">{user.name}</span>
            <button className="btn small danger ghost" onClick={logout}>{t('nav.logout')}</button>
          </div>
        )}
      </div>
    </header>
  );
}
