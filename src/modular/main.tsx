/**
 * Entry point + progressive service worker registration (sw.ts equivalent).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Apply persisted locale/RTL before first paint (mirrors Next.js middleware)
try {
  const l = localStorage.getItem('medistream.locale');
  if (l === 'ar') {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }
} catch {}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Progressive Web Service Worker — offline shell caching & background sync.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/src/sw.ts').catch(() => {
      /* SW not supported in this preview context — app still works online */
    });
  });
}
