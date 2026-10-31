/**
 * National ID OCR page — camera/upload capture -> Cloudinary -> YOLO OBB + PaddleOCR
 * worker over RabbitMQ -> auto-filled registration form (Zod-validated).
 */
import { useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useScanNationalId } from '../hooks/useScanNationalId';
import { aiCheckNationalId } from '../services/gemini';
import { NationalIdSchema, NATIONAL_ID_REGEX } from '../libs/common';
import { useT } from '../i18n';

export function OcrPage() {
  const t = useT();
  const cam = useCamera();
  const scan = useScanNationalId();
  const [form, setForm] = useState({ nationalId: '', fullNameAr: '', fullNameEn: '', gender: 'male', birthDate: '', address: '', phone: '' });
  const [nidError, setNidError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  /* Apply OCR result onto the registration form */
  const applyResult = (r: NonNullable<typeof scan.result>) => {
    setForm((f) => ({
      ...f,
      nationalId: r.nationalNumber ?? f.nationalId,
      fullNameAr: r.nameAr ?? f.fullNameAr,
      fullNameEn: r.nameEn ?? f.fullNameEn,
      birthDate: r.birthDate ?? f.birthDate,
      gender: r.gender ?? f.gender,
      address: r.addressAr ?? f.address,
    }));
    if (r.nationalNumber) {
      const ok = NationalIdSchema.safeParse(r.nationalNumber).success;
      setNidError(ok ? null : 'OCR digits failed 14-digit validation — verify manually');
    }
  };

  const runScan = async (dataUrl?: string) => {
    const r = await scan.scan(dataUrl);
    if (r) applyResult(r);
  };

  const captureAndScan = () => {
    const frame = cam.capture();
    cam.stop();
    runScan(frame ?? undefined);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    runScan(url);
  };

  const manualCheck = (v: string) => {
    setForm((f) => ({ ...f, nationalId: v }));
    const parsed = NATIONAL_ID_REGEX.test(v.trim());
    setNidError(v.length === 0 ? null : parsed ? null : 'Must be exactly 14 digits (starts 1-9)');
  };

  const geminiVerify = async () => {
    if (!scan.result) return;
    setAiNote('…');
    try {
      setAiNote(await aiCheckNationalId(scan.result));
    } catch {
      setAiNote('Gemini verification unavailable in this environment.');
    }
  };

  return (
    <div className="two-col">
      <div className="card section">
        <h2>📷 {t('ocr.title')}</h2>
        <p className="muted">{t('ocr.desc')}</p>

        <div className="camera-box">
          {cam.active ? (
            <video ref={cam.videoRef} playsInline muted className="camera-video" />
          ) : (
            <div className="camera-placeholder">{filePreview ? <img src={filePreview} alt="ID" /> : '🪪'}</div>
          )}
        </div>
        {cam.error && <div className="alert error">{cam.error} — you can still upload or use the demo card.</div>}

        <div className="row gap wrap">
          {!cam.active ? (
            <button className="btn ghost" onClick={cam.start}>🎥 {t('ocr.camera')}</button>
          ) : (
            <button className="btn danger" onClick={captureAndScan}>📸 Capture & scan</button>
          )}
          <label className="btn ghost file-btn">
            📁 Upload image<input type="file" accept="image/*" onChange={onFile} hidden />
          </label>
          <button className="btn primary" onClick={() => runScan()} disabled={scan.status === 'scanning' || scan.status === 'uploading'}>
            ✨ {t('ocr.scan')}
          </button>
        </div>

        {(scan.status === 'uploading' || scan.status === 'scanning') && (
          <div className="alert pulse">⏳ {scan.status === 'uploading' ? t('ocr.uploading') : t('ocr.scanning')}</div>
        )}

        {scan.result && (
          <div className="result-grid">
            <div><b>{t('ocr.backend')}</b><span className={`pill ${scan.result.backend === 'pytorch-cuda' ? 'ok' : 'warn'}`}>{scan.result.backend}</span></div>
            <div><b>{t('ocr.ms')}</b><span className="mono">{scan.result.inferenceMs} ms</span></div>
            <div><b>mAP@0.5</b><span className="mono">{(scan.result.map05 * 100).toFixed(1)}%</span></div>
            <div><b>Recall</b><span className="mono">{(scan.result.recall * 100).toFixed(1)}%</span></div>
            <button className="btn small" onClick={geminiVerify}>🤖 {t('ocr.check')}</button>
          </div>
        )}
        {aiNote && <div className="alert ai ar" dir="rtl">{aiNote}</div>}
        <p className="hint mono">Pipeline: YOLO11m OBB → digits sorted by cx left→right → PaddleOCR(lang='ar') → Zod OcrResultSchema</p>
      </div>

      <div className="card section">
        <h2>Patient registration (auto-filled)</h2>
        <div className="stack">
          <label>
            National ID <span className="mono">(14 digits)</span>
            <input value={form.nationalId} onChange={(e) => manualCheck(e.target.value)} maxLength={14} className="mono" placeholder="2xxxxxxxxxxxxx" />
            {nidError && <small className="err">{nidError}</small>}
          </label>
          <label>الاسم بالعربية<input className="ar" dir="rtl" value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} /></label>
          <label>Name (EN)<input value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} /></label>
          <div className="row gap">
            <label>Gender
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="male">Male</option><option value="female">Female</option>
              </select>
            </label>
            <label>Birth date<input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></label>
          </div>
          <label>Address (AR)<input className="ar" dir="rtl" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01xxxxxxxxx" maxLength={11} /></label>
          <button
            className="btn primary"
            disabled={!form.nationalId || !form.fullNameAr || !!nidError}
            onClick={() => alert(`POST /api/patients → patient_create RPC\nTypeORM insert into Neon PostgreSQL\nevent: patient.registered`)}
          >
            🧍 Register patient
          </button>
        </div>
      </div>
    </div>
  );
}
