/**
 * Pi Network integration — auth, payment SDK + verification.
 *
 * Pi Network color palette:
 *   Primary: #6B2DFF (Pi purple)
 *   Secondary: #FBC423 (Pi gold/yellow)
 *   Dark: #1A1A2E
 *   Light: #F0F0F5
 *
 * Auth flow:
 *   1. User clicks "Continue with Pi"
 *   2. Frontend loads Pi SDK from sdk.minepi.com
 *   3. Calls Pi.authenticate() with scopes [username, payments]
 *   4. Pi SDK opens Pi Browser auth flow
 *   5. On success, user is authenticated with Pi username
 *   6. Frontend sends Pi auth token to Worker for verification
 *   7. Worker creates/updates user record
 *
 * Payment flow:
 *   1. User selects plan + clicks "Pay with Pi"
 *   2. Frontend calls Pi.createPayment() with amount in Pi
 *   3. User approves payment in Pi app
 *   4. Frontend sends payment to Worker for verification
 *   5. Worker verifies via Pi API (api.minepi.com/v2)
 *   6. Payment routed to wallet: GABT7EMPGNCQSZM22DIYC4FNKHUVJTXITUF6Y5HNIWPU4GA7BHT4GC5G
 */

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

// Pi SDK script URL
const PI_SDK_URL = "https://sdk.minepi.com/pi-sdk.js";

// Pi Network color palette
export const PI_COLORS = {
  primary: "#6B2DFF",
  secondary: "#FBC423",
  dark: "#1A1A2E",
  light: "#F0F0F5",
  white: "#FFFFFF",
  gradient: "linear-gradient(135deg, #6B2DFF 0%, #8B4DFF 100%)",
};

/** Load the Pi SDK script */
export function loadPiSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Pi) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = PI_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pi SDK"));
    document.head.appendChild(script);
  });
}

/** Initialize Pi SDK with the app */
export async function initPiSdk(): Promise<void> {
  await loadPiSdk();
  if (!window.Pi) {
    throw new Error("Pi SDK not available");
  }
  window.Pi.init({
    version: 2,
    sandbox: false,
  });
}

/** Authenticate with Pi Network — returns Pi user info */
export async function authenticateWithPi(): Promise<{
  ok: boolean;
  user?: { uid: string; username: string };
  accessToken?: string;
  error?: string;
}> {
  try {
    await initPiSdk();
    if (!window.Pi) {
      return { ok: false, error: "Pi SDK failed to load" };
    }

    // Authenticate with Pi — this opens the Pi Browser auth flow
    const authResult = await window.Pi.authenticate(
      ["username", "payments"],
      (payment: unknown) => {
        // Handle incomplete payment if found
        console.log("Incomplete payment found:", payment);
      },
    );

    // Get the access token
    const accessToken = window.Pi.getAccessToken?.() ?? null;

    if (authResult) {
      const user = authResult as { user?: { uid: string; username: string } };
      return {
        ok: true,
        user: {
          uid: user.user?.uid ?? "unknown",
          username: user.user?.username ?? "pi-user",
        },
        accessToken: accessToken ?? undefined,
      };
    }

    return { ok: false, error: "Pi authentication failed" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Pi auth failed",
    };
  }
}

/** Create a Pi payment for pro access */
export async function createPiPayment(
  amount: number,
  memo: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: boolean; paymentId?: string; error?: string }> {
  try {
    if (!window.Pi) {
      await initPiSdk();
    }

    if (!window.Pi) {
      return { ok: false, error: "Pi SDK failed to load" };
    }

    const payment = await window.Pi.createPayment({
      amount,
      memo,
      metadata,
    });

    // Send payment to Worker for verification
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

// Type declaration for the Pi SDK
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
