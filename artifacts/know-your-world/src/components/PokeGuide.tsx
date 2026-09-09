/**
 * PokeGuide — "Amir" AI assistant widget on the landing page.
 *
 * Uses the Poke API (via Worker /api/ask-poke) to answer questions
 * and guide users through the platform. Responses are read aloud
 * using the TTS voice system with Amir's voice (Alisha — energetic Gen Z).
 */
import { useState, useRef, useEffect } from "react";
import { useTts } from "../hooks/useTts";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "How do I play?",
  "What are pro features?",
  "Tell me about AI World",
  "How do voices work?",
];

export function PokeGuide() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hey there! I'm Amir, your Know Your World guide! Ask me anything about the game — I'm here to help you explore!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const tts = useTts("amir");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

      // Read the response aloud using Amir's voice
      void tts.speak(responseText, "amir");
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
            <button
              className="poke-guide-close"
              onClick={() => setOpen(false)}
              aria-label="Close guide"
            >
              {"\u2193"}
            </button>
          </div>

          <div className="poke-guide-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`poke-guide-message poke-guide-message-${msg.role}`}
              >
                {msg.text}
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
