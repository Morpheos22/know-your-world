/**
 * useTts — text-to-speech hook for the quiz game.
 *
 * Calls the Worker's /api/tts endpoint, which proxies to ElevenLabs (Morpheos
 * voice) with Workers AI fallback and D1 caching.
 *
 * In-memory cache: once a text's audio is fetched, it's stored in a Map
 * for the session so replaying the same text is instant.
 *
 * Two speak methods:
 *   - speak(text)         — reads a single text (facts, simple content)
 *   - speakQuestion(q, opts) — reads "Question. A: opt1. B: opt2. C: opt3. D: opt4."
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

  /**
   * Build the full TTS text for a question with its options.
   * Format: "Question text. A: option1. B: option2. C: option3. D: option4."
   *
   * The letter labels (A/B/C/D) match the on-screen badges so kids can
   * follow along visually as the voice reads each option.
   */
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

  /**
   * Speak a question with its options.
   * Builds "Question. A: opt1. B: opt2. C: opt3. D: opt4." and calls speak().
   *
   * @param question The question text
   * @param options The 4 option strings (in display order, matches A/B/C/D badges)
   */
  const speakQuestion = useCallback(
    (question: string, options: string[]): Promise<void> => {
      const fullText = buildQuestionText(question, options);
      return speak(fullText);
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
    isPlaying: (text: string) => currentlyPlaying === text,
    /** Check if a specific question+options combo is currently playing */
    isPlayingQuestion: (question: string, options: string[]): boolean => {
      const fullText = buildQuestionText(question, options);
      return currentlyPlaying === fullText;
    },
  };
}
