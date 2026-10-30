/**
 * Voice Notes page — standalone ASR playground for dictation quality metrics.
 */
import { useState } from 'react';
import { useVoiceNote } from '../hooks/useVoiceNote';
import { useT } from '../i18n';

export function AsrPage() {
  const t = useT();
  const vn = useVoiceNote();
  const [beamSize, setBeamSize] = useState<1 | 3 | 5>(5);

  return (
    <div className="center-col">
      <div className="card section wide">
        <h2>🎙️ {t('asr.title')}</h2>
        <p className="muted">{t('asr.desc')}</p>

        <div className="row gap wrap center-v">
          {!vn.recording && !vn.transcribing && (
            <button className="btn primary big" onClick={vn.start}>● {t('asr.record')}</button>
          )}
          {vn.recording && (
            <button className="btn danger big rec-pulse" onClick={() => vn.stopAndTranscribe(beamSize)}>
              ⏹ {t('asr.stop')} — {String(Math.floor(vn.seconds / 60)).padStart(2, '0')}:{String(vn.seconds % 60).padStart(2, '0')}
            </button>
          )}
          {vn.transcribing && <span className="muted pulse">⏳ {t('asr.busy')}</span>}
          <label className="inline-label">
            {t('asr.beam')}
            <select value={beamSize} onChange={(e) => setBeamSize(Number(e.target.value) as 1 | 3 | 5)}>
              <option value={1}>BS=1 (fastest)</option>
              <option value={3}>BS=3</option>
              <option value={5}>BS=5 (best WER)</option>
            </select>
          </label>
        </div>

        {vn.error && <div className="alert error">{vn.error}</div>}

        {vn.result && (
          <>
            <div className="transcript ar" dir="rtl">{vn.result.text}</div>
            <div className="metrics-grid mono">
              <div><b>{t('asr.wer')}</b>{(vn.result.wer! * 100).toFixed(1)}%</div>
              <div><b>{t('asr.cer')}</b>{(vn.result.cer! * 100).toFixed(1)}%</div>
              <div><b>{t('asr.rtf')}</b>{vn.result.rtf}</div>
              <div><b>Model</b>{vn.result.model}</div>
              <div><b>Device</b>{vn.result.device}</div>
              <div><b>{t('asr.worker')}</b>#{vn.result.workerId + 1}/4</div>
              <div><b>Duration</b>{vn.result.durationSec}s</div>
              <div><b>Beam</b>BS={vn.result.beamSize}</div>
            </div>
          </>
        )}

        <p className="hint mono">
          Pipeline: MediaRecorder → lamejs MP3 → cloud-storage svc (Cloudinary) → RabbitMQ `asr_transcribe` →
          FFmpeg 16kHz mono WAV → faster-whisper large-v3 (CUDA fp16/int8, CPU fallback) → thread-safe acks
        </p>
      </div>
    </div>
  );
}
