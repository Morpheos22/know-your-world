/**
 * usePoke — Poke agent integration hook.
 *
 * C1 FIX: /api/ask-poke now requires Supabase JWT. Uses authedFetch.
 */
import { useState } from "react";
import { authedFetch, authErrorMessage } from "../lib/auth";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

interface PokeResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function usePoke() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const askPoke = async (params: {
    question: string;
    selectedAnswer: string;
    correctAnswer: string;
    category: string;
    continent: string;
    level?: "easy" | "medium" | "hard";
  }): Promise<void> => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const resp = await authedFetch(`${API_BASE}/api/ask-poke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (resp.status === 401 || resp.status === 403) {
        setError(authErrorMessage(resp.status) ?? "Please sign in.");
        return;
      }

      const data = (await resp.json()) as PokeResponse;
      if (data.ok) {
        setResponse(
          typeof data.data === "string" ? data.data : JSON.stringify(data.data),
        );
      } else {
        setError(data.error ?? "Poke couldn't respond");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return { askPoke, loading, response, error };
}
