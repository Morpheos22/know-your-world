/**
 * Pi Network integration — auth, payment SDK + verification.
 *
 * Pi Network color palette:
 *   Primary: #6B2DFF (Pi purple)
 *   Secondary: #FBC423 (Pi gold/yellow)
 */

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

const PI_SDK_URL = "https://sdk.minepi.com/pi-sdk.js";

export const PI_COLORS = {
  primary: "#6B2DFF",
  secondary: "#FBC423",
  dark: "#1A1A2E",
  light: "#F0F0F5",
  white: "#FFFFFF",
  gradient: "linear-gradient(135deg, #6B2DFF 0%, #8B4DFF 100%)",
};

// Track initialization state to prevent double-init
let piInitialized = false;
let piLoading: Promise<void> | null = null;

/** Load the Pi SDK script (idempotent — only loads once) */
function loadPiSdkScript(): Promise<void> {
  if (window.Pi) return Promise.resolve();
  if (piLoading) return piLoading;

  piLoading = new Promise<void>((resolve, reject) => {
    // Check if script already in DOM
    const existing = document.querySelector(`script[src="${PI_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Pi SDK failed to load")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = PI_SDK_URL;
    script.async = true;
    script.onload = () => {
      // Give the SDK a tick to register on window
      setTimeout(() => resolve(), 100);
    };
    script.onerror = () => reject(new Error("Failed to load Pi SDK"));
    document.head.appendChild(script);
  });

  return piLoading;
}

/** Initialize Pi SDK — idempotent, only inits once */
export async function initPiSdk(): Promise<void> {
  if (piInitialized && window.Pi) return;

  await loadPiSdkScript();

  if (!window.Pi) {
    throw new Error(
      "Pi SDK loaded but window.Pi is undefined. You may need to use the Pi Browser.",
    );
  }

  // Only init once
  if (!piInitialized) {
    window.Pi.init({
      version: 2,
      sandbox: false,
    });
    piInitialized = true;
  }
}

/** Authenticate with Pi Network */
export async function authenticateWithPi(): Promise<{
  ok: boolean;
  user?: { uid: string; username: string };
  accessToken?: string;
  error?: string;
}> {
  try {
    await initPiSdk();

    if (!window.Pi) {
      return {
        ok: false,
        error: "Pi SDK not available. Please open this page in the Pi Browser.",
      };
    }

    const authResult = (await window.Pi.authenticate(
      ["username", "payments"],
      (payment: unknown) => {
        console.log("Incomplete payment found:", payment);
      },
    )) as { user?: { uid: string; username: string } };

    const accessToken = window.Pi.getAccessToken?.() ?? null;

    if (authResult?.user) {
      return {
        ok: true,
        user: {
          uid: authResult.user.uid ?? "unknown",
          username: authResult.user.username ?? "pi-user",
        },
        accessToken: accessToken ?? undefined,
      };
    }

    return { ok: false, error: "Pi authentication returned no user data." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg.includes("Pi Browser")
        ? msg
        : "Pi authentication failed. Please ensure you're using the Pi Browser.",
    };
  }
}

/** Create a Pi payment */
export async function createPiPayment(
  amount: number,
  memo: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: boolean; paymentId?: string; error?: string }> {
  try {
    await initPiSdk();

    if (!window.Pi) {
      return { ok: false, error: "Pi SDK not available" };
    }

    const payment = await window.Pi.createPayment({ amount, memo, metadata });

    const resp = await fetch(`${API_BASE}/api/pi/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId: payment.identifier,
        amount,
        memo,
        metadata,
      }),
    });

    const data = await resp.json();
    if (data.verified) {
      return { ok: true, paymentId: payment.identifier };
    }
    return { ok: false, error: data.error ?? "Payment not verified" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Pi payment failed",
    };
  }
}

declare global {
  interface Window {
    Pi?: {
      init: (config: { version: number; sandbox: boolean }) => void;
      createPayment: (data: {
        amount: number;
        memo: string;
        metadata: Record<string, unknown>;
      }) => Promise<{ identifier: string }>;
      authenticate: (
        scopes: string[],
        onIncompletePaymentFound: (payment: unknown) => void,
      ) => Promise<unknown>;
      getAccessToken?: () => string | null;
    };
  }
}
