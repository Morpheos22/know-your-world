/**
 * usePoke — Poke agent integration hook.
 *
 * - askPoke(): sends a missed question to Poke for tutoring
 * - Records the mistake in D1 via the Worker endpoint
 */
import { useState } from "react";

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
  }): Promise<void> => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const resp = await fetch(`${API_BASE}/api/ask-poke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

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
