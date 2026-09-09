/**
 * AuthModal — sign in / sign up modal with Google, GitHub, and Email.
 *
 * Includes Cloudflare Turnstile for bot protection.
 * The Turnstile token is captured via a callback and passed to all
 * Supabase auth calls.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth, setTurnstileToken } from "../hooks/useAuth";
import { TURNSTILE_SITEKEY } from "../lib/supabase";
import { initPiSdk, createPiPayment } from "../lib/pi";

interface AuthModalProps {
  onClose: () => void;
  play: (s: "click") => void;
}

// Global callback name for Turnstile (loaded via script tag)
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

export function AuthModal({ onClose, play }: AuthModalProps) {
  const {
    signInWithGoogle,
    signInWithGitHub,
    signUpWithEmail,
    signInWithEmail,
    error: authError,
  } = useAuth();
  const [mode, setMode] = useState<"choose" | "email-signup" | "email-signin">(
    "choose",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationMessage, setVerificationMessage] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  // Render Turnstile widget when the modal opens
  useEffect(() => {
    const renderTurnstile = (): void => {
      if (window.turnstile && turnstileContainerRef.current) {
        turnstileContainerRef.current.innerHTML = "";
        window.turnstile.render(turnstileContainerRef.current, {
          sitekey: TURNSTILE_SITEKEY,
          theme: "light",
          callback: (token: string) => {
            setTurnstileToken(token);
            setTurnstileReady(true);
          },
          "expired-callback": () => {
            setTurnstileToken(null);
            setTurnstileReady(false);
          },
          "error-callback": () => {
            setTurnstileToken(null);
            setTurnstileReady(false);
          },
        });
      }
    };

    // Wait for Turnstile script to load
    if (window.turnstile) {
      renderTurnstile();
      return;
    }
    const interval = setInterval(() => {
      if (window.turnstile) {
        clearInterval(interval);
        renderTurnstile();
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleGoogle = async (): Promise<void> => {
    play("click");
    setLoading(true);
    await signInWithGoogle();
  };

  const handleGitHub = async (): Promise<void> => {
    play("click");
    setLoading(true);
    await signInWithGitHub();
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    play("click");
    setLoading(true);
    const result = await signUpWithEmail(email, password);
    setLoading(false);
    if (
      result.ok &&
      "needsVerification" in result &&
      result.needsVerification
    ) {
      setVerificationMessage(result.message ?? "Check your email!");
    }
  };

  const handleEmailSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    play("click");
    setLoading(true);
    const result = await signInWithEmail(email, password);
    setLoading(false);
    if (result.ok) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content auth-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="auth-close-btn" onClick={onClose} aria-label="Close">
          {"\u2715"}
        </button>

        {mode === "choose" && (
          <>
            <div className="auth-header">
              <h2>{"\u2728"} Join Know Your World</h2>
              <p className="auth-subtitle">
                Unlock pro voices, leaderboards, and more.
              </p>
            </div>

            <div className="auth-providers">
              <button
                className="auth-provider-btn auth-google"
                onClick={handleGoogle}
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>

              <button
                className="auth-provider-btn auth-github"
                onClick={handleGitHub}
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Continue with GitHub
              </button>

              <button
                className="auth-provider-btn auth-pi"
                onClick={async () => {
                  play("click");
                  setLoading(true);
                  try {
                    await initPiSdk();
                    // Pi authenticate
                    if (window.Pi) {
                      await window.Pi.authenticate(
                        ["username", "payments"],
                        () => {},
                      );
                    }
                  } catch {
                    // Pi SDK might not be available in all environments
                  }
                  setLoading(false);
                }}
                disabled={loading}
              >
                {"\uD83D\uDFE1"} Continue with Pi
              </button>
            </div>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button
              className="auth-provider-btn auth-email"
              onClick={() => {
                play("click");
                setMode("email-signup");
              }}
            >
              {"\uD83D\uDCE7"} Sign up with Email
            </button>

            <p className="auth-signin-link">
              Already have an account?{" "}
              <button
                className="auth-link-btn"
                onClick={() => {
                  play("click");
                  setMode("email-signin");
                }}
              >
                Sign in
              </button>
            </p>

            {/* Turnstile widget */}
            <div
              ref={turnstileContainerRef}
              className="auth-turnstile-container"
            />
            {!turnstileReady && (
              <p className="auth-captcha-waiting">
                {"\uD83D\uDD12"} Verifying you're human...
              </p>
            )}

            <p className="auth-disclaimer">
              PRO feature — one-time fee applies after signup. GitHub Student
              Pack users get 10% off.
            </p>
          </>
        )}

        {mode === "email-signup" && (
          <form className="auth-form" onSubmit={handleEmailSignup}>
            <h2>Create Account</h2>

            {verificationMessage ? (
              <div className="auth-verification">
                <div className="auth-verification-icon">{"\uD83D\uDCE7"}</div>
                <p>{verificationMessage}</p>
                <button
                  className="menu-btn"
                  onClick={() => {
                    play("click");
                    setMode("email-signin");
                    setVerificationMessage(null);
                  }}
                >
                  Sign in now
                </button>
              </div>
            ) : (
              <>
                <input
                  type="email"
                  placeholder="Email address"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <input
                  type="password"
                  placeholder="Password (min 8 characters)"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="submit"
                  className="menu-btn auth-submit-btn"
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create Account"}
                </button>
              </>
            )}

            <button
              type="button"
              className="auth-back-btn"
              onClick={() => {
                play("click");
                setMode("choose");
                setVerificationMessage(null);
              }}
            >
              {"\u2190"} Back
            </button>
          </form>
        )}

        {mode === "email-signin" && (
          <form className="auth-form" onSubmit={handleEmailSignin}>
            <h2>Welcome Back</h2>
            <input
              type="email"
              placeholder="Email address"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="submit"
              className="menu-btn auth-submit-btn"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <button
              type="button"
              className="auth-back-btn"
              onClick={() => {
                play("click");
                setMode("choose");
              }}
            >
              {"\u2190"} Back
            </button>
          </form>
        )}

        {authError && <div className="auth-error">{authError}</div>}
      </div>
    </div>
  );
}
