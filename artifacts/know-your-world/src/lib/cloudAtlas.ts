/**
 * Cloud Atlas Sextet ambient music — synthesized via Web Audio API.
 *
 * Inspired by the Cloud Atlas sextet: slow, flowing chord progressions
 * with warm strings, ethereal pads, and gentle piano-like tones.
 * Designed as a seamless loop for background ambiance.
 *
 * Architecture:
 *   - 6-voice chord progression (sextet = 6 instruments)
 *   - Each voice: sine/triangle oscillator with slow attack/release
 *   - Chord changes every 8 seconds, cycling through 4 progressions
 *   - Subtle reverb-like delay on the master output
 *   - Very low gain (0.02) — background only
 */

const SAMPLE_RATE = 44100;

// Chord progression inspired by Cloud Atlas (D minor key, modal)
// Each chord = 6 notes (sextet), spread across octaves
const CHORDS: number[][] = [
  // Dm9: D3, F3, A3, C4, E4, G4
  [146.83, 174.61, 220.0, 261.63, 329.63, 392.0],
  // Bb maj7: Bb2, D3, F3, A3, C4, E4
  [116.54, 146.83, 174.61, 220.0, 261.63, 329.63],
  // F maj7: F2, A2, C3, E3, G3, B3
  [87.31, 110.0, 130.81, 164.81, 196.0, 246.94],
  // Gm9: G2, Bb2, D3, F3, A3, C4
  [98.0, 116.54, 146.83, 174.61, 220.0, 261.63],
];

const CHORD_DURATION = 8.0; // seconds per chord
const TOTAL_LOOP = CHORDS.length * CHORD_DURATION; // 32 seconds

/**
 * Generate the ambient track as a WAV audio buffer.
 * Returns a Blob ready for use as an <audio> source.
 */
export function generateCloudAtlasSextet(): Blob {
  const numSamples = Math.floor(SAMPLE_RATE * TOTAL_LOOP);
  const buffer = new Float32Array(numSamples * 2); // stereo

  // Generate each chord
  for (let chordIdx = 0; chordIdx < CHORDS.length; chordIdx++) {
    const chordStart = chordIdx * CHORD_DURATION;
    const chord = CHORDS[chordIdx];

    for (let voiceIdx = 0; voiceIdx < chord.length; voiceIdx++) {
      const freq = chord[voiceIdx];
      // Each voice has a slightly different timbre
      const voiceGain = 0.15 / chord.length; // normalize across voices
      const detune = 1 + (voiceIdx - 3) * 0.003; // subtle detune for warmth

      for (let i = 0; i < SAMPLE_RATE * CHORD_DURATION; i++) {
        const t = i / SAMPLE_RATE;
        const globalTime = chordStart + t;

        // Envelope: slow attack (2s), sustain, slow release (2s)
        let env = 1.0;
        if (t < 2.0) {
          env = t / 2.0; // attack
        } else if (t > CHORD_DURATION - 2.0) {
          env = (CHORD_DURATION - t) / 2.0; // release
        }
        env = Math.max(0, env);

        // Add subtle vibrato for warmth
        const vibrato = 1 + Math.sin(t * 2.5) * 0.002;

        // Combine sine + triangle for warm string-like tone
        const sineWave = Math.sin(2 * Math.PI * freq * detune * vibrato * t);
        const triWave =
          2 *
            Math.abs(
              2 *
                (freq * detune * vibrato * t -
                  Math.floor(freq * detune * vibrato * t + 0.5)),
            ) -
          1;
        const wave = sineWave * 0.7 + triWave * 0.3;

        // Add subtle shimmer (high harmonic)
        const shimmer = Math.sin(2 * Math.PI * freq * 2 * t) * 0.05;

        const sample = (wave + shimmer) * voiceGain * env;

        // Write to stereo buffer
        const sampleIdx = Math.floor(globalTime * SAMPLE_RATE);
        if (sampleIdx < numSamples) {
          // Left channel
          buffer[sampleIdx * 2] += sample * 0.9;
          // Right channel (slightly delayed for stereo width)
          const rightIdx = sampleIdx + 100; // ~2ms delay
          if (rightIdx < numSamples) {
            buffer[rightIdx * 2 + 1] += sample * 0.9;
          }
        }
      }
    }
  }

  // Apply soft limiting and convert to 16-bit PCM WAV
  return encodeWav(buffer, SAMPLE_RATE);
}

/**
 * Encode a Float32Array stereo buffer as a WAV Blob.
 */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 2;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write samples (soft clip at -1..1)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * 3)); // normalize + soft clip
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
