/**
 * Offline-first EHR cache + background sync queue.
 * Mirrors the PWA behaviour of the production app: visits are persisted to
 * localStorage so the clinic dashboard renders while offline, and mutations
 * made offline are queued and flushed when connectivity returns.
 */
import type { Visit } from '../libs/common';

const VISITS_KEY = 'medistream.visits.v1';
const QUEUE_KEY = 'medistream.sync.queue.v1';

export interface QueuedMutation {
  id: string;
  pattern: string; // RabbitMQ @MessagePattern the gateway would route to
  payload: unknown;
  enqueuedAt: number;
}

export const ehrCache = {
  loadVisits(): Visit[] {
    try {
      return JSON.parse(localStorage.getItem(VISITS_KEY) ?? '[]') as Visit[];
    } catch {
      return [];
    }
  },
  saveVisits(visits: Visit[]) {
    try {
      localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
    } catch {}
  },
  enqueue(mutation: Omit<QueuedMutation, 'id' | 'enqueuedAt'>): void {
    const q = ehrCache.readQueue();
    q.push({ ...mutation, id: crypto.randomUUID(), enqueuedAt: Date.now() });
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch {}
  },
  readQueue(): QueuedMutation[] {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedMutation[];
    } catch {
      return [];
    }
  },
  clearQueue(): void {
    try {
      localStorage.removeItem(QUEUE_KEY);
    } catch {}
  },
};
