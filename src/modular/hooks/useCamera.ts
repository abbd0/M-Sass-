/**
 * useCamera — webcam capture for the Egyptian National ID OCR flow.
 * Grabs a stream via getUserMedia, exposes start/stop/capture; the captured
 * frame is uploaded through cloud-storage (Cloudinary) and sent to the OCR
 * worker over RabbitMQ (`ocr_scan_id`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'CAMERA_PERMISSION_DENIED' : 'NO_CAMERA');
      setActive(false);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  /** Freeze the current frame -> JPEG data URL (fed to YOLO detection). */
  const capture = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !streamRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, active, error, start, stop, capture };
}
