import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client";

// ============================================
// TYPES
// ============================================

export interface ClusterMember {
  id: string;
  jukirId: string;
  name: string;
  clusterLabel: number;
  gmmProbability: number;
  dailyEarnings: number;
  workConsistency: number;
  punctualityPercent: number;
}

export interface ClusterStat {
  count: number;
  avgEarnings: number;
  avgConsistency: number;
  avgPunctuality: number;
}

/** Shape dari GET /analytics/segmentation/latest (admin). */
export interface AdminSegmentation {
  analyzedDate: string;
  totalJukir: number;
  members: ClusterMember[];
  clusterStatistics: Record<number, ClusterStat>;
}

/** Shape dari GET /analytics/segmentation/me (jukir). */
export interface JukirSegmentation {
  analyzedDate: string;
  totalJukir: number;
  members: ClusterMember[];
  clusterStatistics: Record<number, ClusterStat>;
  me: (ClusterMember & { rank: number | null; clusterSize: number | null }) | null;
}

export interface ModelInfo {
  analyzedDate: string | null;
  analysisWindowDays: number | null;
  optimalClusters: number | null;
  bicScores: Record<string, number>;
}

export interface ForecastPoint {
  date: string;
  lower: number;
  point: number;
  upper: number;
}

export interface ForecastArea {
  area_name: string;
  model_aic?: number;
  model_bic?: number;
  model_rmse?: number;
  forecast: ForecastPoint[];
}

export type ForecastPayload = Record<string, ForecastArea>;

// ============================================
// FETCHERS
// ============================================

/**
 * Admin: /segmentation/latest mengembalikan `clusters` sebagai objek
 * ter-group (Record<clusterLabel, row[]>) dengan relasi `jukir` ter-nest.
 * Di sini diratakan jadi array datar supaya seragam dengan view jukir.
 */
export async function fetchAdminSegmentation(): Promise<AdminSegmentation> {
  const { data } = await api.get("/analytics/segmentation/latest");
  const d = data.data;

  const grouped: Record<string, any[]> = d.clusters ?? {};
  const members: ClusterMember[] = Object.values(grouped)
    .flat()
    .map((r: any) => ({
      id: r.id,
      jukirId: r.jukirId,
      name: r.jukir?.name ?? "—",
      clusterLabel: r.clusterLabel,
      gmmProbability: r.gmmProbability,
      dailyEarnings: r.dailyEarnings,
      workConsistency: r.workConsistency,
      punctualityPercent: r.punctualityPercent,
    }));

  return {
    analyzedDate: d.analyzedDate,
    totalJukir: d.totalJukir ?? members.length,
    members,
    clusterStatistics: d.clusterStatistics ?? {},
  };
}

export async function fetchJukirSegmentation(): Promise<JukirSegmentation> {
  const { data } = await api.get("/analytics/segmentation/me");
  return data.data;
}

export async function fetchModelInfo(): Promise<ModelInfo> {
  const { data } = await api.get("/analytics/segmentation/model-info");
  return data.data;
}

export async function fetchForecast(): Promise<ForecastPayload> {
  const { data } = await api.get("/analytics/forecast/latest");
  return data.data;
}

// ============================================
// AUTO-REFRESH HOOK
// ============================================

export interface AutoRefreshState<T> {
  data: T | null;
  error: string | null;
  /** true hanya pada pemuatan pertama; refresh berikutnya tidak mengosongkan UI. */
  loading: boolean;
  /** true jika sumber data belum ada (HTTP 404), bukan error sungguhan. */
  empty: boolean;
  refresh: () => void;
}

/**
 * Polling sederhana dengan guard in-flight supaya respons lambat tidak menumpuk.
 * Data analitik hanya berubah bulanan, jadi 60s sudah jauh lebih sering
 * daripada perubahan datanya sendiri.
 */
export function useAutoRefresh<T>(
  fetcher: () => Promise<T>,
  intervalMs = 60_000,
): AutoRefreshState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const inFlight = useRef(false);
  const alive = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    if (inFlight.current) return; // cegah penumpukan request
    inFlight.current = true;
    try {
      const result = await fetcherRef.current();
      if (!alive.current) return;
      setData(result);
      setError(null);
      setEmpty(false);
    } catch (err: any) {
      if (!alive.current) return;
      if (err?.response?.status === 404) {
        setEmpty(true);
        setError(null);
      } else {
        setError(err?.response?.data?.message ?? "Gagal memuat data analitik");
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [run, intervalMs]);

  return { data, error, loading, empty, refresh: run };
}

// ============================================
// HELPERS
// ============================================

export const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

export const compactRupiah = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(n) >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${Math.round(n)}`;
};

/** Warna konsisten per cluster di seluruh chart. */
export const CLUSTER_COLORS = ["#0066cc", "#00aa66", "#ff6600", "#9b59b6", "#e74c3c", "#16a085"];

export const clusterColor = (label: number) => CLUSTER_COLORS[label % CLUSTER_COLORS.length];

/**
 * Label performa dihitung di sisi klien saja dan TIDAK PERNAH disimpan ke
 * database — menjaga aturan integritas agar hasil clustering tidak bias.
 */
export function performanceLabel(earnings: number, punctuality: number): string {
  if (earnings > 5_500_000 && punctuality > 90) return "Tinggi";
  if (earnings > 3_500_000 && punctuality > 75) return "Stabil";
  if (earnings < 4_000_000 || punctuality < 70) return "Perlu Pendampingan";
  return "Stabil";
}
