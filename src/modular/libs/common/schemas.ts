/**
 * libs/common — Shared Kernel (@app/common)
 * Zod schemas are the single source of truth: frontend types are inferred
 * directly from these schemas, keeping frontend <-> backend (NestJS DTOs) in sync.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Domain constants                                                    */
/* ------------------------------------------------------------------ */

export const RABBITMQ_EXCHANGES = {
  rpc: 'medistream.rpc', // @MessagePattern request-response
  events: 'medistream.events', // @EventPattern fire-and-forget
} as const;

/** RPC message patterns routed by api-gateway -> microservices */
export const MESSAGE_PATTERNS = {
  AUTH_LOGIN: 'auth_login',
  PATIENT_FIND_BY_NID: 'patient_find_by_nid',
  PATIENT_CREATE: 'patient_create',
  VISIT_LIST: 'doctor_visit_list',
  VISIT_CREATE: 'doctor_visit_create',
  PRESCRIPTION_ADD: 'doctor_prescription_add',
  CLINIC_STATS: 'superadmin_clinic_stats',
  OCR_SCAN_ID: 'ocr_scan_id',
  ASR_TRANSCRIBE: 'asr_transcribe',
  STORAGE_UPLOAD: 'storage_upload',
} as const;

export const EHR_EVENTS = {
  PATIENT_REGISTERED: 'patient.registered',
  VISIT_STARTED: 'visit.started',
  VISIT_COMPLETED: 'visit.completed',
  PRESCRIPTION_ISSUED: 'prescription.issued',
  OCR_COMPLETED: 'ocr.completed',
  ASR_COMPLETED: 'asr.completed',
} as const;

export const ROLES = ['super_admin', 'doctor', 'receptionist', 'patient'] as const;
export type Role = (typeof ROLES)[number];

export const NATIONAL_ID_REGEX = /^[1-9]\d{13}$/; // 14-digit Egyptian National ID

/* ------------------------------------------------------------------ */
/* Validation schemas                                                  */
/* ------------------------------------------------------------------ */

export const NationalIdSchema = z
  .string()
  .trim()
  .regex(NATIONAL_ID_REGEX, 'National ID must be exactly 14 digits starting 1-9');

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Minimum 8 characters'),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const PatientSchema = z.object({
  id: z.string().uuid(),
  nationalId: NationalIdSchema,
  fullNameAr: z.string().min(1),
  fullNameEn: z.string().default(''),
  gender: z.enum(['male', 'female']),
  birthDate: z.string(), // YYYY-MM-DD
  phone: z.string().regex(/^01[0125]\d{8}$/, 'Invalid Egyptian mobile'),
  address: z.string().default(''),
  createdAt: z.string(),
});
export type Patient = z.infer<typeof PatientSchema>;

export const MedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().min(1), // e.g. "500mg"
  frequency: z.string().min(1), // e.g. "3x daily"
  durationDays: z.number().int().positive(),
});
export type Medication = z.infer<typeof MedicationSchema>;

const OcrPatientFields = z
  .object({
    fullNameAr: z.string(),
    fullNameEn: z.string(),
    gender: z.enum(['male', 'female']),
    birthDate: z.string(),
    addressAr: z.string(),
  })
  .partial();

export const VisitSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  doctorName: z.string(),
  clinic: z.string(),
  status: z.enum(['waiting', 'in_consultation', 'completed', 'cancelled']),
  chiefComplaint: z.string().default(''),
  diagnosis: z.string().default(''),
  medications: z.array(MedicationSchema).default([]),
  voiceNoteUrl: z.string().optional(), // Cloudinary secure_url of transcribed audio
  transcribedNotes: z.string().optional(), // ASR output (faster-whisper large-v3)
  ocrData: OcrPatientFields.optional(), // populated when patient registered via National-ID OCR
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});
export type Visit = z.infer<typeof VisitSchema>;

/* ---- OCR worker contract (apps/ocr, Python) ---- */
export const OcrResultSchema = z.object({
  nationalNumber: z.string().nullable(), // YOLO OBB 14-digit sequence, sorted left->right by x
  nameAr: z.string().nullable(), // PaddleOCR lang='ar'
  nameEn: z.string().nullable(),
  birthDate: z.string().nullable(),
  gender: z.enum(['male', 'female']).nullable(),
  addressAr: z.string().nullable(),
  backend: z.enum(['pytorch-cuda', 'openvino-cpu']),
  inferenceMs: z.number(), // e.g. 362 CUDA / 1578 OpenVINO CPU fallback
  map05: z.number().default(0.994),
  recall: z.number().default(0.996),
});
export type OcrResult = z.infer<typeof OcrResultSchema>;

/* ---- ASR worker contract (apps/asr, Python) ---- */
export const AsrResultSchema = z.object({
  text: z.string(),
  language: z.string().default('ar'),
  model: z.literal('faster-whisper-large-v3'),
  beamSize: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  wer: z.number().optional(), // Word Error Rate
  cer: z.number().optional(), // Character Error Rate
  rtf: z.number().optional(), // Real-Time Factor
  device: z.enum(['cuda-fp16', 'cuda-int8', 'cpu']),
  durationSec: z.number(),
  workerId: z.number().int().min(0).max(3), // 4-worker thread pool
});
export type AsrResult = z.infer<typeof AsrResultSchema>;

/* ---- Service health (isUp probes behind Nginx/TLS) ---- */
export const ServiceHealthSchema = z.object({
  name: z.string(),
  kind: z.enum(['node', 'python']),
  isUp: z.boolean(),
  latencyMs: z.number(),
  port: z.number(),
});
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;
