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
  MCP_SHARED_SECRET: string;
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

  if (!question || !correctAnswer) {
    return Response.json(
      { error: "question and correctAnswer are required" },
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

// ============================================================================
// POST /mcp — JSON-RPC 2.0 MCP server for Poke
// ============================================================================

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  // GET requests are handled by the Hono route handler (returns endpoint info)
  // Only process POST requests as JSON-RPC
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Validate shared secret
  const authHeader = request.headers.get("x-poke-auth");
  if (authHeader !== env.MCP_SHARED_SECRET) {
    return jsonRpcError(null, -32001, "Unauthorized: invalid shared secret");
  }

  const pokeUserId = request.headers.get("x-poke-user-id") ?? "anonymous";
  const body = (await request.json()) as {
    id?: string | number | null;
    method?: string;
    params?: any;
  };
  const { id, method, params } = body;

  if (method === "initialize") {
    return jsonRpcResponse(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "know-your-world-mcp", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return jsonRpcResponse(id, {
      tools: [
        {
          name: "get_player_progress",
          description:
            "Get quiz accuracy, current streaks, and completed tracks for the user",
          inputSchema: {
            type: "object",
            properties: {
              continent: {
                type: "string",
                description: "Filter by continent (e.g. Africa, Europe)",
              },
            },
          },
        },
        {
          name: "get_missed_questions",
          description: "Fetch recent incorrect questions to analyze weak spots",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Max number of mistakes to return (default 5)",
              },
            },
          },
        },
        {
          name: "generate_practice_set",
          description: "Generate targeted practice questions based on category",
          inputSchema: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: ["capitals", "flags", "currencies", "facts"],
              },
              count: { type: "number", description: "Number of questions" },
            },
            required: ["category"],
          },
        },
      ],
    });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;

    if (name === "get_player_progress") {
      const stats = await env.DB.prepare(
        "SELECT continent, category, score, total FROM scores WHERE name_key = ? ORDER BY created_at DESC LIMIT 20",
      )
        .bind(pokeUserId.toLowerCase())
        .all();
      return jsonRpcResponse(id, {
        content: [{ type: "text", text: JSON.stringify(stats.results) }],
      });
    }

    if (name === "get_missed_questions") {
      const limit = args?.limit || 5;
      const mistakes = await env.DB.prepare(
        "SELECT question, selected_answer, correct_answer, category, continent, created_at FROM mistakes WHERE name = ? ORDER BY created_at DESC LIMIT ?",
      )
        .bind(pokeUserId, limit)
        .all();
      return jsonRpcResponse(id, {
        content: [{ type: "text", text: JSON.stringify(mistakes.results) }],
      });
    }

    if (name === "generate_practice_set") {
      // For now, return a placeholder — Phase 5 will add question bank to D1
      return jsonRpcResponse(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: "Practice set generation coming in Phase 5",
              category: args?.category,
              count: args?.count || 5,
            }),
          },
        ],
      });
    }

    return jsonRpcError(id, -32601, "Tool not found");
  }

  return jsonRpcError(id, -32600, "Invalid Request");
}

function jsonRpcResponse(
  id: string | number | null | undefined,
  result: any,
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    {
      headers: { "Content-Type": "application/json" },
      status: code === -32001 ? 401 : 400,
    },
  );
}
