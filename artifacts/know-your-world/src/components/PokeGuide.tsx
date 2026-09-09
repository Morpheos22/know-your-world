/**
 * PokeGuide — "Amir" AI assistant widget.
 *
 * Features:
 *   - Floating chat bubble (bottom-right of every screen)
 *   - Chat panel with conversation history
 *   - 4 suggestion chips: "How do I play?", "What are pro features?",
 *     "Tell me about AI World", "How do voices work?"
 *   - Voice toggle (🔊/🔇) — off by default, opt-in
 *   - Per-message speak button (👂) to hear a specific response
 *   - Voice state persists in localStorage
 *
 * AMIR FINE-TUNE:
 *   - Sends conversation history (last 6 messages) so Amir can have
 *     multi-turn conversations.
 *   - The Worker extracts the user's identity from the JWT and includes
 *     the user's name in the prompt so Amir greets them personally.
 *   - Suggestion chips tailored to KYW's features.
 */
import { useState, useRef, useEffect } from "react";
import { useTts } from "../hooks/useTts";
import { authedFetch, authErrorMessage } from "../lib/auth";
import { useAuth } from "../hooks/useAuth";

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

// AMIR ENHANCEMENT: send conversation history so Amir can have multi-turn
// conversations and reference earlier questions.
function buildConversationContext(
  messages: Message[],
  currentQuestion: string,
): string {
  const recent = messages.slice(-6);
  if (recent.length === 0) {
    return currentQuestion;
  }
  const history = recent
    .map((m) => (m.role === "user" ? `Player: ${m.text}` : `Amir: ${m.text}`))
    .join("\n");
  return `Conversation so far:
${history}

Player's new question: ${currentQuestion}`;
}

export function PokeGuide() {
  const [open, setOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const { user, isSignedIn } = useAuth();
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
      // AMIR ENHANCEMENT: send conversation context + use authedFetch.
      const contextualQuestion = buildConversationContext(messages, text);
      const resp = await authedFetch(`${API_BASE}/api/ask-poke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: contextualQuestion,
          selectedAnswer: "",
          correctAnswer: "",
          category: "guide",
          continent: "general",
        }),
      });

      if (resp.status === 401 || resp.status === 403) {
        const authErr = authErrorMessage(resp.status);
        const assistantMessage: Message = {
          role: "assistant",
          text: authErr ?? "Please sign in to chat with Amir.",
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setLoading(false);
        return;
      }

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
        const newIdx = messages.length + 1;
        setSpeakingIdx(newIdx);
        await tts.speak(responseText, "amir");
        setSpeakingIdx(null);
      }
    } catch (err) {
      const errorMessage: Message = {
        role: "assistant",
        text: "I couldn't reach my brain right now. Please try again in a moment!",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      void sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating chat bubble */}
      <button
        className="poke-guide-bubble"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close Amir guide" : "Open Amir guide"}
      >
        {open ? "✕" : "🌟"}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="poke-guide-panel">
          <div className="poke-guide-header">
            <div className="poke-guide-title">
              <span className="poke-guide-avatar">🌟</span>
              <div>
                <div className="poke-guide-name">Amir</div>
                <div className="poke-guide-status">
                  {isSignedIn
                    ? `Hi ${user?.user_metadata?.full_name ?? user?.email ?? "explorer"}!`
                    : "Your KYW guide"}
                </div>
              </div>
            </div>
            <button
              className={`poke-guide-voice-toggle${voiceEnabled ? " active" : ""}`}
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              aria-label={voiceEnabled ? "Mute Amir voice" : "Enable Amir voice"}
              title={voiceEnabled ? "Voice on — click to mute" : "Voice off — click to enable"}
            >
              {voiceEnabled ? "🔊" : "🔇"}
            </button>
          </div>

          <div className="poke-guide-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`poke-guide-message poke-guide-message-${msg.role}`}
              >
                <div className="poke-guide-message-text">{msg.text}</div>
                {msg.role === "assistant" && (
                  <button
                    className={`poke-guide-speak-btn${speakingIdx === i ? " speaking" : ""}`}
                    onClick={() => speakMessage(msg.text, i)}
                    aria-label="Speak this message"
                    title="Listen"
                  >
                    {speakingIdx === i ? "⏹" : "👂"}
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div className="poke-guide-message poke-guide-message-assistant">
                <div className="poke-guide-typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
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
                  onClick={() => void sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form className="poke-guide-input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              className="poke-guide-input"
              placeholder="Ask Amir anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="poke-guide-send"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
