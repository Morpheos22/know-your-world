/**
 * Pi Network payment verification endpoint.
 *
 * POST /api/pi/verify
 * Body: { paymentId, amount, memo, metadata }
 *
 * Verifies the payment with the Pi API and returns whether it's valid.
 */

interface Env {
  PI_API_KEY: string;
}

const PI_API_BASE = "https://api.minepi.com/v2";

export async function handlePiVerify(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json()) as {
    paymentId?: string;
    amount?: number;
    memo?: string;
    metadata?: Record<string, unknown>;
  };

  const { paymentId, amount } = body;

  if (!paymentId || !amount) {
    return Response.json(
      { verified: false, error: "paymentId and amount are required" },
      { status: 400 },
    );
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

      // Complete the payment
      await fetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
        method: "POST",
        headers: {
          Authorization: `Key ${env.PI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txid: paymentId }),
      });

      return Response.json({ verified: true, paymentId });
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
