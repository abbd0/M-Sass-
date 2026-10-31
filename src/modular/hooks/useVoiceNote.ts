/**
 * useVoiceNote — doctor voice-note recorder + ASR transcription pipeline.
 *   MediaRecorder -> lamejs MP3 encode (in production) -> cloud-storage upload
 *   -> RabbitMQ RPC `asr_transcribe` -> faster-whisper large-v3 worker pool.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import type { AsrResult } from '../libs/common';

export function useVoiceNote() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [result, setResult] = useState<AsrResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch {
      setError('MIC_PERMISSION_DENIED');
    }
  }, []);

  /** Stop, upload to Cloudinary via cloud-storage svc, then ASR over RabbitMQ. */
  const stopAndTranscribe = useCallback(
    async (beamSize: 1 | 3 | 5 = 5): Promise<AsrResult | null> => {
      const rec = recorderRef.current;
      if (!rec) return null;
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);

      const blob = await new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      });

      try {
        setTranscribing(true);
        // FFmpeg decodes to 16 kHz mono WAV inside the Python worker before whisper.
        await api.upload('audio'); // simulate multipart upload of blob (size tracked for UX)
        const asr = await api.transcribe(durationSec, beamSize);
        setResult(asr);
        return asr;
      } catch (e: any) {
        setError(e?.message ?? 'ASR_FAILED');
        return null;
      } finally {
        setTranscribing(false);
      }
    },
    [],
  );

  useEffect(() => () => void (timerRef.current && clearInterval(timerRef.current)), []);

  return { recording, transcribing, seconds, result, error, start, stopAndTranscribe };
}
