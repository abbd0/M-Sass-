/**
 * Gemini AI integration (@google/genai) — the "AI-Enhanced" layer of Medistream.
 * Runs fully client-side (API key from process.env.API_KEY / AI-Studio env).
 *
 * Capabilities exposed to the UI:
 *  - aiDraftVisitSummary: turns ASR-transcribed Arabic voice notes into a
 *    structured English clinical summary + suggested medications.
 *  - aiCheckNationalId: sanity-checks OCR output against Egyptian NID rules.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { AsrResult, OcrResult } from '../libs/common';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function aiDraftVisitSummary(
  transcribedNotesAr: string,
  chiefComplaint: string,
): Promise<{ summaryEn: string; suggestedDiagnosis: string; suggestedMeds: Array<{ name: string; dose: string; frequency: string; durationDays: number }> }> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `You are a clinical documentation assistant for an Egyptian outpatient cardiology/internal-medicine clinic.
Chief complaint (EN): ${chiefComplaint}
Doctor's dictated voice note (AR, transcribed by faster-whisper large-v3): """${transcribedNotesAr}"""

Return a JSON object with:
- summaryEn: concise professional English visit summary (max 60 words)
- suggestedDiagnosis: most probable working diagnosis
- suggestedMeds: array of {name, dose, frequency, durationDays} consistent with Egyptian formulary`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summaryEn: { type: Type.STRING },
          suggestedDiagnosis: { type: Type.STRING },
          suggestedMeds: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                dose: { type: Type.STRING },
                frequency: { type: Type.STRING },
                durationDays: { type: Type.INTEGER },
              },
              required: ['name', 'dose', 'frequency', 'durationDays'],
            },
          },
        },
        required: ['summaryEn', 'suggestedDiagnosis', 'suggestedMeds'],
      },
    },
  });
  return JSON.parse(response.text ?? '{}');
}

export async function aiCheckNationalId(ocr: OcrResult): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Egyptian National ID OCR result: number=${ocr.nationalNumber}, birthDate=${ocr.birthDate}, gender=${ocr.gender}, nameAr=${ocr.nameAr}.
In 1-2 sentences, verify plausibility (14 digits, century digit 2/3, gender digit, birth date vs number) and flag anything the receptionist should re-check. Answer in the language of the fields (Arabic preferred).`,
  });
  return response.text ?? '';
}
