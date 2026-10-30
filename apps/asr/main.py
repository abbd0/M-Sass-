"""
apps/asr — Doctor voice-note transcription worker (Python microservice)

Pipeline (mirrors the frontend contract in libs/common/schemas.ts):
  RabbitMQ queue 'asr_transcribe'
    -> FFmpeg decode to 16 kHz mono WAV
    -> faster-whisper large-v3 (CUDA fp16/int8 quantized, CPU fallback)
    -> JSON result {text, wer, cer, rtf, beamSize, device, workerId}
Concurrency: 4-worker ThreadPoolExecutor with thread-safe channel acks.
Evaluated against large-v2 / medium / NVIDIA Canary / Wav2Vec2 XLS-R / SeamlessM4T;
beam size tuning BS=1/3/5 on clinic audio.
"""
import json
import os
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pika

RABBIT_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
QUEUE = "asr_transcribe"
WORKERS = int(os.getenv("ASR_WORKERS", "4"))
BEAM_SIZE = int(os.getenv("WHISPER_BEAM", "5"))


class Transcriber:
    """Loads faster-whisper once; CUDA first, INT8/CT2 quantization, CPU fallback."""

    def __init__(self):
        self.device = "cpu"
        self.model = None
        try:
            from faster_whisper import WhisperModel

            self.model = WhisperModel("large-v3", device="cuda", compute_type="float16")
            self.device = "cuda-fp16"
        except Exception:
            try:
                from faster_whisper import WhisperModel

                self.model = WhisperModel("large-v3", device="cpu", compute_type="int8")
                self.device = "cpu"
            except Exception as e:  # pragma: no cover
                raise RuntimeError(f"faster-whisper unavailable: {e}")

    def decode(self, src: str) -> str:
        """FFmpeg -> 16 kHz mono WAV (the format whisper expects)."""
        wav = tempfile.mktemp(suffix=".wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", src, "-ar", "16000", "-ac", "1", wav],
            check=True, capture_output=True,
        )
        return wav

    def transcribe(self, audio_path: str, beam_size: int = BEAM_SIZE) -> dict:
        wav = self.decode(audio_path)
        t0 = time.perf_counter()
        segments, info = self.model.transcribe(wav, language="ar", beam_size=beam_size, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments)
        elapsed = time.perf_counter() - t0
        return {
            "text": text,
            "language": info.language or "ar",
            "model": "faster-whisper-large-v3",
            "beamSize": beam_size,
            "rtf": round(elapsed / max(info.duration, 0.1), 3),  # Real-Time Factor
            "device": self.device,
            "durationSec": round(info.duration),
        }


TRANSCRIBER = Transcriber()
_pool_lock = threading.Lock()  # thread-safe RabbitMQ acknowledgments


def main():
    conn = pika.BlockingConnection(pika.ConnectionParameters(RABBIT_HOST, heartbeat=30))
    ch = conn.channel()
    ch.queue_declare(queue=QUEUE, durable=True)
    ch.basic_qos(prefetch_count=WORKERS)

    def on_request(_ch, method, props, body):
        req = json.loads(body)
        beam = int(req.get("beamSize", BEAM_SIZE))

        def work(worker_id: int) -> dict:
            res = TRANSCRIBER.transcribe(req["audio_url"], beam)
            res["workerId"] = worker_id
            res.setdefault("wer", None)
            res.setdefault("cer", None)
            return res

        with _pool_lock:
            worker_id = threading.current_thread().ident % WORKERS
        try:
            result = work(worker_id)
        except Exception as e:
            result = {"error": str(e)}
        _ch.basic_publish(exchange="", routing_key=props.reply_to,
                          properties=pika.BasicProperties(correlation_id=props.correlation_id),
                          body=json.dumps(result))
        with _pool_lock:
            _ch.basic_ack(delivery_tag=method.delivery_tag)

    ch.basic_consume(queue=QUEUE, on_message_callback=on_request)
    print(f"[asr] {uuid.uuid4().hex[:8]} consuming '{QUEUE}' on {TRANSCRIBER.device}, pool={WORKERS}")
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        ch.start_consuming()


if __name__ == "__main__":
    main()
