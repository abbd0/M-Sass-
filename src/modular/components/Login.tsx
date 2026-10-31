/**
 * Login screen — routes through the `auth` microservice pattern:
 * ValidationPipe-equivalent Zod parse -> RPC auth_login -> bcrypt check ->
 * JWT (HS256, iss/aud verified) set in signed httpOnly cookie.
 */
import React, { useState } from 'react'; // React default import required for React.FormEvent type
import { LoginDtoSchema, NATIONAL_ID_REGEX } from '../libs/common';
import { api } from '../services/apiClient';
import { useAuthStore } from '../stores/authStore';
import { useT } from '../i18n';

export function Login() {
  const t = useT();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('doctor@medistream.eg');
  const [password, setPassword] = useState('Cardio#Doc1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Same schema the NestJS gateway ValidationPipe uses on class-validator DTOs
    const parsed = LoginDtoSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    setPending(true);
    try {
      const res = await api.login(parsed.data);
      login(res.user); // session token stays in httpOnly cookie — never in JS
    } catch {
      setError(t('auth.error'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand-row">
          <span className="logo-cross">✚</span>
          <h1>{t('app.title')}</h1>
        </div>
        <p className="muted">{t('app.subtitle')}</p>
        <label>
          {t('auth.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          {t('auth.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary" disabled={pending}>
          {pending ? '⏳' : '🔐'} {t('auth.submit')}
        </button>
        <p className="hint">{t('auth.hint')}</p>
        <p className="hint mono">RBAC roles: super_admin · doctor · receptionist · patient — enforced by @Roles + JwtAuthGuard</p>
      </form>
    </div>
  );
}

/* Re-export so the registration form can reuse the shared regex */
export { NATIONAL_ID_REGEX };
