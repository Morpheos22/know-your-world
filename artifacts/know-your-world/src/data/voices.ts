/**
 * Voice catalog — defines all available TTS voices.
 *
 * Categories:
 *   - freemium: Free for all players. Selectable in the voice picker.
 *   - premium: Locked. Players can hear a 4-second demo, but must purchase
 *              to use in the game (Phase 4 — payment gating). N500 each.
 *   - legacy: Morpheos. Not selectable. Auto-triggers on failure screen
 *             and globe mini-game (Phase 3).
 *
 * Freemium (3): from the user's ElevenLabs premade voices
 * Premium (10): 6 female + 4 male, sourced from ElevenLabs Voice Library
 * Legacy (1): Morpheos, the original voice
 */

export type VoiceCategory = "freemium" | "premium" | "legacy";
export type VoiceGender = "female" | "male";

export interface Voice {
  id: string;
  name: string;
  elevenLabsId: string;
  category: VoiceCategory;
  gender: VoiceGender;
  description: string;
  accent: string;
}

export const VOICES: Voice[] = [
  // ========================================================================
  // FREEMIUM (3) — free for all players
  // ========================================================================
  {
    id: "jessica",
    name: "Jessica",
    elevenLabsId: "cgSgspJ2msm6clMCkdW9",
    category: "freemium",
    gender: "female",
    description: "Playful, Bright, Warm",
    accent: "American",
  },
  {
    id: "laura",
    name: "Laura",
    elevenLabsId: "FGY2WhTYpPnrIDTdsKH5",
    category: "freemium",
    gender: "female",
    description: "Enthusiast, Quirky Attitude",
    accent: "American",
  },
  {
    id: "charlie",
    name: "Charlie",
    elevenLabsId: "IKne3meq5aSn9XLyUdCD",
    category: "freemium",
    gender: "male",
    description: "Deep, Confident, Energetic",
    accent: "Australian",
  },

  // ========================================================================
  // PREMIUM (10) — locked, 4-second demo only, purchase to unlock (N500 each)
  // 6 female + 4 male, sourced from ElevenLabs Voice Library
  // ========================================================================
  {
    id: "jazzy",
    name: "Jazzy Larroy",
    elevenLabsId: "lBIlRrTlN5ZTPkQzWrCc",
    category: "premium",
    gender: "female",
    description: "Warm, expressive teacher with jazz-inspired quality",
    accent: "American",
  },
  {
    id: "beth",
    name: "Beth",
    elevenLabsId: "utezIGbCLSGO3Z7oKJwL",
    category: "premium",
    gender: "female",
    description: "Intelligent, warm, approachable",
    accent: "British",
  },
  {
    id: "sally",
    name: "Sally",
    elevenLabsId: "6Sau1r3osO0DDuk8TAi3",
    category: "premium",
    gender: "female",
    description: "Young, clear, natural, warm, conversational",
    accent: "British",
  },
  {
    id: "alisha",
    name: "Alisha",
    elevenLabsId: "x60qi81yLOkhyoqo0iH2",
    category: "premium",
    gender: "female",
    description: "Bright, animated, upbeat Gen Z vlogger",
    accent: "American",
  },
  {
    id: "natasha",
    name: "Natasha",
    elevenLabsId: "FBS8ofW8J5OOpakRj2cI",
    category: "premium",
    gender: "female",
    description: "Warm, natural, polished delivery",
    accent: "British",
  },
  {
    id: "aleja",
    name: "Aleja",
    elevenLabsId: "gvu7T7CL0qv3iEbOiaTF",
    category: "premium",
    gender: "female",
    description: "Storytelling voice, distinctive and approachable",
    accent: "American",
  },
  {
    id: "jeremy",
    name: "Jeremy",
    elevenLabsId: "FH7lRgC0mVybq7Y40tMa",
    category: "premium",
    gender: "male",
    description: "Warm, trustworthy, sincere",
    accent: "American",
  },
  {
    id: "zain",
    name: "Zain",
    elevenLabsId: "kTmRervbB02qoZhoY4dF",
    category: "premium",
    gender: "male",
    description: "Gentle kids story narrator, warm and playful",
    accent: "American",
  },
  {
    id: "rupert",
    name: "Rupert",
    elevenLabsId: "cROcuppTjlT7WHGPhWiH",
    category: "premium",
    gender: "male",
    description: "Articulate, polished, dynamic",
    accent: "British",
  },
  {
    id: "david",
    name: "David",
    elevenLabsId: "J6fZJ9oZVkfNAzrfGJiQ",
    category: "premium",
    gender: "male",
    description: "North London British narrator, natural character",
    accent: "British",
  },

  // ========================================================================
  // LEGACY (1) — Morpheos. Not selectable. Auto-triggers on failure.
  // ========================================================================
  {
    id: "morpheos",
    name: "Morpheos",
    elevenLabsId: "FneGH0QzKZCLmpj2XRD9",
    category: "legacy",
    gender: "male",
    description: "Legacy voice — failure screen & mini-game",
    accent: "Nigerian",
  },
];

/** Get a voice by its ID */
export function getVoice(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id);
}

/** Get the ElevenLabs voice ID for a given voice ID */
export function getElevenLabsId(voiceId: string): string {
  const voice = getVoice(voiceId);
  return voice?.elevenLabsId ?? VOICES[0].elevenLabsId; // default to first freemium
}

/** Freemium voices (selectable by all players) */
export const FREEMIUM_VOICES = VOICES.filter((v) => v.category === "freemium");

/** Premium voices (locked, demo only) */
export const PREMIUM_VOICES = VOICES.filter((v) => v.category === "premium");

/** Legacy voice (Morpheos — auto-triggered) */
export const LEGACY_VOICE = VOICES.find((v) => v.category === "legacy")!;

/** Default voice (Jessica — playful, bright, warm) */
export const DEFAULT_VOICE_ID = "jessica";
