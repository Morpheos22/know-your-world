/**
 * useVoice — manages the player's selected TTS voice.
 *
 * - Stores the selected voice ID in localStorage
 * - Defaults to Jessica (playful, bright, warm)
 * - Only freemium voices are selectable (premium requires purchase — Phase 4)
 * - Legacy voice (Morpheos) is not selectable, auto-triggered on failure
 */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_VOICE_ID, getVoice } from "../data/voices";

const STORAGE_KEY = "kyw_voice_id";

function readStoredVoice(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Validate it's a freemium voice
      const voice = getVoice(stored);
      if (voice && voice.category === "freemium") {
        return stored;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_VOICE_ID;
}

export function useVoice() {
  const [voiceId, setVoiceIdState] = useState<string>(DEFAULT_VOICE_ID);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setVoiceIdState(readStoredVoice());
    setHydrated(true);
  }, []);

  const setVoiceId = useCallback((id: string) => {
    const voice = getVoice(id);
    // Only allow freemium voices to be selected (premium requires purchase)
    if (voice && voice.category === "freemium") {
      setVoiceIdState(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // ignore
      }
    }
  }, []);

  return { voiceId, setVoiceId, hydrated };
}
