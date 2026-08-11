/**
 * useSfx — Web Audio API synthesized sound effects for K12 game.
 *
 * Design principles:
 *   - All sounds ≤ 1.5s, no harsh transients, no low frequencies below 200Hz
 *     (cheap speakers / kids' ears).
 *   - Default ON (kids expect sound). Persistent mute toggle in localStorage.
 *   - Single AudioContext, lazily created on first user interaction (browser
 *     autoplay policy compliance).
 *   - All sounds synthesized from oscillators + gain envelopes — zero asset
 *     weight, instant load, easy to tune.
 *
 * Sound catalog:
 *   click         — button press (sine pop, 150ms, mid C)
 *   correct       — correct answer (major arpeggio C-E-G, 200ms, rising)
 *   wrong         — wrong answer (minor third "boing", 300ms, gentle)
 *   fact          — fact card reveal (high shimmer + bell, 400ms, magical)
 *   streak        — streak chime (escalating, +1 semitone per call)
 *   levelPassed   — level complete (triumphant fanfare, 1.2s, 4-note major)
 *   levelFailed   — level failed (encouraging aww + recovery chime, 1.0s)
 *   start         — quiz start whoosh (300ms)
 *   achievement   — achievement unlock (brass stab + sparkle, 600ms)
 */
import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "kyw_muted";

// ---------- AudioContext singleton ----------

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Resume if suspended (autoplay policy)
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

// ---------- Low-level synth helpers ----------

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  startTime?: number;
  gain?: number;
  attack?: number;
  release?: number;
}

function playTone({
  freq,
  duration,
  type = "sine",
  startTime = 0,
  gain = 0.2,
  attack = 0.01,
  release = 0.05,
}: ToneOptions): void {
  const ac = getCtx();
  if (!ac) return;

  const t0 = ac.currentTime + startTime;
  const t1 = t0 + duration;

  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  const gainNode = ac.createGain();
  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(gain, t0 + attack);
  gainNode.gain.setValueAtTime(gain, t1 - release);
  gainNode.gain.linearRampToValueAtTime(0, t1);

  osc.connect(gainNode);
  gainNode.connect(ac.destination);
  osc.start(t0);
  osc.stop(t1 + 0.05);
}

// Note frequencies (Hz) — enough for our catalog
const NOTE = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
  E6: 1318.5,
  G6: 1568.0,
};

// ---------- Sound definitions ----------

type SoundName =
  | "click"
  | "correct"
  | "wrong"
  | "fact"
  | "streak"
  | "levelPassed"
  | "levelFailed"
  | "start"
  | "achievement";

function playClick(): void {
  playTone({ freq: NOTE.C4, duration: 0.12, type: "sine", gain: 0.15 });
}

function playCorrect(): void {
  // Major arpeggio C-E-G, rising, 200ms total
  playTone({
    freq: NOTE.C4,
    duration: 0.1,
    type: "triangle",
    gain: 0.18,
    startTime: 0,
  });
  playTone({
    freq: NOTE.E4,
    duration: 0.1,
    type: "triangle",
    gain: 0.18,
    startTime: 0.07,
  });
  playTone({
    freq: NOTE.G4,
    duration: 0.15,
    type: "triangle",
    gain: 0.2,
    startTime: 0.14,
  });
}

function playWrong(): void {
  // Gentle minor third "boing" — E4 down to C4, 300ms
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = "sine";
  const t0 = ac.currentTime;
  osc.frequency.setValueAtTime(NOTE.E4, t0);
  osc.frequency.exponentialRampToValueAtTime(NOTE.C4, t0 + 0.25);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.35);
}

function playFact(): void {
  // High shimmer + bell, 400ms, magical
  playTone({
    freq: NOTE.C6,
    duration: 0.35,
    type: "sine",
    gain: 0.12,
    attack: 0.05,
    release: 0.2,
  });
  playTone({
    freq: NOTE.E6,
    duration: 0.3,
    type: "sine",
    gain: 0.1,
    startTime: 0.05,
    attack: 0.05,
    release: 0.2,
  });
  playTone({
    freq: NOTE.G6,
    duration: 0.25,
    type: "sine",
    gain: 0.08,
    startTime: 0.1,
    attack: 0.05,
    release: 0.2,
  });
}

function playStreak(level: number): void {
  // Escalating chimes, each step a semitone higher than the last
  // Base note G5, multiplied by 2^(1/12) per streak level
  const baseFreq = NOTE.G5 * Math.pow(2, Math.min(level - 1, 12) / 12);
  playTone({
    freq: baseFreq,
    duration: 0.18,
    type: "triangle",
    gain: 0.16,
    startTime: 0,
  });
  playTone({
    freq: baseFreq * 1.5,
    duration: 0.18,
    type: "triangle",
    gain: 0.12,
    startTime: 0.06,
  });
}

function playLevelPassed(): void {
  // Triumphant 4-note major fanfare, 1.2s
  // C-E-G-C rising, then sustained
  playTone({
    freq: NOTE.C4,
    duration: 0.15,
    type: "triangle",
    gain: 0.18,
    startTime: 0,
  });
  playTone({
    freq: NOTE.E4,
    duration: 0.15,
    type: "triangle",
    gain: 0.18,
    startTime: 0.12,
  });
  playTone({
    freq: NOTE.G4,
    duration: 0.15,
    type: "triangle",
    gain: 0.2,
    startTime: 0.24,
  });
  playTone({
    freq: NOTE.C5,
    duration: 0.6,
    type: "triangle",
    gain: 0.22,
    startTime: 0.36,
    release: 0.3,
  });
}

function playLevelFailed(): void {
  // Encouraging "aww" (descending minor) + recovery chime (rising major third)
  playTone({
    freq: NOTE.E4,
    duration: 0.18,
    type: "sine",
    gain: 0.16,
    startTime: 0,
  });
  playTone({
    freq: NOTE.D4,
    duration: 0.18,
    type: "sine",
    gain: 0.15,
    startTime: 0.15,
  });
  playTone({
    freq: NOTE.C4,
    duration: 0.25,
    type: "sine",
    gain: 0.16,
    startTime: 0.3,
    release: 0.15,
  });
  // Recovery chime — "try again"
  playTone({
    freq: NOTE.G4,
    duration: 0.15,
    type: "triangle",
    gain: 0.14,
    startTime: 0.6,
  });
  playTone({
    freq: NOTE.C5,
    duration: 0.2,
    type: "triangle",
    gain: 0.16,
    startTime: 0.72,
    release: 0.1,
  });
}

function playStart(): void {
  // Whoosh — frequency sweep up, 300ms
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  const t0 = ac.currentTime;
  osc.frequency.setValueAtTime(NOTE.C4, t0);
  osc.frequency.exponentialRampToValueAtTime(NOTE.C6, t0 + 0.28);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.35);
}

function playAchievement(): void {
  // Brass-like stab (sawtooth) + sparkle (high sine)
  playTone({
    freq: NOTE.C4,
    duration: 0.15,
    type: "sawtooth",
    gain: 0.12,
    startTime: 0,
  });
  playTone({
    freq: NOTE.E4,
    duration: 0.15,
    type: "sawtooth",
    gain: 0.12,
    startTime: 0,
  });
  playTone({
    freq: NOTE.G4,
    duration: 0.15,
    type: "sawtooth",
    gain: 0.12,
    startTime: 0,
  });
  playTone({
    freq: NOTE.C6,
    duration: 0.4,
    type: "sine",
    gain: 0.14,
    startTime: 0.15,
    attack: 0.02,
    release: 0.25,
  });
  playTone({
    freq: NOTE.E6,
    duration: 0.35,
    type: "sine",
    gain: 0.1,
    startTime: 0.2,
    attack: 0.02,
    release: 0.2,
  });
}

const SOUND_MAP: Record<SoundName, (arg?: number) => void> = {
  click: playClick,
  correct: playCorrect,
  wrong: playWrong,
  fact: playFact,
  streak: playStreak,
  levelPassed: playLevelPassed,
  levelFailed: playLevelFailed,
  start: playStart,
  achievement: playAchievement,
};

// ---------- Hook ----------

export function useSfx() {
  // Default: NOT muted (kids expect sound)
  const [muted, setMuted] = useState(false);
  const streakRef = useRef(0);

  // Hydrate mute state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MUTE_KEY);
      if (stored === "true") setMuted(true);
    } catch {
      // ignore
    }
  }, []);

  // Persist mute state
  useEffect(() => {
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // ignore
    }
  }, [muted]);

  const play = useCallback(
    (sound: SoundName, arg?: number) => {
      if (muted) return;
      // Streak tracking: reset on non-streak sounds, increment on correct
      if (sound === "correct") {
        streakRef.current += 1;
        // If we hit 3+, play streak chime AFTER the correct sound
        if (streakRef.current >= 3) {
          SOUND_MAP.correct();
          setTimeout(() => {
            if (!muted) playStreak(streakRef.current);
          }, 220);
          return;
        }
      } else if (sound !== "streak") {
        streakRef.current = 0;
      }
      SOUND_MAP[sound](arg);
    },
    [muted],
  );

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const resetStreak = useCallback(() => {
    streakRef.current = 0;
  }, []);

  return { play, muted, toggleMute, resetStreak };
}

export type { SoundName };
