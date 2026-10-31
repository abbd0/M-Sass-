/**
 * Dashboard — super-admin KPIs served by the `super-admin` service
 * (CLINIC_STATS RPC) plus the outpatient queue from `useVisits` (React-Query-style).
 */
import { useEffect, useState } from 'react';
import { api } from '../services/apiClient';
import { useVisits } from '../hooks/useVisits';
import { useT } from '../i18n';

export function Dashboard() {
  const t = useT();
  const { visits, isFetching, isStale, refetch } = useVisits();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.clinicStats().then(setStats);
  }, []);

  const kpis = [
    { label: t('dash.patients'), value: stats?.patients ?? '—', icon: '🧍' },
    { label: t('dash.today'), value: stats?.todayVisits ?? visits.length, icon: '🗓️' },
    { label: t('dash.completed'), value: stats?.completed ?? '—', icon: '✅' },
    { label: t('dash.avg'), value: stats?.avgConsultMin ?? '—', icon: '⏱️' },
    { label: t('dash.map'), value: stats ? `${(stats.ocrAccuracyMap05 * 100).toFixed(1)}%` : '—', icon: '📷' },
    { label: t('dash.wer'), value: stats ? `${(stats.asrWer * 100).toFixed(1)}%` : '—', icon: '🎙️' },
  ];

  return (
    <div>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="card kpi" key={k.label}>
            <span className="kpi-icon">{k.icon}</span>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="card section">
        <div className="section-head">
          <h2>{t('visits.title')}</h2>
          <div className="row gap">
            <span className={`pill ${isStale ? 'warn' : 'ok'}`}>{isStale ? t('visits.stale') : t('visits.fresh')}</span>
            <button className="btn small" onClick={refetch} disabled={isFetching}>
              {isFetching ? '⟳' : '↻'} {t('visits.refresh')}
            </button>
          </div>
        </div>
        <QueueTable />
      </div>
    </div>
  );
}

/* Shared queue table used by Dashboard + Visits page */
export function QueueTable() {
  const t = useT();
  const { visits, isFetching } = useVisits();
  if (isFetching && !visits.length) return <div className="muted center pad">Loading from doctor service…</div>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t('col.patient')}</th>
            <th>{t('col.nid')}</th>
            <th>{t('col.doctor')}</th>
            <th>{t('col.complaint')}</th>
            <th>{t('col.diagnosis')}</th>
            <th>{t('col.meds')}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr key={v.id}>
              <td className="ar strong">{v.patient?.fullNameAr ?? v.patientId}</td>
              <td className="mono">{v.patient?.nationalId ?? '—'}</td>
              <td className="ar">{v.doctorName}</td>
              <td>{v.chiefComplaint || '—'}</td>
              <td>{v.diagnosis || '—'}</td>
              <td>{v.medications.map((m) => `${m.name} ${m.dose}`).join(', ') || '—'}</td>
              <td>
                <span className={`pill status-${v.status}`}>{t(`status.${v.status}`)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
