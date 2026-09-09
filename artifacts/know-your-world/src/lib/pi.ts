/**
 * Pi Network integration — payment SDK + verification.
 *
 * Flow:
 *   1. User clicks "Pay with Pi"
 *   2. Frontend calls Pi SDK to create a payment
 *   3. User approves payment in Pi app
 *   4. Frontend sends payment to Worker for verification
 *   5. Worker verifies payment via Pi API
 *   6. On success, Worker updates user's plan/purchase in DB
 */

const PI_API_KEY =
  (import.meta.env.VITE_PI_API_KEY as string | undefined) ??
  "muzufcwftblghva94vckonhnkqkrmvmbbigtacwg1uwgismjcdnhjjg3c0scq3hl";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  "https://know-your-world-api.morphylee22.workers.dev";

// Pi SDK script URL
const PI_SDK_URL = "https://sdk.minepi.com/pi-sdk.js";

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
    sandbox: false, // Set to true for testing
  });
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
    };
  }
}
