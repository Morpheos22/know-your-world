/**
 * useTts — text-to-speech hook for the quiz game.
 *
 * Playback flow:
 *   - Click listen button → plays (if not already playing this text)
 *   - Click again → stops
 *   - When question changes → stops automatically
 *
 * Accepts a voiceId to select which ElevenLabs voice to use.
 */
import { useCallback, useRef, useState } from "react";
import { DEFAULT_VOICE_ID } from "../data/voices";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

interface TtsResponse {
  audio: string;
  contentType: string;
  provider: "elevenlabs" | "workers-ai";
  cached: boolean;
}

export function useTts(voiceId: string = DEFAULT_VOICE_ID) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setCurrentlyPlaying(null);
  }, []);

  const buildQuestionText = useCallback(
    (question: string, options: string[]): string => {
      const labels = ["A", "B", "C", "D"];
      const optionParts = options.slice(0, 4).map((opt, i) => {
        return `${labels[i]}: ${opt}`;
      });
      return `${question}. ${optionParts.join(". ")}.`;
    },
    [],
  );

  const speak = useCallback(
    async (text: string, overrideVoiceId?: string): Promise<void> => {
      if (!text || text.length === 0) return;
      const vId = overrideVoiceId ?? voiceId;
      const cacheKey = `${vId}:${text}`;

      // TOGGLE BEHAVIOR: if this exact text is currently playing, stop it
      if (currentlyPlaying === cacheKey && audioRef.current) {
        stop();
        return;
      }

      // Stop any other currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      setError(null);

      let audioBase64 = cacheRef.current.get(cacheKey);

      if (!audioBase64) {
        setLoading(true);
        try {
          const resp = await fetch(`${API_BASE}/api/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voiceId: vId }),
          });

          if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            throw new Error(body.error ?? `Server error (${resp.status})`);
          }

          const data = (await resp.json()) as TtsResponse;
          audioBase64 = data.audio;
          cacheRef.current.set(cacheKey, audioBase64);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to generate audio",
          );
          setLoading(false);
          return;
        }
      }

      setLoading(false);

      try {
        const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
        audioRef.current = audio;
        setCurrentlyPlaying(cacheKey);

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
    },
    [voiceId, currentlyPlaying, stop],
  );

  const speakQuestion = useCallback(
    (question: string, options: string[], overrideVoiceId?: string) => {
      const fullText = buildQuestionText(question, options);
      return speak(fullText, overrideVoiceId);
    },
    [speak, buildQuestionText],
  );

  /**
   * Pre-fetch audio for a question without playing it.
   * This warms the cache so when the player clicks play, the audio is instant.
   * Called when a new question appears, pre-fetches in the background.
   */
  const prefetchQuestion = useCallback(
    (question: string, options: string[], overrideVoiceId?: string) => {
      const vId = overrideVoiceId ?? voiceId;
      const fullText = buildQuestionText(question, options);
      const cacheKey = `${vId}:${fullText}`;

      // Skip if already cached
      if (cacheRef.current.has(cacheKey)) return;

      // Fire and forget — don't await, don't set loading state
      fetch(`${API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText, voiceId: vId }),
      })
        .then((resp) => resp.json())
        .then((data: TtsResponse) => {
          cacheRef.current.set(cacheKey, data.audio);
        })
        .catch(() => {
          // Silent failure — pre-fetch is best-effort
        });
    },
    [voiceId, buildQuestionText],
  );

  return {
    speak,
    speakQuestion,
    prefetchQuestion,
    stop,
    loading,
    error,
    currentlyPlaying,
    isPlaying: (text: string) => currentlyPlaying === `${voiceId}:${text}`,
    isPlayingQuestion: (question: string, options: string[]): boolean => {
      const fullText = buildQuestionText(question, options);
      return currentlyPlaying === `${voiceId}:${fullText}`;
    },
  };
}
