/**
 * Poke Agent integration — tutor endpoint + MCP server.
 *
 * Two paths:
 *   1. POST /api/ask-poke  — player misses a question, Worker sends prompt to Poke
 *   2. POST /mcp           — JSON-RPC 2.0 MCP server, Poke queries player data
 */

interface Env {
  DB: D1Database;
  POKE_API_KEY: string;
}

const POKE_ENDPOINT = "https://view-link.cx/niD7mgibuI1";

// ============================================================================
// POST /api/ask-poke — sends a tutor prompt to Poke when player misses
// ============================================================================

export async function handleAskPoke(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json()) as {
    question?: string;
    selectedAnswer?: string;
    correctAnswer?: string;
    category?: string;
    continent?: string;
  };

  const { question, selectedAnswer, correctAnswer, category, continent } = body;

  // M4 FIX: Input length validation
  const MAX_FIELD_LEN = 500;
  if (!question || question.length > MAX_FIELD_LEN) {
    return Response.json(
      { error: "question is required and must be 500 chars or less" },
      { status: 400 },
    );
  }
  if (correctAnswer && correctAnswer.length > MAX_FIELD_LEN) {
    return Response.json(
      { error: "correctAnswer must be 500 chars or less" },
      { status: 400 },
    );
  }
  if (selectedAnswer && selectedAnswer.length > MAX_FIELD_LEN) {
    return Response.json(
      { error: "selectedAnswer must be 500 chars or less" },
      { status: 400 },
    );
  }

  // Record the mistake in D1
  try {
    await env.DB.prepare(
      `INSERT INTO mistakes (name, continent, category, level, question, selected_answer, correct_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        body.selectedAnswer ? "anonymous" : "anonymous",
        continent ?? "unknown",
        category ?? "unknown",
        "1",
        question,
        selectedAnswer ?? "",
        correctAnswer,
      )
      .run();
  } catch {
    // Non-fatal — we still try to reach Poke
  }

  const prompt = `Know Your World tutor check: Category: ${category} (${continent}) Question: ${question} Selected: ${selectedAnswer} Correct: ${correctAnswer} Give a 2-sentence memory trick or mnemonic to never forget this, then ask one quick follow-up question.`;

  try {
    const res = await fetch(POKE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.POKE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: prompt }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    return Response.json({ ok: res.ok, data });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Poke unreachable",
      },
      { status: 502 },
    );
  }
}
