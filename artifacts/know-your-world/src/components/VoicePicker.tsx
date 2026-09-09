/**
 * VoicePicker — modal for selecting TTS voice.
 *
 * Shows freemium voices (selectable) and premium voices (locked, 4-second
 * demo only). Selected voice is persisted via useVoice hook.
 */
import { useState } from "react";
import { FREEMIUM_VOICES, PREMIUM_VOICES, type Voice } from "../data/voices";
import { useTts } from "../hooks/useTts";

interface VoicePickerProps {
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  onClose: () => void;
  play: (s: "click") => void;
}

export function VoicePicker({
  selectedVoiceId,
  onSelect,
  onClose,
  play,
}: VoicePickerProps) {
  const [demoVoiceId, setDemoVoiceId] = useState<string | null>(null);
  const tts = useTts(selectedVoiceId);

  const handleSelect = (voice: Voice) => {
    if (voice.category === "freemium") {
      play("click");
      onSelect(voice.id);
    }
  };

  const handleDemo = async (voice: Voice) => {
    play("click");
    setDemoVoiceId(voice.id);
    // Speak a short demo phrase with this voice
    await tts.speak(
      `Hi! I'm ${voice.name}. I'll read your questions and answers!`,
      voice.id,
    );
    setDemoVoiceId(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content voice-picker-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{"\uD83C\uDFA4"} Choose Your Voice</h2>

        {/* Freemium section */}
        <div className="voice-section">
          <div className="voice-section-title">Free Voices</div>
          <div className="voice-grid">
            {FREEMIUM_VOICES.map((voice) => (
              <button
                key={voice.id}
                className={`voice-card${
                  selectedVoiceId === voice.id ? " voice-selected" : ""
                }`}
                onClick={() => handleSelect(voice)}
              >
                <div className="voice-card-header">
                  <span className="voice-gender-icon">
                    {voice.gender === "female"
                      ? "\uD83D\uDC69"
                      : "\uD83D\uDC68"}
                  </span>
                  <span className="voice-name">{voice.name}</span>
                  {selectedVoiceId === voice.id && (
                    <span className="voice-check">{"\u2713"}</span>
                  )}
                </div>
                <div className="voice-desc">{voice.description}</div>
                <div className="voice-accent">{voice.accent}</div>
                <button
                  className="voice-demo-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDemo(voice);
                  }}
                  disabled={demoVoiceId === voice.id}
                >
                  {demoVoiceId === voice.id
                    ? "\u23F3 Playing..."
                    : "\uD83D\uDC42 Preview"}
                </button>
              </button>
            ))}
          </div>
        </div>

        {/* Premium section */}
        <div className="voice-section">
          <div className="voice-section-title">
            {"\u2728"} Premium Voices
            <span className="voice-premium-badge">PRO</span>
          </div>
          <p className="voice-premium-note">
            Locked — 4-second preview. Unlock each voice for {"\u20A6"}500
            (Phase 4).
          </p>
          <div className="voice-grid">
            {PREMIUM_VOICES.map((voice) => (
              <div key={voice.id} className="voice-card voice-locked">
                <div className="voice-card-header">
                  <span className="voice-gender-icon">
                    {voice.gender === "female"
                      ? "\uD83D\uDC69"
                      : "\uD83D\uDC68"}
                  </span>
                  <span className="voice-name">{voice.name}</span>
                  <span className="voice-lock">{"\uD83D\uDD12"}</span>
                </div>
                <div className="voice-desc">{voice.description}</div>
                <div className="voice-accent">{voice.accent}</div>
                <button
                  className="voice-demo-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDemo(voice);
                  }}
                  disabled={demoVoiceId === voice.id}
                >
                  {demoVoiceId === voice.id
                    ? "\u23F3 Playing..."
                    : "\uD83D\uDC42 Preview (4s)"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          className="menu-btn"
          style={{ width: "100%", marginTop: 16 }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}
