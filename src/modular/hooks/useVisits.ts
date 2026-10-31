/**
 * useVisits — TanStack-Query-style server-state hook (SWR semantics).
 * In the production Next.js 14 app this is literally:
 *   useQuery({ queryKey: ['visits'], staleTime: 30_000, initialData: dehydrated })
 * Here we re-implement the same contract (cache + invalidate + prefetch) so the
 * component code is drop-in portable between AI-Studio preview and the monorepo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/apiClient';

export interface VisitRow {
  id: string;
  patientId: string;
  patient?: { fullNameAr: string; nationalId: string; gender: string };
  doctorName: string;
  clinic: string;
  status: 'waiting' | 'in_consultation' | 'completed' | 'cancelled';
  chiefComplaint: string;
  diagnosis: string;
  medications: Array<{ name: string; dose: string; frequency: string; durationDays: number }>;
  transcribedNotes?: string;
  voiceNoteUrl?: string;
}

const STALE_MS = 30_000; // staleTime — matches React Query config in the repo

type CacheState = { data: VisitRow[]; fetchedAt: number };
let cache: CacheState | null = null; // module-level SWR cache (shared across hook instances)
const listeners = new Set<() => void>();
let inflight: Promise<VisitRow[]> | null = null;

async function fetcher(): Promise<VisitRow[]> {
  if (inflight) return inflight; // dedupe concurrent identical queries
  inflight = api.listVisits().then((rows) => {
    cache = { data: rows as VisitRow[], fetchedAt: Date.now() };
    inflight = null;
    listeners.forEach((l) => l());
    return rows as VisitRow[];
  });
  return inflight;
}

export function invalidateVisits() {
  cache = null; // query invalidation -> next read refetches
  fetcher().catch(() => {});
}

export function prefetchVisits() {
  if (!cache || Date.now() - cache.fetchedAt > STALE_MS) fetcher().catch(() => {});
}

export function useVisits() {
  const [, forceRender] = useState(0);
  const [isFetching, setIsFetching] = useState(!cache);
  const notify = useCallback(() => forceRender((n) => n + 1), []);

  useEffect(() => {
    listeners.add(notify);
    if (!cache || Date.now() - cache.fetchedAt > STALE_MS) {
      setIsFetching(true);
      fetcher().finally(() => setIsFetching(false));
    }
    return () => {
      listeners.delete(notify);
    };
  }, [notify]);

  // Offline resilience: when connectivity returns, flush sync queue + refetch.
  useEffect(() => {
    const onOnline = async () => {
      await api.flushSyncQueue();
      invalidateVisits();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return {
    visits: cache?.data ?? [],
    isFetching,
    isStale: !cache || Date.now() - cache.fetchedAt > STALE_MS,
    refetch: async () => {
      cache = null;
      setIsFetching(true);
      await fetcher().finally(() => setIsFetching(false));
    },
  };
}
