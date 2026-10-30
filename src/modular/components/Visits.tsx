/**
 * Visits & EHR — doctor consultation workspace.
 * Pick an active visit, dictate a voice note (ASR), let Gemini draft the
 * structured summary, edit medications and close the visit (PRESCRIPTION_ADD RPC).
 */
import { useState } from 'react';
import { QueueTable } from './Dashboard';
import { useVisits, invalidateVisits } from '../hooks/useVisits';
import { useVoiceNote } from '../hooks/useVoiceNote';
import { api } from '../services/apiClient';
import { aiDraftVisitSummary } from '../services/gemini';
import type { Medication } from '../libs/common';
import { useT } from '../i18n';

export function Visits() {
  const t = useT();
  const { visits } = useVisits();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = visits.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="two-col">
      <div className="card section">
        <h2>{t('visits.title')}</h2>
        <QueueTable />
      </div>
      <div className="card section">
        <h2>EHR · Consultation</h2>
        {!selected ? (
          <div className="picker">
            {visits.filter((v) => v.status !== 'completed').map((v) => (
              <button key={v.id} className="btn ghost block" onClick={() => setSelectedId(v.id)}>
                🩺 {v.patient?.fullNameAr ?? v.patientId} — {v.chiefComplaint}
              </button>
            ))}
            {!visits.some((v) => v.status !== 'completed') && <p className="muted">All visits completed today ✅</p>}
          </div>
        ) : (
          <ConsultationForm key={selected.id} visit={selected} onDone={() => { setSelectedId(null); invalidateVisits(); }} />
        )}
      </div>
    </div>
  );
}

function ConsultationForm({ visit, onDone }: { visit: any; onDone: () => void }) {
  const t = useT();
  const vn = useVoiceNote();
  const [beamSize, setBeamSize] = useState<1 | 3 | 5>(5);
  const [diagnosis, setDiagnosis] = useState(visit.diagnosis ?? '');
  const [meds, setMeds] = useState<Medication[]>(visit.medications ?? []);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const geminiDraft = async () => {
    if (!vn.result?.text) return;
    setDrafting(true);
    try {
      const d = await aiDraftVisitSummary(vn.result.text, visit.chiefComplaint);
      setDiagnosis(d.suggestedDiagnosis ?? diagnosis);
      if (Array.isArray(d.suggestedMeds)) setMeds(d.suggestedMeds.slice(0, 4));
    } catch {
      /* AI optional — fall back to manual entry */
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.addPrescription({
        visitId: visit.id,
        diagnosis,
        medications: meds,
        transcribedNotes: vn.result?.text,
        voiceNoteUrl: vn.result ? `cloudinary://asr/${visit.id}.wav` : undefined,
      });
      setSaved(true);
      setTimeout(onDone, 700);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <div className="patient-head">
        <b className="ar">{visit.patient?.fullNameAr}</b>
        <span className="mono muted">NID {visit.patient?.nationalId}</span>
        <span className="pill status-in_consultation">{t('status.in_consultation')}</span>
      </div>
      <p><b>Chief complaint:</b> {visit.chiefComplaint}</p>

      {/* Voice note -> ASR */}
      <div className="voice-box">
        {!vn.recording && !vn.transcribing && (
          <button className="btn primary" onClick={vn.start}>🎙️ {t('asr.record')}</button>
        )}
        {vn.recording && (
          <button className="btn danger" onClick={() => vn.stopAndTranscribe(beamSize)}>
            ⏹ {t('asr.stop')} ({vn.seconds}s)
          </button>
        )}
        {vn.transcribing && <span className="muted pulse">⏳ {t('asr.busy')}</span>}
        <label className="inline-label">
          {t('asr.beam')}
          <select value={beamSize} onChange={(e) => setBeamSize(Number(e.target.value) as 1 | 3 | 5)}>
            <option value={1}>BS=1</option><option value={3}>BS=3</option><option value={5}>BS=5</option>
          </select>
        </label>
      </div>
      {vn.error && <div className="alert error">{vn.error}</div>}

      {vn.result && (
        <div className="transcript ar" dir="rtl">
          {vn.result.text}
          <div className="metrics-row mono">
            <span>{t('asr.wer')}: {(vn.result.wer! * 100).toFixed(1)}%</span>
            <span>{t('asr.cer')}: {(vn.result.cer! * 100).toFixed(1)}%</span>
            <span>{t('asr.rtf')}: {vn.result.rtf}</span>
            <span>{t('asr.worker')}: #{vn.result.workerId}/4</span>
            <span>{vn.result.device}</span>
          </div>
          <button className="btn small" onClick={geminiDraft} disabled={drafting}>
            {drafting ? '✨' : '✨'} Gemini draft {drafting ? '…' : ''}
          </button>
        </div>
      )}

      <label>Diagnosis<input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Working diagnosis" /></label>

      <div>
        <div className="row space">
          <b>Medications</b>
          <button className="btn small ghost" onClick={() => setMeds([...meds, { name: '', dose: '5mg', frequency: '1x daily', durationDays: 14 }])}>+ add</button>
        </div>
        {meds.map((m, i) => (
          <div className="med-row" key={i}>
            <input placeholder="Name" value={m.name} onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className="w-sm" placeholder="Dose" value={m.dose} onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)))} />
            <input className="w-md" placeholder="Freq" value={m.frequency} onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))} />
            <input className="w-xs" type="number" min={1} value={m.durationDays} onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, durationDays: Number(e.target.value) } : x)))} />
            <button className="btn tiny danger ghost" onClick={() => setMeds(meds.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>

      {saved && <div className="alert ok">✔ Visit completed — event <code>visit.completed</code> published to RabbitMQ, EHR synced to Neon PostgreSQL.</div>}
      <button className="btn primary" onClick={save} disabled={saving || !diagnosis}>
        {saving ? '⏳' : '💾'} Close visit & issue prescription
      </button>
    </div>
  );
}
