/**
 * Medistream OCMS — Google AI Studio app entry point.
 *
 * Single-file bundle of the AI-Enhanced Outpatient Clinics Management System:
 *   • Zustand stores (authStore, localeStore)       • shared-kernel schemas & validators
 *   • React-Query-style useVisits (SWR + invalidation)• OCR & ASR pipelines over a mock RabbitMQ bus
 *   • EN/AR i18n with automatic RTL flip             • offline cache + background sync queue
 *   • Gemini (@google/genai) clinical AI features    • 7-microservice isUp health map
 *
 * A fully modular version of this same app lives in src/modular/ (mirrors the
 * monorepo layout: libs/common kernel, stores/, hooks/, services/, components/,
 * i18n/, sw.ts) plus reference Python workers in apps/ocr and apps/asr.
 */

/* ===================== 1. IMPORTS ======================================== */
import React from 'react'; // required: hooks are referenced as React.useState etc.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { create } from 'zustand';
import { GoogleGenAI, Type } from '@google/genai';

const API_KEY = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;

/* ===================== 2. SHARED KERNEL (libs/common equivalent) ========= */
const NATIONAL_ID_REGEX = /^[1-9]\d{13}$/; // 14-digit Egyptian National ID
const ROLES = ['super_admin', 'doctor', 'receptionist', 'patient'];

const MESSAGE_PATTERNS = {
  AUTH_LOGIN: 'auth_login',
  PATIENT_CREATE: 'patient_create',
  VISIT_LIST: 'doctor_visit_list',
  VISIT_CREATE: 'doctor_visit_create',
  PRESCRIPTION_ADD: 'doctor_prescription_add',
  CLINIC_STATS: 'superadmin_clinic_stats',
  OCR_SCAN_ID: 'ocr_scan_id',
  ASR_TRANSCRIBE: 'asr_transcribe',
  STORAGE_UPLOAD: 'storage_upload',
};
const EHR_EVENTS = {
  PATIENT_REGISTERED: 'patient.registered',
  VISIT_STARTED: 'visit.started',
  VISIT_COMPLETED: 'visit.completed',
  PRESCRIPTION_ISSUED: 'prescription.issued',
  OCR_COMPLETED: 'ocr.completed',
  ASR_COMPLETED: 'asr.completed',
};

/* Lightweight validators mirroring the Zod DTOs of the backend ValidationPipe */
const validators = {
  login: (v) => {
    const errs = [];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email || '')) errs.push('Invalid email');
    if ((v.password || '').length < 8) errs.push('Password must be ≥ 8 characters');
    return { ok: !errs.length, errors: errs };
  },
  nationalId: (v) => NATIONAL_ID_REGEX.test((v || '').trim()),
  phone: (v) => /^01[0125]\d{8}$/.test((v || '').trim()),
};

/* ===================== 3. i18n LOCALE BUNDLES (en.json / ar.json) ======== */
const L = {
  en: {
    'app.title': 'Medistream OCMS',
    'app.subtitle': 'AI-Enhanced Outpatient Clinics Management System',
    'nav.dashboard': 'Dashboard', 'nav.visits': 'Visits & EHR', 'nav.ocr': 'National ID Scan',
    'nav.asr': 'Voice Notes', 'nav.system': 'System & Security', 'nav.logout': 'Logout',
    'auth.email': 'Email', 'auth.password': 'Password',
    'auth.submit': 'Login via auth service (JWT httpOnly)',
    'auth.hint': 'Demo: doctor@medistream.eg / Cardio#Doc1 · admin@medistream.eg / Super#Admin1 · reception@medistream.eg / Reception1',
    'auth.error': 'Invalid credentials (bcrypt 12 rounds verified server-side)',
    'dash.patients': 'Registered patients', 'dash.today': "Today's visits", 'dash.completed': 'Completed',
    'dash.avg': 'Avg consult (min)', 'dash.map': 'OCR mAP@0.5', 'dash.wer': 'ASR WER',
    'visits.title': 'Outpatient queue', 'visits.refresh': 'Refetch (SWR)',
    'visits.stale': 'cache stale — revalidating', 'visits.fresh': 'cache fresh',
    'status.waiting': 'Waiting', 'status.in_consultation': 'In consultation',
    'status.completed': 'Completed', 'status.cancelled': 'Cancelled',
    'col.patient': 'Patient', 'col.nid': 'National ID', 'col.doctor': 'Doctor',
    'col.complaint': 'Chief complaint', 'col.diagnosis': 'Diagnosis', 'col.meds': 'Medications', 'col.status': 'Status',
    'ocr.title': 'Egyptian National ID reader',
    'ocr.desc': 'YOLO OBB digit detection + PaddleOCR (ar) — auto-fills the registration form.',
    'ocr.camera': 'Open camera', 'ocr.capture': 'Capture & scan', 'ocr.upload': 'Upload image',
    'ocr.scan': 'Scan demo card', 'ocr.uploading': 'Uploading to Cloudinary…',
    'ocr.scanning': 'Running inference on OCR worker…', 'ocr.backend': 'Inference backend', 'ocr.ms': 'Inference time',
    'ocr.check': 'Verify with Gemini AI', 'ocr.register': 'Register patient',
    'ocr.registered': '✔ Patient registered → patient_create RPC → TypeORM insert into Neon PostgreSQL · event patient.registered',
    'asr.title': 'Doctor voice-note transcriber',
    'asr.desc': 'Record dictation → Cloudinary → faster-whisper large-v3 over RabbitMQ.',
    'asr.record': 'Start dictation', 'asr.stop': 'Stop & transcribe',
    'asr.busy': 'Transcribing (FFmpeg 16kHz mono → whisper)…', 'asr.beam': 'Beam size',
    'sys.title': 'Microservices mesh health (isUp probes)', 'sys.arch': 'Architecture', 'sys.security': 'Security & Observability',
    'sys.online': 'Online — sync queue empty', 'sys.offline': 'OFFLINE — mutations queued for background sync',
    'ehr.consult': 'EHR · Consultation', 'ehr.selectVisit': 'Select an open visit to start a consultation:',
    'ehr.allDone': 'All visits completed today ✅', 'ehr.diagnosis': 'Diagnosis', 'ehr.meds': 'Medications',
    'ehr.addMed': '+ add', 'ehr.gemini': '✨ Gemini draft', 'ehr.close': '💾 Close visit & issue prescription',
    'ehr.closed': '✔ Visit completed — event visit.completed published to RabbitMQ, EHR synced to Neon PostgreSQL.',
    'login.rbac': 'RBAC roles: super_admin · doctor · receptionist · patient — enforced by @Roles + JwtAuthGuard',
  },
  ar: {
    'app.title': 'ميديستريم', 'app.subtitle': 'نظام إدارة العيادات الخارجية المعزز بالذكاء الاصطناعي',
    'nav.dashboard': 'لوحة التحكم', 'nav.visits': 'الزيارات والسجل الطبي', 'nav.ocr': 'قراءة البطاقة',
    'nav.asr': 'الملاحظات الصوتية', 'nav.system': 'النظام والأمان', 'nav.logout': 'خروج',
    'auth.email': 'البريد الإلكتروني', 'auth.password': 'كلمة المرور',
    'auth.submit': 'دخول عبر خدمة auth (JWT httpOnly)',
    'auth.hint': 'للتجربة: doctor@medistream.eg / Cardio#Doc1 · admin@medistream.eg / Super#Admin1',
    'auth.error': 'بيانات غير صحيحة (تم التحقق بـ bcrypt على الخادم)',
    'dash.patients': 'المرضى المسجلون', 'dash.today': 'زيارات اليوم', 'dash.completed': 'مكتملة',
    'dash.avg': 'متوسط الزيارة (دقيقة)', 'dash.map': 'دقة OCR', 'dash.wer': 'خطأ ASR',
    'visits.title': 'قائمة انتظار العيادة', 'visits.refresh': 'تحديث',
    'visits.stale': 'الكاش قديم — جارٍ التحديث', 'visits.fresh': 'الكاش محدث',
    'status.waiting': 'في الانتظار', 'status.in_consultation': 'داخل الكشف',
    'status.completed': 'مكتملة', 'status.cancelled': 'ملغاة',
    'col.patient': 'المريض', 'col.nid': 'الرقم القومي', 'col.doctor': 'الطبيب',
    'col.complaint': 'الشكوى الرئيسية', 'col.diagnosis': 'التشخيص', 'col.meds': 'الأدوية', 'col.status': 'الحالة',
    'ocr.title': 'قارئ الرقم القومي المصري',
    'ocr.desc': 'كشف الأرقام بنموذج YOLO OBB + PaddleOCR للعربي — يعبّئ نموذج التسجيل تلقائياً.',
    'ocr.camera': 'فتح الكاميرا', 'ocr.capture': 'التقاط ومسح', 'ocr.upload': 'رفع صورة',
    'ocr.scan': 'مسح بطاقة تجريبية', 'ocr.uploading': 'جارٍ الرفع إلى Cloudinary…',
    'ocr.scanning': 'جارٍ تنفيذ الاستدلال على خادم OCR…', 'ocr.backend': 'خلفية الاستدلال', 'ocr.ms': 'زمن الاستدلال',
    'ocr.check': 'تحقق بالذكاء الاصطناعي', 'ocr.register': 'تسجيل المريض',
    'ocr.registered': '✔ تم تسجيل المريض ← RPC‏ patient_create ← إدخال TypeORM في Neon PostgreSQL ← حدث patient.registered',
    'asr.title': 'مفرّغ الملاحظات الصوتية للأطباء',
    'asr.desc': 'سجّل الإملاء ← Cloudinary ← faster-whisper large-v3 عبر RabbitMQ.',
    'asr.record': 'بدء الإملاء', 'asr.stop': 'إيقاف وتفريغ',
    'asr.busy': 'جارٍ التفريغ (FFmpeg 16kHz → whisper)…', 'asr.beam': 'حجم Beam',
    'sys.title': 'حالة شبكة الخدمات المصغرة (isUp)', 'sys.arch': 'المعمارية', 'sys.security': 'الأمان والمراقبة',
    'sys.online': 'متصل — طراز المزامنة فارغ', 'sys.offline': 'غير متصل — التعديلات في الطراز للخلفية',
    'ehr.consult': 'السجل الطبي · الكشف', 'ehr.selectVisit': 'اختر زيارة مفتوحة لبدء الكشف:',
    'ehr.allDone': 'كل زيارات اليوم مكتملة ✅', 'ehr.diagnosis': 'التشخيص', 'ehr.meds': 'الأدوية',
    'ehr.addMed': '＋ إضافة', 'ehr.gemini': '✨ صياغة Gemini', 'ehr.close': '💾 إنهاء الزيارة وصرف الروشتة',
    'ehr.closed': '✔ اكتملت الزيارة — نُشر الحدث visit.completed على RabbitMQ وتمت مزامنة السجل مع Neon PostgreSQL.',
    'login.rbac': 'الأدوار: super_admin · doctor · receptionist · patient — تُفرض عبر ‎@Roles و JwtAuthGuard',
  },
};

/* ===================== 4. ZUSTAND STORES ================================= */
const useLocaleStore = create((set, get) => ({
  locale: localStorage.getItem('medistream.locale') === 'ar' ? 'ar' : 'en',
  setLocale: (locale) => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('medistream.locale', locale); } catch {}
    set({ locale });
  },
  toggleLocale: () => get().setLocale(get().locale === 'en' ? 'ar' : 'en'),
}));

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
  hasRole: (...roles) => !!get().user && roles.includes(get().user.role),
}));

/* ===================== 5. OFFLINE CACHE + BACKGROUND SYNC QUEUE ========= */
const VISITS_KEY = 'medistream.visits.v1';
const QUEUE_KEY = 'medistream.sync.queue.v1';
const ehrCache = {
  loadVisits: () => { try { return JSON.parse(localStorage.getItem(VISITS_KEY) || '[]'); } catch { return []; } },
  saveVisits: (v) => { try { localStorage.setItem(VISITS_KEY, JSON.stringify(v)); } catch {} },
  enqueue: (m) => {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      q.push({ ...m, id: Math.random().toString(36).slice(2), at: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch {}
  },
  readQueue: () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } },
  clearQueue: () => { try { localStorage.removeItem(QUEUE_KEY); } catch {} },
};

/* ===================== 6. GATEWAY CLIENT (mock microservices) =========== */
const delay = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));

const DEMO_USERS = {
  'admin@medistream.eg': { password: 'Super#Admin1', profile: { sub: 'u-1', email: 'admin@medistream.eg', name: 'Dr. Youssef Hassanien', role: 'super_admin' } },
  'doctor@medistream.eg': { password: 'Cardio#Doc1', profile: { sub: 'u-2', email: 'doctor@medistream.eg', name: 'د. منى إبراهيم', role: 'doctor' } },
  'reception@medistream.eg': { password: 'Reception1', profile: { sub: 'u-3', email: 'reception@medistream.eg', name: 'سارة أحمد', role: 'receptionist' } },
};

const PATIENTS = [
  { id: 'p-1', nationalId: '29812345678901', fullNameAr: 'محمد علي حسن', gender: 'male' },
  { id: 'p-2', nationalId: '28705123456789', fullNameAr: 'أحمد سمير فؤاد', gender: 'male' },
  { id: 'p-3', nationalId: '30108765432109', fullNameAr: 'فاطمة الزهراء محمود', gender: 'female' },
];

const SEED_VISITS = [
  { id: 'v-1', patientId: 'p-1', doctorName: 'د. منى إبراهيم', clinic: 'Cardiology', status: 'completed', chiefComplaint: 'Chest tightness on exertion', diagnosis: 'Stable angina — grade II', medications: [{ name: 'Bisoprolol', dose: '5mg', frequency: '1x daily', durationDays: 30 }], transcribedNotes: 'مريض يشكو من ضغط بالصدر مع المجهود. تخطيط القلب طبيعي. إنزيمات القلب سلبية.', startedAt: '2026-10-28T10:05:00Z', completedAt: '2026-10-28T10:32:00Z' },
  { id: 'v-2', patientId: 'p-2', doctorName: 'د. منى إبراهيم', clinic: 'Cardiology', status: 'in_consultation', chiefComplaint: 'Hypertension follow-up', diagnosis: '', medications: [], startedAt: '2026-10-31T09:40:00Z' },
  { id: 'v-3', patientId: 'p-3', doctorName: 'د. خالد صبري', clinic: 'Internal Medicine', status: 'waiting', chiefComplaint: 'Fatigue and joint pain', diagnosis: '', medications: [] },
];

let visits = ehrCache.loadVisits().length ? ehrCache.loadVisits() : SEED_VISITS.slice();
const persistVisits = () => ehrCache.saveVisits(visits);

const handlers = {
  /* apps/auth — Passport.js + bcrypt(12) + JWT HS256 httpOnly cookie */
  async [MESSAGE_PATTERNS.AUTH_LOGIN]({ email, password }) {
    await delay(420); // bcrypt cost ~12 rounds
    const rec = DEMO_USERS[(email || '').toLowerCase()];
    if (!rec || rec.password !== password) throw new Error('INVALID_CREDENTIALS');
    return { user: rec.profile, expiresIn: '15m' };
  },
  /* apps/ocr — YOLO OBB digits + PaddleOCR(ar), CUDA ↔ OpenVINO fallback */
  async [MESSAGE_PATTERNS.OCR_SCAN_ID]() {
    const cuda = navigator.onLine && !document.hidden;
    const res = {
      nationalNumber: '29503123456780', nameAr: 'محمود عبد الله سيد', nameEn: 'Mahmoud Abdallah Sayed',
      birthDate: '1995-03-14', gender: 'male', addressAr: 'القليوبية - شبرا الخيمة',
      backend: cuda ? 'pytorch-cuda' : 'openvino-cpu', inferenceMs: cuda ? 362 : 1578, map05: 0.994, recall: 0.996,
    };
    await delay(res.inferenceMs); // honest timing: 362 ms CUDA vs 1578 ms CPU
    return res;
  },
  /* apps/asr — faster-whisper large-v3, 4-worker pool, thread-safe acks */
  async [MESSAGE_PATTERNS.ASR_TRANSCRIBE]({ durationSec, beamSize }) {
    const device = navigator.onLine ? 'cuda-fp16' : 'cpu';
    await delay(device === 'cuda-fp16' ? 1400 : 6200);
    return {
      text: 'الحالة مستقرة، ضغط الدم ١٨٠ على ٩٠. لا يوجد تورم بالأطراف. تم وصف إينالابريل ١٠ مجم مرة يومياً صباحاً مع تقليل الملح ومتابعة بعد أسبوعين.',
      language: 'ar', model: 'faster-whisper-large-v3', beamSize: beamSize || 5,
      wer: 0.062, cer: 0.018, rtf: device === 'cuda-fp16' ? 0.11 : 0.94,
      device, durationSec, workerId: Math.floor(Math.random() * 4),
    };
  },
  /* apps/cloud-storage — Cloudinary upload */
  async [MESSAGE_PATTERNS.STORAGE_UPLOAD]({ kind }) {
    await delay(900);
    return { secure_url: `https://res.cloudinary.com/medistream/${kind}/upload/v1/mock.bin` };
  },
  /* apps/doctor — visits & prescriptions (TypeORM → Neon PostgreSQL) */
  async [MESSAGE_PATTERNS.VISIT_LIST]() {
    await delay(260);
    return visits.map((v) => ({ ...v, patient: PATIENTS.find((p) => p.id === v.patientId) }));
  },
  async [MESSAGE_PATTERNS.PRESCRIPTION_ADD](payload) {
    await delay(300);
    visits = visits.map((v) =>
      v.id === payload.visitId
        ? { ...v, status: 'completed', diagnosis: payload.diagnosis, medications: payload.medications, transcribedNotes: payload.transcribedNotes || v.transcribedNotes, completedAt: new Date().toISOString() }
        : v,
    );
    persistVisits();
    return { ok: true, event: EHR_EVENTS.VISIT_COMPLETED };
  },
  /* apps/super-admin — system-wide clinic administration */
  async [MESSAGE_PATTERNS.CLINIC_STATS]() {
    await delay(200);
    return {
      patients: PATIENTS.length + 128, todayVisits: visits.length,
      completed: visits.filter((v) => v.status === 'completed').length,
      avgConsultMin: 14.2, ocrAccuracyMap05: 0.994, asrWer: 0.062,
    };
  },
};

async function dispatch(pattern, payload = {}) {
  const fn = handlers[pattern];
  if (!fn) throw new Error('UNKNOWN_PATTERN:' + pattern);
  return fn(payload);
}

const api = {
  login: (dto) => dispatch(MESSAGE_PATTERNS.AUTH_LOGIN, dto),
  listVisits: () => dispatch(MESSAGE_PATTERNS.VISIT_LIST),
  addPrescription: (p) => dispatch(MESSAGE_PATTERNS.PRESCRIPTION_ADD, p),
  scanNationalId: () => dispatch(MESSAGE_PATTERNS.OCR_SCAN_ID),
  transcribe: (dur, beam) => dispatch(MESSAGE_PATTERNS.ASR_TRANSCRIBE, { durationSec: dur, beamSize: beam }),
  upload: (kind) => dispatch(MESSAGE_PATTERNS.STORAGE_UPLOAD, { kind }),
  clinicStats: () => dispatch(MESSAGE_PATTERNS.CLINIC_STATS),
  /** Fire-and-forget mutation: executes now or queues for background sync. */
  mutateWithOfflineQueue(pattern, payload) {
    if (!navigator.onLine) { ehrCache.enqueue({ pattern, payload }); throw new Error('OFFLINE_QUEUED'); }
    return dispatch(pattern, payload);
  },
  async flushSyncQueue() {
    const q = ehrCache.readQueue(); let n = 0;
    for (const m of q) { try { await dispatch(m.pattern, m.payload); n++; } catch { break; } }
    if (n) ehrCache.clearQueue();
    return n;
  },
  /** isUp health probes for all 7 microservices (+ broker & DB). */
  async healthProbe() {
    const defs = [['api-gateway','node',3000],['auth','node',3001],['doctor','node',3002],['super-admin','node',3003],['cloud-storage','node',3004],['ocr','python',8001],['asr','python',8002]];
    return Promise.all(defs.map(async ([name, kind, port]) => {
      const t0 = performance.now(); await delay(60);
      return { name, kind, port, isUp: true, latencyMs: Math.round(performance.now() - t0) };
    }));
  },
};

/* ===================== 7. REACT-QUERY-STYLE useVisits (SWR) ============= */
const STALE_MS = 30_000; // staleTime — mirrors queryClient config
let qCache = null; let qInflight = null;
const qListeners = new Set();
function fetchVisits() {
  if (qInflight) return qInflight; // dedupe concurrent identical queries
  qInflight = api.listVisits().then((rows) => {
    qCache = { data: rows, at: Date.now() }; qInflight = null;
    qListeners.forEach((l) => l()); return rows;
  });
  return qInflight;
}
function invalidateVisits() { qCache = null; fetchVisits().catch(() => {}); }
function prefetchVisits() { if (!qCache || Date.now() - qCache.at > STALE_MS) fetchVisits().catch(() => {}); }
function useVisits() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [fetching, setFetching] = React.useState(!qCache);
  React.useEffect(() => {
    qListeners.add(force);
    if (!qCache || Date.now() - qCache.at > STALE_MS) { setFetching(true); fetchVisits().finally(() => setFetching(false)); }
    return () => qListeners.delete(force);
  }, []);
  // Offline resilience: when connectivity returns, flush sync queue + refetch.
  React.useEffect(() => {
    const onOnline = async () => { await api.flushSyncQueue(); invalidateVisits(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  return {
    visits: qCache ? qCache.data : [],
    isFetching: fetching,
    isStale: !qCache || Date.now() - qCache.at > STALE_MS,
    refetch: async () => { qCache = null; setFetching(true); await fetchVisits().finally(() => setFetching(false)); },
  };
}

/* ===================== 8. CUSTOM HOOKS =================================== */
/** useDebounce — generic debounce utility. */
function useDebounce(value, ms = 400) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** useCamera — webcam capture for the National-ID OCR flow. */
function useCamera() {
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [active, setActive] = React.useState(false);
  const [error, setError] = React.useState(null);
  const start = React.useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play(); }
      setActive(true);
    } catch (e) { setError(e && e.name === 'NotAllowedError' ? 'CAMERA_PERMISSION_DENIED' : 'NO_CAMERA'); }
  }, []);
  const stop = React.useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setActive(false);
  }, []);
  /** Freeze current frame -> JPEG data URL (fed to YOLO detection). */
  const capture = React.useCallback(() => {
    const v = videoRef.current; if (!v || !streamRef.current) return null;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0); return c.toDataURL('image/jpeg', 0.9);
  }, []);
  React.useEffect(() => stop, [stop]);
  return { videoRef, active, error, start, stop, capture };
}

/** useScanNationalId — Cloudinary upload → OCR RPC → validated result. */
function useScanNationalId() {
  const [state, setState] = React.useState({ status: 'idle', result: null });
  const scan = React.useCallback(async () => {
    try {
      setState({ status: 'uploading', result: null });
      await api.upload('image'); // cloud-storage → Cloudinary
      setState({ status: 'scanning', result: null });
      const r = await api.scanNationalId(); // RabbitMQ RPC → Python OCR worker
      setState({ status: 'done', result: r }); return r;
    } catch (e) { setState({ status: 'error', result: null, error: String(e.message) }); return null; }
  }, []);
  return { ...state, scan };
}

/** useVoiceNote — MediaRecorder → Cloudinary → faster-whisper ASR. */
function useVoiceNote() {
  const recRef = React.useRef(null); const chunksRef = React.useRef([]);
  const startRef = React.useRef(0); const timerRef = React.useRef(null);
  const [recording, setRecording] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const start = React.useCallback(async () => {
    setError(null); setResult(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(s);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.start(); recRef.current = rec; startRef.current = Date.now(); setRecording(true);
      timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    } catch { setError('MIC_PERMISSION_DENIED'); }
  }, []);
  const stopAndTranscribe = React.useCallback(async (beamSize = 5) => {
    const rec = recRef.current; if (!rec) return null;
    const dur = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
    setRecording(false); clearInterval(timerRef.current);
    await new Promise((res) => { rec.onstop = res; rec.stop(); rec.stream.getTracks().forEach((t) => t.stop()); });
    try {
      setBusy(true);
      await api.upload('audio'); // webm/lamejs-MP3 → Cloudinary (prod)
      const r = await api.transcribe(dur, beamSize); setResult(r); return r;
    } catch (e) { setError(String(e.message)); return null; } finally { setBusy(false); }
  }, []);
  React.useEffect(() => () => clearInterval(timerRef.current), []);
  return { recording, seconds, busy, result, error, start, stopAndTranscribe };
}

/* ===================== 9. GEMINI AI FEATURES (@google/genai) ============= */
const gemini = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

/** Turn an Arabic dictated voice note into a structured English clinical summary. */
async function aiDraftVisitSummary(notesAr, complaint) {
  if (!gemini) throw new Error('NO_API_KEY');
  const r = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `You are a clinical documentation assistant for an Egyptian outpatient clinic.\nChief complaint (EN): ${complaint}\nDoctor's dictated Arabic voice note (transcribed by faster-whisper large-v3): """${notesAr}"""\nReturn JSON: summaryEn (≤60 words professional English), suggestedDiagnosis, suggestedMeds array of {name,dose,frequency,durationDays}.`,
    config: { responseMimeType: 'application/json', responseSchema: { type: Type.OBJECT, properties: { summaryEn: { type: Type.STRING }, suggestedDiagnosis: { type: Type.STRING }, suggestedMeds: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, dose: { type: Type.STRING }, frequency: { type: Type.STRING }, durationDays: { type: Type.INTEGER } }, required: ['name', 'dose', 'frequency', 'durationDays'] } } }, required: ['summaryEn', 'suggestedDiagnosis', 'suggestedMeds'] } },
  });
  return JSON.parse(r.text || '{}');
}

/** Sanity-check OCR output against Egyptian NID rules. */
async function aiCheckNationalId(ocr) {
  if (!gemini) throw new Error('NO_API_KEY');
  const r = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Egyptian National ID OCR result: number=${ocr.nationalNumber}, birthDate=${ocr.birthDate}, gender=${ocr.gender}, nameAr=${ocr.nameAr}. In 1-2 Arabic sentences verify plausibility (14 digits, century digit 2/3, gender digit 13, birth date consistency) and flag anything to re-check.`,
  });
  return r.text || '';
}

/* ===================== 10. DESIGN TOKENS (Tailwind-like) ================= */
const css = `
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#123 0%,#0b1220 60%);color:#e8eefc;font-family:'Segoe UI','Noto Sans Arabic',Tahoma,system-ui,sans-serif;min-height:100vh}
.card{background:#111a2e;border:1px solid #24334f;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.topbar{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;gap:10px;flex-wrap:wrap;border-bottom:1px solid #24334f;background:rgba(17,26,46,.85);backdrop-filter:blur(8px);position:sticky;top:0;z-index:20}
.title{margin:0;font-size:19px}.subtitle{margin:0;font-size:12px;color:#93a4c3}
.logo-cross{font-size:24px;color:#2dd4bf;background:rgba(45,212,191,.12);border:1px solid #14b8a6;width:42px;height:42px;display:grid;place-items:center;border-radius:12px}
.shell{display:grid;grid-template-columns:220px 1fr;gap:16px;padding:16px}.sidebar{display:flex;flex-direction:column;gap:6px;padding:12px;align-self:start;position:sticky;top:80px}
.nav-item{text-align:start;background:0 0;border:1px solid transparent;color:#e8eefc;padding:10px 12px;border-radius:10px;cursor:pointer;font-size:14px;display:flex;gap:8px;align-items:center}
.nav-item:hover{background:#16233c}.nav-item.active{background:rgba(45,212,191,.14);border-color:#14b8a6;color:#2dd4bf}
.btn{border:1px solid #24334f;background:#16233c;color:#e8eefc;padding:10px 16px;border-radius:10px;cursor:pointer;font-size:14px;transition:.15s}
.btn:hover:not(:disabled){transform:translateY(-1px);border-color:#14b8a6}.btn:disabled{opacity:.55;cursor:not-allowed}
.btn.primary{background:linear-gradient(135deg,#0d9488,#14b8a6);border-color:#0f766e;color:#04211d;font-weight:700}
.btn.danger{background:#7f1d1d;border-color:#b91c1c;color:#ffe4e6}.btn.ghost{background:0 0}.btn.small{padding:6px 10px;font-size:12px}.btn.big{padding:14px 26px;font-size:16px}
input,select{width:100%;padding:10px 12px;margin-top:4px;background:#16233c;border:1px solid #24334f;color:#e8eefc;border-radius:10px;font-size:14px}
input:focus,select:focus{outline:0;border-color:#14b8a6}label{display:block;font-size:13px;color:#93a4c3;margin-bottom:10px}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.space{justify-content:space-between}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.section{padding:18px;margin-bottom:16px}
h2{margin:0 0 10px;font-size:17px}.muted{color:#93a4c3;font-size:13px}.mono{font-family:ui-monospace,Consolas,monospace}
.ar{font-family:'Noto Naskh Arabic','Segoe UI',serif}.hint{font-size:11px;color:#93a4c3}.stack{display:flex;flex-direction:column;gap:10px}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}
.kpi{padding:14px;text-align:center}.kpi-value{font-size:24px;font-weight:700;color:#2dd4bf}.kpi-label{font-size:12px;color:#93a4c3}
.pill{padding:3px 10px;border-radius:999px;font-size:11px;border:1px solid #24334f;white-space:nowrap}
.pill.ok{color:#34d399;border-color:#34d399}.pill.warn{color:#fbbf24;border-color:#fbbf24}
.status-waiting{color:#fbbf24;border-color:#fbbf24}.status-in_consultation{color:#60a5fa;border-color:#60a5fa}
.status-completed{color:#34d399;border-color:#34d399}.status-cancelled{color:#f87171;border-color:#f87171}
.alert{padding:10px 14px;border-radius:10px;font-size:13px;margin-top:8px;border:1px solid #24334f}
.alert.error{background:rgba(248,113,113,.12);border-color:#b91c1c;color:#fecaca}.alert.ok{background:rgba(52,211,153,.1);border-color:#059669;color:#d1fae5}
.alert.ai{background:rgba(96,165,250,.1);border-color:#3b82f6}
.pulse{animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{50%{opacity:.45}}
.rec-pulse{animation:rp 1s ease-in-out infinite}@keyframes rp{50%{box-shadow:0 0 0 6px rgba(248,113,113,.25)}}
.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:9px 10px;border-bottom:1px solid #24334f;text-align:start;vertical-align:top}th{color:#93a4c3;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
tr:hover td{background:rgba(45,212,191,.04)}
.login-wrap{display:grid;place-items:center;flex:1;padding:24px}.login-card{width:100%;max-width:430px;padding:28px;display:flex;flex-direction:column;gap:12px}
.camera-box{border:1px dashed #24334f;border-radius:12px;overflow:hidden;margin-bottom:12px;background:#0a0f1a}
.camera-video,.camera-ph{width:100%;height:220px;display:block;object-fit:cover}.camera-ph{display:grid;place-items:center;font-size:56px;color:#93a4c3}
.result-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:12px;align-items:center;font-size:13px}
.result-grid div{display:flex;flex-direction:column;gap:4px}
.transcript{background:#16233c;border:1px solid #24334f;border-radius:12px;padding:14px;margin-top:12px;line-height:1.9;font-size:15px}
.metrics-row{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#93a4c3;margin-top:10px;border-top:1px dashed #24334f;padding-top:8px}
.voice-box{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#16233c;padding:12px;border-radius:12px}
.inline-label{display:inline-flex;align-items:center;gap:8px;margin:0}.inline-label select{width:auto;margin:0}
.med-row{display:grid;grid-template-columns:2fr 1fr 1.2fr .7fr auto;gap:6px;margin-bottom:6px}.med-row input{margin:0}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.svc{display:flex;align-items:center;gap:8px;background:#16233c;border:1px solid #24334f;border-radius:10px;padding:10px 12px;font-size:13px}
.dot{width:9px;height:9px;border-radius:50%}.dot.ok{background:#34d399;box-shadow:0 0 8px #34d399}
.tag{font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid #24334f;color:#93a4c3}.tag.node{color:#a3e635;border-color:#65a30d}.tag.python{color:#60a5fa;border-color:#2563eb}.tag.infra{color:#f472b6;border-color:#db2777}
.arch{background:#0a0f1a;border:1px solid #24334f;border-radius:12px;padding:14px;overflow-x:auto;font-size:12px;line-height:1.55;white-space:pre;margin:0}
.checklist{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;font-size:13px}
.role-badge{margin-top:auto;font-size:11px;color:#93a4c3;border-top:1px dashed #24334f;padding-top:10px}
.err{color:#f87171;font-size:11px}.picker{display:flex;flex-direction:column;gap:6px}
.rtl th,.rtl td{text-align:end}
@media(max-width:900px){.shell{grid-template-columns:1fr}.sidebar{position:static;flex-direction:row;overflow-x:auto}.two-col{grid-template-columns:1fr}.role-badge{display:none}.med-row{grid-template-columns:1fr 1fr}}
`;

function injectStyles() {
  if (!document.getElementById('ms-css')) {
    const s = document.createElement('style'); s.id = 'ms-css'; s.textContent = css;
    document.head.appendChild(s);
  }
}

const Pill = (props) => h('span', { className: props.className, children: props.children });
const Alert = (kind, msg) => h('div', { className: 'alert ' + kind, children: msg });

/* ===================== 11. SCREENS ======================================= */
function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (k) => (L[locale] && L[locale][k]) || L.en[k] || k;
}

function LoginScreen() {
  const t = useT();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = React.useState('doctor@medistream.eg');
  const [password, setPassword] = React.useState('Cardio#Doc1');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState(null);
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    const v = validators.login({ email, password }); // ValidationPipe-equivalent
    if (!v.ok) return setError(v.errors.join(' · '));
    setPending(true);
    try { const r = await api.login({ email, password }); login(r.user); } // token stays in httpOnly cookie
    catch { setError(t('auth.error')); }
    finally { setPending(false); }
  };
  return h('div', { className: 'login-wrap' },
    h('form', { className: 'card login-card', onSubmit: submit },
      h('div', { className: 'row' }, h('span', { className: 'logo-cross', children: '✚' }), h('h1', { style: { margin: 0, fontSize: 22 }, children: t('app.title') })),
      h('p', { className: 'muted', children: t('app.subtitle') }),
      h('label', {}, t('auth.email'), h('input', { type: 'email', value: email, onChange: (e) => setEmail(e.target.value), required: true })),
      h('label', {}, t('auth.password'), h('input', { type: 'password', value: password, onChange: (e) => setPassword(e.target.value), required: true, minLength: 8 })),
      error && Alert('error', error),
      h('button', { className: 'btn primary', disabled: pending, children: (pending ? '⏳ ' : '🔐 ') + t('auth.submit') }),
      h('p', { className: 'hint', children: t('auth.hint') }),
      h('p', { className: 'hint mono', children: t('login.rbac') }))));
}

function QueueTable() {
  const t = useT();
  const { visits: vs, isFetching } = useVisits();
  if (isFetching && !vs.length) return h('div', { className: 'muted', style: { padding: 20 }, children: 'Loading from doctor service…' });
  return h('div', { className: 'table-scroll' },
    h('table', {},
      h('thead', {}, h('tr', {}, ['col.patient', 'col.nid', 'col.doctor', 'col.complaint', 'col.diagnosis', 'col.meds', 'col.status'].map((k) => h('th', { key: k, children: t(k) })))),
      h('tbody', {}, vs.map((v) =>
        h('tr', { key: v.id },
          h('td', { className: 'ar strong', children: (v.patient && v.patient.fullNameAr) || v.patientId }),
          h('td', { className: 'mono', children: (v.patient && v.patient.nationalId) || '—' }),
          h('td', { className: 'ar', children: v.doctorName }),
          h('td', { children: v.chiefComplaint || '—' }),
          h('td', { children: v.diagnosis || '—' }),
          h('td', { children: v.medications && v.medications.length ? v.medications.map((m) => m.name + ' ' + m.dose).join(', ') : '—' }),
          h('td', {}, h(Pill, { className: 'pill status-' + v.status, children: t('status.' + v.status) }))))));
}

function Dashboard() {
  const t = useT();
  const { isFetching, isStale, refetch } = useVisits();
  const [stats, setStats] = React.useState(null);
  React.useEffect(() => { api.clinicStats().then(setStats); }, []);
  const kpis = [
    ['dash.patients', stats ? stats.patients : '—', '🧍'], ['dash.today', stats ? stats.todayVisits : '—', '🗓️'],
    ['dash.completed', stats ? stats.completed : '—', '✅'], ['dash.avg', stats ? stats.avgConsultMin : '—', '⏱️'],
    ['dash.map', stats ? (stats.ocrAccuracyMap05 * 100).toFixed(1) + '%' : '—', '📷'], ['dash.wer', stats ? (stats.asrWer * 100).toFixed(1) + '%' : '—', '🎙️'],
  ];
  return h('div', {},
    h('div', { className: 'kpi-grid' }, kpis.map(([k, val, icon]) =>
      h('div', { className: 'card kpi', key: k }, h('div', { children: icon }), h('div', { className: 'kpi-value', children: String(val) }), h('div', { className: 'kpi-label', children: t(k) })))),
    h('div', { className: 'card section' },
      h('div', { className: 'row space' },
        h('h2', { children: t('visits.title') }),
        h('div', { className: 'row' },
          h(Pill, { className: 'pill ' + (isStale ? 'warn' : 'ok'), children: isStale ? t('visits.stale') : t('visits.fresh') }),
          h('button', { className: 'btn small', onClick: refetch, disabled: isFetching, children: '↻ ' + t('visits.refresh') }))),
      h(QueueTable)));
}

function VisitsScreen() {
  const t = useT();
  const { visits: vs } = useVisits();
  const [selId, setSelId] = React.useState(null);
  const sel = vs.find((v) => v.id === selId);
  return h('div', { className: 'two-col' },
    h('div', { className: 'card section' }, h('h2', { children: t('visits.title') }), h(QueueTable)),
    h('div', { className: 'card section' },
      h('h2', { children: t('ehr.consult') }),
      !sel
        ? h('div', { className: 'picker' },
            h('p', { className: 'muted', children: t('ehr.selectVisit') }),
            vs.filter((v) => v.status !== 'completed').map((v) =>
              h('button', { key: v.id, className: 'btn ghost', onClick: () => setSelId(v.id), children: '🩺 ' + ((v.patient && v.patient.fullNameAr) || v.patientId) + ' — ' + v.chiefComplaint })),
            !vs.some((v) => v.status !== 'completed') && h('p', { className: 'muted', children: t('ehr.allDone') }))
        : h(ConsultationForm, { key: sel.id, visit: sel, onDone: () => { setSelId(null); invalidateVisits(); } })));
}

function ConsultationForm({ visit, onDone }) {
  const t = useT();
  const vn = useVoiceNote();
  const [beam, setBeam] = React.useState(5);
  const [diagnosis, setDiagnosis] = React.useState(visit.diagnosis || '');
  const [meds, setMeds] = React.useState(visit.medications || []);
  const [drafting, setDrafting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const geminiDraft = async () => {
    if (!vn.result || !vn.result.text) return;
    setDrafting(true);
    try {
      const d = await aiDraftVisitSummary(vn.result.text, visit.chiefComplaint);
      if (d.suggestedDiagnosis) setDiagnosis(d.suggestedDiagnosis);
      if (Array.isArray(d.suggestedMeds)) setMeds(d.suggestedMeds.slice(0, 4));
    } catch { /* manual entry fallback */ } finally { setDrafting(false); }
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.addPrescription({ visitId: visit.id, diagnosis, medications: meds, transcribedNotes: vn.result && vn.result.text });
      setSaved(true); setTimeout(onDone, 800);
    } finally { setSaving(false); }
  };
  return h('div', { className: 'stack' },
    h('div', { className: 'row' },
      h('b', { className: 'ar', children: visit.patient && visit.patient.fullNameAr }),
      h('span', { className: 'mono muted', children: 'NID ' + (visit.patient && visit.patient.nationalId) }),
      h(Pill, { className: 'pill status-in_consultation', children: t('status.in_consultation') })),
    h('p', {}, h('b', { children: 'Chief complaint: ' }), visit.chiefComplaint),
    h('div', { className: 'voice-box' },
      !vn.recording && !vn.busy && h('button', { className: 'btn primary', onClick: vn.start, children: '🎙️ ' + t('asr.record') }),
      vn.recording && h('button', { className: 'btn danger rec-pulse', onClick: () => vn.stopAndTranscribe(beam), children: '⏹ ' + t('asr.stop') + ' (' + vn.seconds + 's)' }),
      vn.busy && h('span', { className: 'muted pulse', children: '⏳ ' + t('asr.busy') }),
      h('label', { className: 'inline-label' }, t('asr.beam'),
        h('select', { value: beam, onChange: (e) => setBeam(+e.target.value) }, [1, 3, 5].map((b) => h('option', { key: b, value: b, children: 'BS=' + b }))))),
    vn.error && Alert('error', vn.error),
    vn.result && h('div', { className: 'transcript ar', dir: 'rtl' },
      vn.result.text,
      h('div', { className: 'metrics-row mono' },
        h('span', { children: 'WER: ' + (vn.result.wer * 100).toFixed(1) + '%' }),
        h('span', { children: 'CER: ' + (vn.result.cer * 100).toFixed(1) + '%' }),
        h('span', { children: 'RTF: ' + vn.result.rtf }),
        h('span', { children: 'worker #' + vn.result.workerId + '/4' }),
        h('span', { children: vn.result.device })),
      h('button', { className: 'btn small', style: { marginTop: 10 }, onClick: geminiDraft, disabled: drafting, children: t('ehr.gemini') + (drafting ? ' …' : '') })),
    h('label', {}, t('ehr.diagnosis'), h('input', { value: diagnosis, onChange: (e) => setDiagnosis(e.target.value), placeholder: 'Working diagnosis' })),
    h('div', {},
      h('div', { className: 'row space' }, h('b', { children: t('ehr.meds') }),
        h('button', { className: 'btn small ghost', onClick: () => setMeds(meds.concat([{ name: '', dose: '5mg', frequency: '1x daily', durationDays: 14 }])), children: t('ehr.addMed') })),
      meds.map((m, i) => h('div', { className: 'med-row', key: i },
        h('input', { placeholder: 'Name', value: m.name, onChange: (e) => setMeds(meds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))) }),
        h('input', { placeholder: 'Dose', value: m.dose, onChange: (e) => setMeds(meds.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x))) }),
        h('input', { placeholder: 'Freq', value: m.frequency, onChange: (e) => setMeds(meds.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x))) }),
        h('input', { type: 'number', min: 1, value: m.durationDays, onChange: (e) => setMeds(meds.map((x, j) => (j === i ? { ...x, durationDays: +e.target.value } : x))) }),
        h('button', { className: 'btn small danger', onClick: () => setMeds(meds.filter((_, j) => j !== i)), children: '✕' })))),
    saved && Alert('ok', t('ehr.closed')),
    h('button', { className: 'btn primary', onClick: save, disabled: saving || !diagnosis, children: t('ehr.close') }));
}

function OcrScreen() {
  const t = useT();
  const cam = useCamera();
  const scan = useScanNationalId();
  const [form, setForm] = React.useState({ nationalId: '', fullNameAr: '', fullNameEn: '', gender: 'male', birthDate: '', address: '', phone: '' });
  const [nidErr, setNidErr] = React.useState(null);
  const [aiNote, setAiNote] = React.useState(null);
  const [registered, setRegistered] = React.useState(false);
  const applyResult = (r) => {
    setForm((f) => ({ ...f, nationalId: r.nationalNumber || f.nationalId, fullNameAr: r.nameAr || f.fullNameAr, fullNameEn: r.nameEn || f.fullNameEn, birthDate: r.birthDate || f.birthDate, gender: r.gender || f.gender, address: r.addressAr || f.address }));
    setNidErr(r.nationalNumber && !validators.nationalId(r.nationalNumber) ? 'OCR digits failed 14-digit validation' : null);
  };
  const runScan = async () => { const r = await scan.scan(); if (r) applyResult(r); };
  const captureScan = () => { cam.capture(); cam.stop(); runScan(); };
  const geminiVerify = async () => {
    if (!scan.result) return; setAiNote('…');
    try { setAiNote(await aiCheckNationalId(scan.result)); } catch { setAiNote('Gemini verification unavailable (API key missing).'); }
  };
  const register = () => {
    try {
      api.mutateWithOfflineQueue(MESSAGE_PATTERNS.PATIENT_CREATE, form).then(() => setRegistered(true));
    } catch (e) {
      if (e.message === 'OFFLINE_QUEUED') alert('Offline: registration queued for background sync.');
      else alert(e.message);
    }
  };
  return h('div', { className: 'two-col' },
    h('div', { className: 'card section' },
      h('h2', { children: '📷 ' + t('ocr.title') }), h('p', { className: 'muted', children: t('ocr.desc') }),
      h('div', { className: 'camera-box' }, cam.active ? h('video', { ref: cam.videoRef, className: 'camera-video', playsInline: true, muted: true }) : h('div', { className: 'camera-ph', children: '🪪' })),
      cam.error && Alert('error', cam.error + ' — you can still use the demo scan.'),
      h('div', { className: 'row' },
        !cam.active ? h('button', { className: 'btn ghost', onClick: cam.start, children: '🎥 ' + t('ocr.camera') }) : h('button', { className: 'btn danger', onClick: captureScan, children: '📸 ' + t('ocr.capture') }),
        h('button', { className: 'btn primary', onClick: runScan, disabled: scan.status === 'scanning' || scan.status === 'uploading', children: '✨ ' + t('ocr.scan') })),
      (scan.status === 'uploading' || scan.status === 'scanning') && Alert('', h('span', { className: 'pulse', children: '⏳ ' + (scan.status === 'uploading' ? t('ocr.uploading') : t('ocr.scanning') }))),
      scan.result && h('div', { className: 'result-grid' },
        h('div', {}, h('b', { children: t('ocr.backend') }), h(Pill, { className: 'pill ' + (scan.result.backend === 'pytorch-cuda' ? 'ok' : 'warn'), children: scan.result.backend })),
        h('div', {}, h('b', { children: t('ocr.ms') }), h('span', { className: 'mono', children: scan.result.inferenceMs + ' ms' })),
        h('div', {}, h('b', { children: 'mAP@0.5' }), h('span', { className: 'mono', children: (scan.result.map05 * 100).toFixed(1) + '%' })),
        h('div', {}, h('b', { children: 'Recall' }), h('span', { className: 'mono', children: (scan.result.recall * 100).toFixed(1) + '%' })),
        h('button', { className: 'btn small', onClick: geminiVerify, children: '🤖 ' + t('ocr.check') })),
      aiNote && Alert('ai', h('span', { className: 'ar', dir: 'rtl', children: aiNote })),
      h('p', { className: 'hint mono', children: "YOLO11m OBB → digits sorted by cx left→right → PaddleOCR(lang='ar') → schema-validated OcrResult" })),
    h('div', { className: 'card section' },
      h('h2', { children: 'Patient registration (auto-filled)' }),
      h('div', { className: 'stack' },
        h('label', {}, 'National ID ', h('span', { className: 'mono', children: '(14 digits)' }),
          h('input', { className: 'mono', maxLength: 14, value: form.nationalId, placeholder: '2xxxxxxxxxxxxx', onChange: (e) => { const v = e.target.value; setForm({ ...form, nationalId: v }); setNidErr(v && !validators.nationalId(v) ? 'Must be exactly 14 digits (starts 1-9)' : null); } }),
          nidErr && h('div', { className: 'err', children: nidErr })),
        h('label', {}, 'الاسم بالعربية', h('input', { className: 'ar', dir: 'rtl', value: form.fullNameAr, onChange: (e) => setForm({ ...form, fullNameAr: e.target.value }) })),
        h('label', {}, 'Name (EN)', h('input', { value: form.fullNameEn, onChange: (e) => setForm({ ...form, fullNameEn: e.target.value }) })),
        h('div', { className: 'row' },
          h('label', { style: { flex: 1 } }, 'Gender', h('select', { value: form.gender, onChange: (e) => setForm({ ...form, gender: e.target.value }) }, h('option', { value: 'male', children: 'Male' }), h('option', { value: 'female', children: 'Female' }))),
          h('label', { style: { flex: 1 } }, 'Birth date', h('input', { type: 'date', value: form.birthDate, onChange: (e) => setForm({ ...form, birthDate: e.target.value }) }))),
        h('label', {}, 'Address (AR)', h('input', { className: 'ar', dir: 'rtl', value: form.address, onChange: (e) => setForm({ ...form, address: e.target.value }) })),
        h('label', {}, 'Phone', h('input', { maxLength: 11, placeholder: '01xxxxxxxxx', value: form.phone, onChange: (e) => setForm({ ...form, phone: e.target.value }) })),
        h('button', { className: 'btn primary', disabled: !form.nationalId || !form.fullNameAr || !!nidErr, onClick: register, children: '🧍 ' + t('ocr.register') }),
        registered && Alert('ok', t('ocr.registered')))));
}

function AsrScreen() {
  const t = useT();
  const vn = useVoiceNote();
  const [beam, setBeam] = React.useState(5);
  const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  return h('div', { className: 'card section', style: { maxWidth: 860, margin: '0 auto' } },
    h('h2', { children: '🎙️ ' + t('asr.title') }), h('p', { className: 'muted', children: t('asr.desc') }),
    h('div', { className: 'voice-box' },
      !vn.recording && !vn.busy && h('button', { className: 'btn primary big', onClick: vn.start, children: '● ' + t('asr.record') }),
      vn.recording && h('button', { className: 'btn danger big rec-pulse', onClick: () => vn.stopAndTranscribe(beam), children: '⏹ ' + t('asr.stop') + ' — ' + fmt(vn.seconds) }),
      vn.busy && h('span', { className: 'muted pulse', children: '⏳ ' + t('asr.busy') }),
      h('label', { className: 'inline-label' }, t('asr.beam'),
        h('select', { value: beam, onChange: (e) => setBeam(+e.target.value) },
          h('option', { value: 1, children: 'BS=1 (fastest)' }), h('option', { value: 3, children: 'BS=3' }), h('option', { value: 5, children: 'BS=5 (best WER)' })))),
    vn.error && Alert('error', vn.error),
    vn.result && h('div', {},
      h('div', { className: 'transcript ar', dir: 'rtl', children: vn.result.text }),
      h('div', { className: 'metrics-row mono' },
        h('span', { children: 'WER: ' + (vn.result.wer * 100).toFixed(1) + '%' }),
        h('span', { children: 'CER: ' + (vn.result.cer * 100).toFixed(1) + '%' }),
        h('span', { children: 'RTF: ' + vn.result.rtf }),
        h('span', { children: vn.result.model }),
        h('span', { children: vn.result.device }),
        h('span', { children: 'worker #' + (vn.result.workerId + 1) + '/4' }),
        h('span', { children: vn.result.durationSec + 's · BS=' + vn.result.beamSize }))),
    h('p', { className: 'hint mono', children: 'MediaRecorder → lamejs MP3 → cloud-storage(Cloudinary) → RabbitMQ asr_transcribe → FFmpeg 16kHz mono WAV → faster-whisper large-v3 (CUDA fp16/int8, CPU fallback) → thread-safe acks' }));
}

function SystemScreen() {
  const t = useT();
  const [health, setHealth] = React.useState([]);
  const probe = () => api.healthProbe().then(setHealth);
  React.useEffect(() => { probe(); const i = setInterval(probe, 15000); return () => clearInterval(i); }, []);
  const arch = `Monorepo (Nest CLI workspace)
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
├─ libs/common      shared kernel (schemas, patterns)
└─ frontend         Next.js 14 App Router · Zustand · React Query
                    Tailwind+Shadcn · /en|/ar RTL middleware · sw.ts
Infra: Docker(node:24-alpine/CUDA base) · docker-compose.prod
       Nginx TLS(Let's Encrypt) · private net over Tailscale mesh`;
  const security = [
    'JWT HS256 — issuer/audience verified, signed httpOnly cookie',
    'bcrypt password hashing — 12 rounds', 'RBAC — @Roles metadata + JwtAuthGuard',
    "Nginx reverse proxy — TLS 1.2/1.3, HTTPS 301, Let's Encrypt",
    'Helmet headers · CORS origin binding · Throttler 40 req/2 min',
    'ValidationPipe + class-validator DTOs · 14-digit NID regex',
    'Winston daily timestamped logs (LoggingMiddleware/Interceptor)',
    'isUp health probes · private Docker network over Tailscale mesh',
    'Multi-stage Alpine builds · Docker Hub registry',
  ];
  return h('div', {},
    h('div', { className: 'card section' },
      h('div', { className: 'row space' }, h('h2', { children: '🖥️ ' + t('sys.title') }), h('button', { className: 'btn small ghost', onClick: probe, children: '↻ re-probe' })),
      h('div', { className: 'svc-grid' },
        health.map((s) => h('div', { className: 'svc', key: s.name },
          h('span', { className: 'dot ok' }), h('b', { children: s.name }), h('span', { className: 'mono muted', children: ':' + s.port }),
          h('span', { className: 'tag ' + s.kind, children: s.kind }), h('span', { className: 'mono', children: s.latencyMs + ' ms' }))),
        h('div', { className: 'svc' }, h('span', { className: 'dot ok' }), h('b', { children: 'rabbitmq' }), h('span', { className: 'mono muted', children: ':5672' }), h('span', { className: 'tag infra', children: 'broker' }), h('span', { className: 'mono', children: 'durable queues' })),
        h('div', { className: 'svc' }, h('span', { className: 'dot ok' }), h('b', { children: 'neon-postgres' }), h('span', { className: 'mono muted', children: ':5432' }), h('span', { className: 'tag infra', children: 'TypeORM' }), h('span', { className: 'mono', children: 'EHR store' }))),
      Alert(navigator.onLine ? 'ok' : 'error', navigator.onLine ? '🟢 ' + t('sys.online') : '🔴 ' + t('sys.offline'))),
    h('div', { className: 'two-col' },
      h('div', { className: 'card section' }, h('h2', { children: '🧱 ' + t('sys.arch') }), h('pre', { className: 'arch mono', children: arch })),
      h('div', { className: 'card section' }, h('h2', { children: '🛡️ ' + t('sys.security') }),
        h('ul', { className: 'checklist' }, security.map((s) => h('li', { key: s, children: '✔ ' + s }))))));
}

/* ===================== 12. APP SHELL ====================================== */
function TopBar({ minimal }) {
  const t = useT();
  const { user, logout } = useAuthStore();
  const { locale, toggleLocale } = useLocaleStore();
  return h('header', { className: 'topbar' },
    h('div', { className: 'row' }, h('span', { className: 'logo-cross', children: '✚' }),
      h('div', {}, h('h1', { className: 'title', children: t('app.title') }), h('p', { className: 'subtitle', children: t('app.subtitle') }))),
    h('div', { className: 'row' },
      h('button', { className: 'btn small ghost', onClick: toggleLocale, title: 'EN ⇄ AR (RTL flip)', children: '🌐 ' + (locale === 'en' ? 'العربية' : 'English') }),
      !minimal && user && h('div', { className: 'row' },
        h('span', { className: 'mono', children: user.name }),
        h('button', { className: 'btn small danger', onClick: logout, children: t('nav.logout') }))));
}

function Shell() {
  const t = useT();
  const { isAuthenticated, user } = useAuthStore();
  const [page, setPage] = React.useState('dashboard');
  if (!isAuthenticated) return h('div', {}, h(TopBar, { minimal: true }), h(LoginScreen));
  const nav = [['dashboard', '📊', 'nav.dashboard'], ['visits', '🩺', 'nav.visits'], ['ocr', '📷', 'nav.ocr'], ['asr', '🎙️', 'nav.asr'], ['system', '🛡️', 'nav.system']];
  return h('div', {},
    h(TopBar),
    h('div', { className: 'shell' },
      h('aside', { className: 'sidebar card' },
        nav.map(([id, icon, k]) => h('button', { key: id, className: 'nav-item' + (page === id ? ' active' : ''), onClick: () => { setPage(id); if (id === 'visits') prefetchVisits(); }, children: icon + '  ' + t(k) })),
        h('div', { className: 'role-badge mono', children: '@Roles: ' + user.role })),
      h('main', {},
        page === 'dashboard' && h(Dashboard),
        page === 'visits' && h(VisitsScreen),
        page === 'ocr' && h(OcrScreen),
        page === 'asr' && h(AsrScreen),
        page === 'system' && h(SystemScreen))));
}

/* ===================== 13. BOOT ========================================== */
injectStyles();
try {
  if (localStorage.getItem('medistream.locale') === 'ar') {
    document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl';
  }
} catch {}
createRoot(document.getElementById('root')).render(h(Shell));
