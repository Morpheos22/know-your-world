/**
 * useTts — text-to-speech hook for the quiz game.
 *
 * Calls the Worker's /api/tts endpoint, which proxies to ElevenLabs with
 * Workers AI fallback and D1 caching.
 *
 * Accepts a voiceId to select which ElevenLabs voice to use. Defaults to
 * the freemium voice "jessica" if not specified.
 *
 * In-memory cache: keyed by `${voiceId}:${text}` so the same text in
 * different voices is cached separately.
 *
 * Two speak methods:
 *   - speak(text)         — reads a single text (facts, simple content)
 *   - speakQuestion(q, opts) — reads "Question. A: opt1. B: opt2. C: opt3. D: opt4."
 *   - speakDemo(text, voiceId) — reads a 4-second demo of a premium voice
 */
import { useCallback, useRef, useState } from "react";
import { DEFAULT_VOICE_ID } from "../data/voices";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

interface TtsResponse {
  audio: string; // base64
  contentType: string;
  provider: "elevenlabs" | "workers-ai";
  cached: boolean;
}

export function useTts(voiceId: string = DEFAULT_VOICE_ID) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);

  // Session-level cache: `${voiceId}:${text}` -> base64 audio
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

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      setError(null);

      // Cache key includes voice ID so different voices are cached separately
      const cacheKey = `${vId}:${text}`;
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

      // Play the audio
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
    [voiceId],
  );

  const speakQuestion = useCallback(
    (question: string, options: string[], overrideVoiceId?: string) => {
      const fullText = buildQuestionText(question, options);
      return speak(fullText, overrideVoiceId);
    },
    [speak, buildQuestionText],
  );

  return {
    speak,
    speakQuestion,
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
