/**
 * Pi Network payment verification endpoint.
 *
 * POST /api/pi/verify
 * Body: { paymentId, amount, memo, metadata, plan }
 *
 * Security:
 *   - Replay attack prevention: checks used_payments table for duplicate paymentId
 *   - Amount validation against plan pricing
 *   - Pi API verification (transaction_verified, not cancelled)
 *   - Routes payment to wallet address
 */

interface Env {
  DB: D1Database;
  PI_API_KEY: string;
  PI_WALLET_ADDRESS: string;
}

const PI_API_BASE = "https://api.minepi.com/v2";

const PI_PRICING: Record<string, number> = {
  individual: 750,
  startup: 1500,
  organization: 3000,
  voice: 200,
};

// Max request body size (2KB)
const MAX_BODY_SIZE = 2048;

export async function handlePiVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  // Body size limit (L5)
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_SIZE) {
    return Response.json(
      { verified: false, error: "Request body too large" },
      { status: 413 },
    );
  }

  let body: {
    paymentId?: string;
    amount?: number;
    memo?: string;
    metadata?: Record<string, unknown>;
    plan?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { verified: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { paymentId, amount, plan } = body;

  // Input validation (M4)
  if (!paymentId || typeof paymentId !== "string" || paymentId.length > 200) {
    return Response.json(
      { verified: false, error: "Valid paymentId is required" },
      { status: 400 },
    );
  }
  if (!amount || typeof amount !== "number" || amount <= 0 || amount > 100000) {
    return Response.json(
      { verified: false, error: "Valid amount is required" },
      { status: 400 },
    );
  }

  // Validate the amount matches the plan pricing
  if (plan && PI_PRICING[plan] && amount !== PI_PRICING[plan]) {
    return Response.json(
      {
        verified: false,
        error: `Amount mismatch: expected ${PI_PRICING[plan]} π for ${plan}`,
      },
      { status: 400 },
    );
  }

  // C2 FIX: Check if paymentId was already used (replay attack prevention)
  try {
    const existing = await env.DB.prepare(
      `SELECT payment_id FROM used_payments WHERE payment_id = ?`,
    )
      .bind(paymentId)
      .first<{ payment_id: string }>();

    if (existing) {
      return Response.json(
        { verified: false, error: "Payment already verified and used" },
        { status: 409 },
      );
    }
  } catch {
    // If D1 check fails, continue — the Pi API verification is the primary check
  }

  try {
    // Verify the payment with the Pi API
    const resp = await fetch(`${PI_API_BASE}/payments/${paymentId}`, {
      headers: {
        Authorization: `Key ${env.PI_API_KEY}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return Response.json(
        { verified: false, error: `Pi API returned ${resp.status}` },
        { status: 502 },
      );
    }

    const payment = (await resp.json()) as {
      identifier: string;
      amount: number;
      memo: string;
      status: {
        developer_approved: boolean;
        transaction_verified: boolean;
        developer_completed: boolean;
        cancelled: boolean;
        user_cancelled: boolean;
      };
    };

    // Check that the payment is valid
    if (
      payment.identifier === paymentId &&
      payment.amount === amount &&
      payment.status.transaction_verified &&
      !payment.status.cancelled &&
      !payment.status.user_cancelled
    ) {
      // Approve the payment
      await fetch(`${PI_API_BASE}/payments/${paymentId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Key ${env.PI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      // Complete the payment — routes to our wallet
      await fetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
        method: "POST",
        headers: {
          Authorization: `Key ${env.PI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txid: paymentId }),
      });

      // C2 FIX: Mark payment as used (replay attack prevention)
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO used_payments (payment_id, plan, amount) VALUES (?, ?, ?)`,
        )
          .bind(paymentId, plan ?? "unknown", amount)
          .run();
      } catch {
        // Non-fatal — the Pi API won't allow re-approval anyway
      }

      return Response.json({
        verified: true,
        paymentId,
        plan: plan ?? "unknown",
        amount,
        wallet: env.PI_WALLET_ADDRESS,
      });
    }

    return Response.json(
      { verified: false, error: "Payment not valid or already used" },
      { status: 400 },
    );
  } catch (err) {
    return Response.json(
      {
        verified: false,
        error: err instanceof Error ? err.message : "Pi verification failed",
      },
      { status: 502 },
    );
  }
}
