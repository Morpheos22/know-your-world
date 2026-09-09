/**
 * useScores — API client for the Know Your World backend.
 *
 * C1 FIX: POST /api/scores now requires Supabase JWT. We use authedFetch
 * to inject the Authorization header. GET /api/leaderboards stays public.
 */
import { useCallback, useState } from "react";
import type { Continent, Category } from "../data/types";
import { authedFetch, authErrorMessage } from "../lib/auth";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

// ---- Type mapping: frontend Category -> backend category string ----
const CATEGORY_TO_API: Record<Category, string> = {
  Countries: "capitals",
  Presidents: "presidents",
  Flags: "flags",
  Currencies: "currencies",
};

// ---- Frontend Continent names already match backend (lowercased) ----
function continentToApi(c: Continent): string {
  return c.toLowerCase();
}

function levelToApi(level: number): string {
  if (level === 1) return "easy";
  if (level === 2) return "medium";
  return "hard";
}

// ---- API types ----
interface ScoreSubmissionPayload {
  name: string;
  continent: string;
  category: string;
  level: string;
  score: number;
  total: number;
  timeMs: number;
  passed: boolean;
}

export interface ScoreSubmissionResult {
  id: number;
  rank: number;
  totalEntries: number;
  percentile: number;
  isHighScore: boolean;
  personalBest: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  total: number;
  timeMs: number;
  passed: boolean;
  createdAt: number;
}

export interface LeaderboardResult {
  track: { continent: string; category: string; level: string };
  entries: LeaderboardEntry[];
  totalEntries: number;
}

// ---- Hook ----

interface UseScoresResult {
  submitScore: (params: {
    name: string;
    continent: Continent;
    category: Category;
    level: number;
    score: number;
    total: number;
    timeMs: number;
    passed: boolean;
  }) => Promise<
    { ok: true; data: ScoreSubmissionResult } | { ok: false; error: string }
  >;

  fetchLeaderboard: (params: {
    continent: Continent;
    category: Category;
    level: number;
    limit?: number;
  }) => Promise<
    { ok: true; data: LeaderboardResult } | { ok: false; error: string }
  >;

  submitting: boolean;
  lastSubmission: ScoreSubmissionResult | null;
}

export function useScores(): UseScoresResult {
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] =
    useState<ScoreSubmissionResult | null>(null);

  const submitScore = useCallback(
    async (
      params: Parameters<UseScoresResult["submitScore"]>[0],
    ): Promise<
      { ok: true; data: ScoreSubmissionResult } | { ok: false; error: string }
    > => {
      setSubmitting(true);
      try {
        const payload: ScoreSubmissionPayload = {
          name: params.name,
          continent: continentToApi(params.continent),
          category: CATEGORY_TO_API[params.category],
          level: levelToApi(params.level),
          score: params.score,
          total: params.total,
          timeMs: params.timeMs,
          passed: params.passed,
        };
        const resp = await authedFetch(`${API_BASE}/api/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          const authErr = authErrorMessage(resp.status);
          return {
            ok: false,
            error: authErr ?? body.error ?? `Server error (${resp.status})`,
          };
        }
        const data = (await resp.json()) as ScoreSubmissionResult;
        setLastSubmission(data);
        return { ok: true, data };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const fetchLeaderboard = useCallback(
    async (
      params: Parameters<UseScoresResult["fetchLeaderboard"]>[0],
    ): Promise<
      { ok: true; data: LeaderboardResult } | { ok: false; error: string }
    > => {
      try {
        const qs = new URLSearchParams({
          continent: continentToApi(params.continent),
          category: CATEGORY_TO_API[params.category],
          level: levelToApi(params.level),
          limit: String(params.limit ?? 10),
        });
        const resp = await fetch(
          `${API_BASE}/api/leaderboards?${qs.toString()}`,
        );
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          return {
            ok: false,
            error: body.error ?? `Server error (${resp.status})`,
          };
        }
        const data = (await resp.json()) as LeaderboardResult;
        return { ok: true, data };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    },
    [],
  );

  return { submitScore, fetchLeaderboard, submitting, lastSubmission };
}
