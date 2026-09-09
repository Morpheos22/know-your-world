/**
 * PokeGuide — "Amir" AI assistant widget on the landing page.
 *
 * Voice behavior:
 *   - Amir does NOT auto-speak after every response
 *   - A voice toggle (🔊/🔇) in the header controls whether Amir speaks
 *   - Default: voice OFF (user must opt in)
 *   - When voice is ON: each assistant message gets a 🔊 button next to it
 *   - User clicks the 🔊 button to hear that specific message
 *   - Voice toggle state persists in localStorage
 */
import { useState, useRef, useEffect } from "react";
import { useTts } from "../hooks/useTts";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

const VOICE_KEY = "kyw_amir_voice";

interface Message {
  role: "user" | "assistant";
  text: string;
  spoken?: boolean;
}

const SUGGESTIONS = [
  "How do I play?",
  "What are pro features?",
  "Tell me about AI World",
  "How do voices work?",
];

export function PokeGuide() {
  const [open, setOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hey there! I'm Amir, your Know Your World guide! Ask me anything about the game — I'm here to help you explore!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const tts = useTts("amir");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hydrate voice toggle from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VOICE_KEY);
      if (stored === "true") setVoiceEnabled(true);
    } catch {
      // ignore
    }
  }, []);

  // Persist voice toggle
  useEffect(() => {
    try {
      localStorage.setItem(VOICE_KEY, String(voiceEnabled));
    } catch {
      // ignore
    }
  }, [voiceEnabled]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const speakMessage = async (text: string, index: number) => {
    // Toggle: if this message is currently playing, stop it
    if (speakingIdx === index) {
      tts.stop();
      setSpeakingIdx(null);
      return;
    }
    setSpeakingIdx(index);
    await tts.speak(text, "amir");
    setSpeakingIdx(null);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/api/ask-poke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          selectedAnswer: "",
          correctAnswer: "",
          category: "guide",
          continent: "general",
        }),
      });

      const data = await resp.json();
      const responseText =
        data?.data?.message ??
        data?.data?.response ??
        (typeof data?.data === "string"
          ? data.data
          : "Great question! Explore the game to find out — it's packed with fun facts about our world and AI!");

      const assistantMessage: Message = {
        role: "assistant",
        text: responseText,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Only auto-speak if voice is explicitly enabled
      if (voiceEnabled) {
        const newIdx = messages.length + 1; // +1 for user message + new assistant
        setSpeakingIdx(newIdx);
        await tts.speak(responseText, "amir");
        setSpeakingIdx(null);
      }
    } catch {
      const fallback: Message = {
        role: "assistant",
        text: "Oops! I couldn't reach my brain right now. Try exploring the game — it's super fun!",
      };
      setMessages((prev) => [...prev, fallback]);
    }

    setLoading(false);
  };

  return (
    <>
      {/* Floating bubble button */}
      <button
        className="poke-guide-bubble"
        onClick={() => {
          setOpen(!open);
        }}
        aria-label="Open Amir guide"
      >
        {open ? "\u2715" : "\uD83C\uDF1F"}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="poke-guide-panel">
          <div className="poke-guide-header">
            <span className="poke-guide-title">
              {"\uD83C\uDF1F"} Amir · KYW Guide
            </span>
            <div className="poke-guide-header-actions">
              {/* Voice toggle indicator */}
              <button
                className={`poke-guide-voice-toggle${voiceEnabled ? " active" : ""}`}
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                aria-label={
                  voiceEnabled ? "Disable Amir voice" : "Enable Amir voice"
                }
                title={
                  voiceEnabled
                    ? "Amir voice ON — click to mute"
                    : "Amir voice OFF — click to enable"
                }
              >
                {voiceEnabled ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
              </button>
              <button
                className="poke-guide-close"
                onClick={() => setOpen(false)}
                aria-label="Close guide"
              >
                {"\u2193"}
              </button>
            </div>
          </div>

          <div className="poke-guide-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`poke-guide-message poke-guide-message-${msg.role}`}
              >
                <div className="poke-guide-message-text">{msg.text}</div>
                {/* Voice indicator on each assistant message */}
                {msg.role === "assistant" && (
                  <button
                    className={`poke-guide-speak-btn${speakingIdx === i ? " speaking" : ""}`}
                    onClick={() => void speakMessage(msg.text, i)}
                    aria-label={
                      speakingIdx === i ? "Stop speaking" : "Play this message"
                    }
                    title={speakingIdx === i ? "Stop" : "Listen"}
                  >
                    {speakingIdx === i ? "\u23F9" : "\uD83D\uDC42"}
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div className="poke-guide-message poke-guide-message-assistant">
                {"\uD83D\uDCAC"} Amir is thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion chips */}
          {messages.length <= 1 && (
            <div className="poke-guide-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="poke-guide-suggestion"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="poke-guide-input-row">
            <input
              type="text"
              className="poke-guide-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder="Ask Amir anything..."
              disabled={loading}
            />
            <button
              className="poke-guide-send"
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
            >
              {"\u27A4"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
