/**
 * useTts — text-to-speech hook for the quiz game.
 *
 * Calls the Worker's /api/tts endpoint, which proxies to ElevenLabs (Morpheos
 * voice) with Workers AI fallback and D1 caching.
 *
 * In-memory cache: once a question's audio is fetched, it's stored in a Map
 * for the session so replaying the same question is instant.
 */
import { useCallback, useRef, useState } from "react";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

interface TtsResponse {
  audio: string; // base64
  contentType: string;
  provider: "elevenlabs" | "workers-ai";
  cached: boolean;
}

export function useTts() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);

  // Session-level cache: text -> base64 audio
  const cacheRef = useRef<Map<string, string>>(new Map());
  // Currently active audio element
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setCurrentlyPlaying(null);
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (!text || text.length === 0) return;

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setError(null);

    // Check session cache first
    let audioBase64 = cacheRef.current.get(text);

    if (!audioBase64) {
      setLoading(true);
      try {
        const resp = await fetch(`${API_BASE}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error (${resp.status})`);
        }

        const data = (await resp.json()) as TtsResponse;
        audioBase64 = data.audio;
        cacheRef.current.set(text, audioBase64);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to generate audio",
        );
        setLoading(false);
        return;
      }
    }

    setLoading(false);

    // Play the audio
    try {
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      audioRef.current = audio;
      setCurrentlyPlaying(text);

      audio.onended = () => {
        setCurrentlyPlaying(null);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setError("Failed to play audio");
        setCurrentlyPlaying(null);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to play audio");
      setCurrentlyPlaying(null);
      audioRef.current = null;
    }
  }, []);

  return {
    speak,
    stop,
    loading,
    error,
    currentlyPlaying,
    isPlaying: (text: string) => currentlyPlaying === text,
  };
}
