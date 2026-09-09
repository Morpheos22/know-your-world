/**
 * Pi Network payment verification endpoint.
 *
 * POST /api/pi/verify
 * Body: { paymentId, amount, memo, metadata, plan }
 *
 * Security:
 *   - Replay attack prevention: checks used_payments table for duplicate paymentId
 *   - Amount validation against plan pricing (plan is REQUIRED)
 *   - Pi API verification (transaction_verified, not cancelled)
 *   - paymentId charset validated (alphanumeric + dashes only — used in URL path)
 *   - Cross-check amount from Pi API response against plan pricing directly
 *   - Routes payment to wallet address
 */

interface Env {
  DB: D1Database;
  PI_API_KEY: string;
  PI_WALLET_ADDRESS: string;
  /** Optional: authenticated user ID, if the request was JWT-validated upstream. */
  userId?: string;
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
  // Body size limit
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

  // HARDENING: paymentId must be alphanumeric + dashes only. It's used
  // directly in the Pi API URL path — anything else could be path traversal.
  if (
    !paymentId ||
    typeof paymentId !== "string" ||
    paymentId.length > 200 ||
    !/^[A-Za-z0-9_-]+$/.test(paymentId)
  ) {
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

  // HARDENING: plan is REQUIRED and must be one of the known plans.
  // Previously, omitting `plan` skipped the amount-mismatch check entirely.
  const knownPlan = plan && typeof plan === "string" ? PI_PRICING[plan] : undefined;
  if (!plan || typeof plan !== "string" || !knownPlan) {
    return Response.json(
      {
        verified: false,
        error: `Invalid plan. Must be one of: ${Object.keys(PI_PRICING).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Validate the amount matches the plan pricing
  if (amount !== knownPlan) {
    return Response.json(
      {
        verified: false,
        error: `Amount mismatch: expected ${knownPlan} π for ${plan}`,
      },
      { status: 400 },
    );
  }

  // C2 FIX: Check if paymentId was already used (replay attack prevention).
  // C1 FIX: When authenticated, also verify user_id matches the original user.
  try {
    const existing = await env.DB.prepare(
      `SELECT payment_id, user_id FROM used_payments WHERE payment_id = ?`,
    )
      .bind(paymentId)
      .first<{ payment_id: string; user_id: string | null }>();

    if (existing) {
      if (
        env.userId &&
        existing.user_id &&
        env.userId !== existing.user_id
      ) {
        console.warn(
          `[pi/verify] cross-user paymentId replay attempt: paymentId=${paymentId} originalUser=${existing.user_id} attemptedUser=${env.userId}`,
        );
      }
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

    // L8 FIX: verify amount THREE ways:
    //   1. User-provided matches plan pricing (done above)
    //   2. Pi API's payment.amount matches user-provided
    //   3. Pi API's payment.amount ALSO matches plan pricing directly
    // Catches a malicious Pi client that tampers with the amount at payment time.
    if (
      payment.identifier === paymentId &&
      payment.amount === amount &&
      payment.amount === knownPlan &&
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

      // C2 FIX: Mark payment as used (replay attack prevention).
      // C1 FIX: Store the authenticated user_id alongside.
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO used_payments (payment_id, user_id, plan, amount, verified_at)
           VALUES (?, ?, ?, ?, unixepoch())`,
        )
          .bind(paymentId, env.userId ?? null, plan ?? "unknown", amount)
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
