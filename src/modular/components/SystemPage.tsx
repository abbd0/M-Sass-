/**
 * System & Security page — live isUp health probes for the 7 microservices,
 * architecture map and the security/observability checklist.
 */
import { useEffect, useState } from 'react';
import { api } from '../services/apiClient';
import type { ServiceHealth } from '../libs/common';
import { ehrCache } from '../services/offlineCache';
import { useT } from '../i18n';

export function SystemPage() {
  const t = useT();
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [queued, setQueued] = useState(ehrCache.readQueue().length);

  const probe = () => api.healthProbe().then(setHealth);
  useEffect(() => {
    probe();
    const i = setInterval(probe, 15000); // periodic health checks like uptime monitoring
    return () => clearInterval(i);
  }, []);
  useEffect(() => setQueued(ehrCache.readQueue().length), []);

  return (
    <div className="stack">
      <div className="card section">
        <div className="section-head">
          <h2>🖥️ {t('sys.title')}</h2>
          <button className="btn small ghost" onClick={probe}>↻ re-probe</button>
        </div>
        <div className="svc-grid">
          {health.map((s) => (
            <div key={s.name} className={`svc ${s.isUp ? 'up' : 'down'}`}>
              <span className={`dot ${s.isUp ? 'ok' : 'bad'}`} />
              <b>{s.name}</b>
              <span className="mono muted">:{s.port}</span>
              <span className={`tag ${s.kind}`}>{s.kind}</span>
              <span className="mono">{s.latencyMs} ms</span>
            </div>
          ))}
          <div className="svc up">
            <span className="dot ok" />
            <b>rabbitmq</b><span className="mono muted">:5672</span>
            <span className="tag infra">broker</span>
            <span className="mono">durable queues</span>
          </div>
          <div className="svc up">
            <span className="dot ok" />
            <b>neon-postgres</b><span className="mono muted">:5432</span>
            <span className="tag infra">TypeORM</span>
            <span className="mono">EHR store</span>
          </div>
        </div>
        <div className={`alert ${navigator.onLine ? 'ok' : 'error'}`}>
          {navigator.onLine ? `🟢 ${t('sys.online')}` : `🔴 ${t('sys.offline')} (${queued} pending)`}
        </div>
      </div>

      <div className="two-col">
        <div className="card section">
          <h2>🧱 {t('sys.arch')}</h2>
          <pre className="arch mono">{`Monorepo (Nest CLI workspace)
├─ apps/
│  ├─ api-gateway   NestJS  REST → RabbitMQ RPC (Throttler 40/2min)
│  ├─ auth          NestJS  Passport·JWT HS256·bcrypt(12)
│  ├─ doctor        NestJS  visits · prescriptions · EHR
│  ├─ super-admin   NestJS  clinic-wide administration
│  ├─ cloud-storage NestJS  Cloudinary assets
│  ├─ ocr           Python  YOLO OBB + PaddleOCR(ar)
│  │                        CUDA 362ms ↔ OpenVINO CPU 1578ms
│  └─ asr           Python  faster-whisper large-v3
│                         FFmpeg 16k mono · 4-worker pool
├─ libs/common      @app/shared kernel (Zod DTOs, patterns)
└─ frontend         Next.js 14 App Router · Zustand · React Query
                    Tailwind + Shadcn · /en|/ar RTL middleware · sw.ts
Infra: Docker(node:24-alpine / CUDA base) · docker-compose.prod
       Nginx TLS(Let's Encrypt) · private net over Tailscale mesh`}</pre>
        </div>
        <div className="card section">
          <h2>🛡️ {t('sys.security')}</h2>
          <ul className="checklist">
            <li>✔ JWT HS256 — issuer/audience verified, signed <code>httpOnly</code> cookie</li>
            <li>✔ bcrypt password hashing — 12 rounds</li>
            <li>✔ RBAC — <code>@Roles</code> metadata + <code>JwtAuthGuard</code> reflector</li>
            <li>✔ Nginx reverse proxy — TLS 1.2/1.3, HTTPS 301 redirects, Let's Encrypt</li>
            <li>✔ Helmet security headers · CORS origin binding</li>
            <li>✔ Throttler rate limit — 40 req / 2 min per client</li>
            <li>✔ ValidationPipe + class-validator DTOs · 14-digit NID regex</li>
            <li>✔ Winston daily timestamped logs (LoggingMiddleware/Interceptor)</li>
            <li>✔ <code>isUp</code> health probes on every service</li>
            <li>✔ Private Docker network over Tailscale mesh</li>
            <li>✔ Multi-stage Alpine builds · Docker Hub registry</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
