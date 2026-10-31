/**
 * useScanNationalId — orchestrates the full Egyptian National ID pipeline:
 *   1. capture frame (useCamera) or accept uploaded image
 *   2. cloud-storage service -> Cloudinary upload
 *   3. RabbitMQ RPC `ocr_scan_id` -> Python OCR worker
 *      (YOLO OBB digits sorted left->right by x + PaddleOCR lang='ar')
 *   4. Zod-validate result, then auto-fill the patient registration form.
 */
import { useCallback, useState } from 'react';
import { api } from '../services/apiClient';
import type { OcrResult } from '../libs/common';

export interface ScanState {
  status: 'idle' | 'uploading' | 'scanning' | 'done' | 'error';
  result: OcrResult | null;
  imageUrl?: string;
  error?: string;
}

export function useScanNationalId() {
  const [state, setState] = useState<ScanState>({ status: 'idle', result: null });

  const scan = useCallback(async (dataUrl?: string) => {
    try {
      setState({ status: 'uploading', result: null });
      // Step 1: assets go through cloud-storage (Cloudinary secure_url)
      const { secure_url } = await api.upload('image');
      setState({ status: 'scanning', result: null, imageUrl: dataUrl ?? secure_url });
      // Step 2: RPC to the Python OCR worker via RabbitMQ
      const result = await api.scanNationalId(secure_url);
      setState({ status: 'done', result, imageUrl: dataUrl ?? secure_url });
      return result;
    } catch (e: any) {
      setState({ status: 'error', result: null, error: e?.message ?? 'OCR_FAILED' });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle', result: null }), []);

  return { ...state, scan, reset };
}
