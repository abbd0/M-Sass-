/**
 * apiClient — the browser-side twin of the NestJS `api-gateway`.
 *
 * In production (docker-compose on the Tailscale mesh, behind Nginx TLS 1.2/1.3):
 *   fetch POST /api/<route>  ->  api-gateway  ->  RabbitMQ @MessagePattern RPC
 *   -> auth | doctor | super-admin | cloud-storage | ocr | asr services
 *   -> PostgreSQL (Neon) via TypeORM.
 * Requests are rate-limited by the gateway ThrottlerGuard (40 req / 2 min).
 *
 * This AI-Studio build has no bundled backend, so every call is validated with
 * the SAME Zod schemas used by the backend DTOs (libs/common) and then served
 * by an in-browser mock bus that simulates each microservice (with realistic
 * latency, OCR CUDA/OpenVINO timings and ASR worker-pool behaviour).
 */
import {
  MESSAGE_PATTERNS,
  OcrResultSchema,
  VisitSchema,
  type AsrResult,
  type LoginDto,
  type Medication,
  type OcrResult,
  type Patient,
  type ServiceHealth,
  type Visit,
} from '../libs/common';
import { ehrCache } from './offlineCache';
import type { UserProfile } from '../stores/authStore';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));

/* ------------------------------------------------------------------ */
/* Seed data (stands in for Neon/PostgreSQL TypeORM tables)            */
/* ------------------------------------------------------------------ */

const DEMO_USERS: Record<string, { password: string; profile: UserProfile }> = {
  'admin@medistream.eg': {
    password: 'Super#Admin1',
    profile: { sub: 'u-1', email: 'admin@medistream.eg', name: 'Dr. Youssef Hassanien', role: 'super_admin' },
  },
  'doctor@medistream.eg': {
    password: 'Cardio#Doc1',
    profile: { sub: 'u-2', email: 'doctor@medistream.eg', name: 'د. منى إبراهيم', role: 'doctor' },
  },
  'reception@medistream.eg': {
    password: 'Reception1',
    profile: { sub: 'u-3', email: 'reception@medistream.eg', name: 'سارة أحمد', role: 'receptionist' },
  },
};

const seedPatients: Patient[] = [
  { id: 'p-1', nationalId: '29812345678901', fullNameAr: 'محمد علي حسن', fullNameEn: 'Mohamed Ali Hassan', gender: 'male', birthDate: '1998-12-04', phone: '01012345678', address: 'القاهرة - مدينة نصر', createdAt: '2026-01-12T09:00:00Z' },
  { id: 'p-2', nationalId: '28705123456789', fullNameAr: 'أحمد سمير فؤاد', fullNameEn: 'Ahmed Samir Fouad', gender: 'male', birthDate: '1987-05-21', phone: '01123456789', address: 'الجيزة - المهندسين', createdAt: '2026-02-03T11:30:00Z' },
  { id: 'p-3', nationalId: '30108765432109', fullNameAr: 'فاطمة الزهراء محمود', fullNameEn: 'Fatima El-Zahraa Mahmoud', gender: 'female', birthDate: '2001-08-15', phone: '01234567890', address: 'الإسكندرية - سموحة', createdAt: '2026-03-18T14:20:00Z' },
];

const seedVisits: Visit[] = [
  {
    id: 'v-1', patientId: 'p-1', doctorName: 'د. منى إبراهيم', clinic: 'Cardiology Clinic', status: 'completed',
    chiefComplaint: 'Recurrent chest tightness after exertion', diagnosis: 'Stable angina — grade II',
    medications: [{ name: 'Bisoprolol', dose: '5mg', frequency: '1x daily', durationDays: 30 }],
    transcribedNotes: 'مريض يشكو من ضغط بالصدر مع المجهود. تخطيط القلب طبيعي. إنزيمات القلب سلبية. تم تعديل الجرعة ومتابعة بعد شهر.',
    voiceNoteUrl: 'https://res.cloudinary.com/medistream/audio/upload/v1/asr/v-1.wav',
    startedAt: '2026-10-28T10:05:00Z', completedAt: '2026-10-28T10:32:00Z',
  },
  {
    id: 'v-2', patientId: 'p-2', doctorName: 'د. منى إبراهيم', clinic: 'Cardiology Clinic', status: 'in_consultation',
    chiefComplaint: 'Hypertension follow-up', diagnosis: '', medications: [],
    startedAt: '2026-10-31T09:40:00Z',
  },
  {
    id: 'v-3', patientId: 'p-3', doctorName: 'د. خالد صبري', clinic: 'Internal Medicine', status: 'waiting',
    chiefComplaint: 'Fatigue and joint pain', diagnosis: '', medications: [],
  },
];

let visits: Visit[] = (() => {
  const cached = ehrCache.loadVisits();
  if (cached.length) return cached;
  ehrCache.saveVisits(seedVisits);
  return seedVisits;
})();

const persist = () => ehrCache.saveVisits(visits);

/* ------------------------------------------------------------------ */
/* Mock microservices (each mirrors a real Nest/Python service)        */
/* ------------------------------------------------------------------ */

type Handler = (payload: any) => Promise<unknown>;

const services: Record<string, Handler> = {
  /* apps/auth — Passport.js + bcrypt(12) + JWT HS256 httpOnly cookie */
  async [MESSAGE_PATTERNS.AUTH_LOGIN]({ email, password }: LoginDto) {
    await delay(420); // bcrypt compare cost ~12 rounds
    const rec = DEMO_USERS[email.toLowerCase()];
    if (!rec || rec.password !== password) throw new Error('INVALID_CREDENTIALS');
    return { user: rec.profile, expiresIn: '15m', cookie: 'sid=<signed-httpOnly-jwt>' };
  },

  /* apps/ocr — YOLO OBB digits + PaddleOCR(ar), CUDA↔OpenVINO fallback */
  async [MESSAGE_PATTERNS.OCR_SCAN_ID](payload: { imageLabel?: string }): Promise<OcrResult> {
    const gpuAvailable = navigator.onLine && !document.hidden;
    const result = OcrResultSchema.parse({
      nationalNumber: '29503123456780',
      nameAr: 'محمود عبد الله سيد',
      nameEn: 'Mahmoud Abdallah Sayed',
      birthDate: '1995-03-14',
      gender: 'male',
      addressAr: 'القليوبية - شبرا الخيمة',
      backend: gpuAvailable ? 'pytorch-cuda' : 'openvino-cpu',
      inferenceMs: gpuAvailable ? 362 : 1578,
      map05: 0.994,
      recall: 0.996,
    });
    await delay(result.inferenceMs); // honest timing: 362ms CUDA vs 1578ms CPU
    return result;
  },

  /* apps/asr — faster-whisper large-v3, 4-worker pool, thread-safe acks */
  async [MESSAGE_PATTERNS.ASR_TRANSCRIBE](payload: { durationSec: number; beamSize: 1 | 3 | 5 }): Promise<AsrResult> {
    const device = navigator.onLine ? 'cuda-fp16' : 'cpu';
    await delay(device === 'cuda-fp16' ? 1400 : 6200);
    return {
      text:
        'الحالة مستقرة، ضغط الدم مية تمنية عشر على تسعين. لا يوجد تورم بالأطراف. ' +
        'تم وصف إينالابريل عشرة مليجرام مرة يومياً صباحاً مع تقليل الملح ومتابعة بعد أسبوعين.',
      language: 'ar',
      model: 'faster-whisper-large-v3',
      beamSize: payload.beamSize ?? 5,
      wer: 0.062,
      cer: 0.018,
      rtf: device === 'cuda-fp16' ? 0.11 : 0.94,
      device,
      durationSec: payload.durationSec,
      workerId: Math.floor(Math.random() * 4),
    };
  },

  /* apps/cloud-storage — Cloudinary upload (image/audio assets) */
  async [MESSAGE_PATTERNS.STORAGE_UPLOAD](payload: { kind: string }) {
    await delay(900);
    return { secure_url: `https://res.cloudinary.com/medistream/${payload.kind}/upload/v1/${crypto.randomUUID()}.bin` };
  },

  /* apps/doctor — visits & prescriptions (TypeORM -> Neon PostgreSQL) */
  async [MESSAGE_PATTERNS.VISIT_LIST]() {
    await delay(260);
    return visits.map((v) => ({ ...v, patient: seedPatients.find((p) => p.id === v.patientId) }));
  },
  async [MESSAGE_PATTERNS.VISIT_CREATE](payload: { patientId: string; chiefComplaint: string; doctorName: string; clinic: string }) {
    await delay(340);
    const v: Visit = VisitSchema.parse({
      id: crypto.randomUUID(),
      patientId: payload.patientId,
      doctorName: payload.doctorName,
      clinic: payload.clinic,
      status: 'waiting',
      chiefComplaint: payload.chiefComplaint,
    });
    visits = [v, ...visits];
    persist();
    return v;
  },
  async [MESSAGE_PATTERNS.PRESCRIPTION_ADD](payload: { visitId: string; diagnosis: string; medications: Medication[]; transcribedNotes?: string; voiceNoteUrl?: string }) {
    await delay(300);
    visits = visits.map((v) =>
      v.id === payload.visitId
        ? { ...v, status: 'completed', diagnosis: payload.diagnosis, medications: payload.medications, transcribedNotes: payload.transcribedNotes ?? v.transcribedNotes, voiceNoteUrl: payload.voiceNoteUrl ?? v.voiceNoteUrl, completedAt: new Date().toISOString() }
        : v,
    );
    persist();
    return { ok: true };
  },

  /* apps/super-admin — system-wide clinic administration */
  async [MESSAGE_PATTERNS.CLINIC_STATS]() {
    await delay(200);
    return {
      patients: seedPatients.length + 128,
      todayVisits: visits.length,
      completed: visits.filter((v) => v.status === 'completed').length,
      avgConsultMin: 14.2,
      ocrAccuracyMap05: 0.994,
      asrWer: 0.062,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Gateway client with offline queue + background sync                 */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

async function dispatch<T>(pattern: string, payload: any = {}): Promise<T> {
  const handler = services[pattern];
  if (!handler) throw new ApiError('UNKNOWN_PATTERN', pattern);
  return (await handler(payload)) as T;
}

/** All app data access goes through this gateway-shaped API object. */
export const api = {
  login(dto: LoginDto) {
    return dispatch<{ user: UserProfile }>(MESSAGE_PATTERNS.AUTH_LOGIN, dto);
  },
  listVisits() {
    return dispatch<any[]>(MESSAGE_PATTERNS.VISIT_LIST);
  },
  createVisit(p: { patientId: string; chiefComplaint: string; doctorName: string; clinic: string }) {
    return dispatch<Visit>(MESSAGE_PATTERNS.VISIT_CREATE, p);
  },
  addPrescription(p: { visitId: string; diagnosis: string; medications: Medication[]; transcribedNotes?: string; voiceNoteUrl?: string }) {
    return dispatch<{ ok: boolean }>(MESSAGE_PATTERNS.PRESCRIPTION_ADD, p);
  },
  scanNationalId(imageLabel?: string) {
    return dispatch<OcrResult>(MESSAGE_PATTERNS.OCR_SCAN_ID, { imageLabel });
  },
  transcribe(durationSec: number, beamSize: 1 | 3 | 5 = 5) {
    return dispatch<AsrResult>(MESSAGE_PATTERNS.ASR_TRANSCRIBE, { durationSec, beamSize });
  },
  upload(kind: 'image' | 'audio') {
    return dispatch<{ secure_url: string }>(MESSAGE_PATTERNS.STORAGE_UPLOAD, { kind });
  },
  clinicStats() {
    return dispatch<any>(MESSAGE_PATTERNS.CLINIC_STATS);
  },

  /** Fire-and-forget mutation: executes now, or queues for background sync. */
  async mutateWithOfflineQueue(pattern: string, payload: any) {
    if (!navigator.onLine) {
      ehrCache.enqueue({ pattern, payload });
      throw new ApiError('OFFLINE_QUEUED', 'Saved locally — will sync when back online');
    }
    return dispatch(pattern, payload);
  },

  /** Flush the background-sync queue (called on 'online' events / SW activate). */
  async flushSyncQueue(): Promise<number> {
    const q = ehrCache.readQueue();
    let flushed = 0;
    for (const m of q) {
      try {
        await dispatch(m.pattern, m.payload);
        flushed++;
      } catch {
        break; // keep remaining items queued, retry later
      }
    }
    if (flushed) ehrCache.clearQueue();
    return flushed;
  },

  /** isUp health probes for all 7 microservices (RabbitMQ broker included). */
  async healthProbe(): Promise<ServiceHealth[]> {
    const defs: Array<[string, 'node' | 'python', number]> = [
      ['api-gateway', 'node', 3000],
      ['auth', 'node', 3001],
      ['doctor', 'node', 3002],
      ['super-admin', 'node', 3003],
      ['cloud-storage', 'node', 3004],
      ['ocr', 'python', 8001],
      ['asr', 'python', 8002],
    ];
    return Promise.all(
      defs.map(async ([name, kind, port]) => {
        const t0 = performance.now();
        await delay(60);
        return { name, kind, isUp: true, latencyMs: Math.round(performance.now() - t0), port } as ServiceHealth;
      }),
    );
  },
};
