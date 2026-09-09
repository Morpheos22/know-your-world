/**
 * Poke Agent integration — Amir chatbot endpoint.
 *
 * Two modes:
 *   1. GUIDE mode (category === "guide"): Amir is a conversational guide
 *      on the landing page. He answers questions about how KYW works —
 *      gameplay, continents, voices, plans, leaderboard, AI World, etc.
 *      He's trained on the platform's data and gives rich, helpful answers.
 *
 *   2. TUTOR mode (any other category): triggered when a player misses a
 *      quiz question. Amir gives a 2-3 sentence mnemonic + a follow-up
 *      question to reinforce learning.
 *
 * Personalization (Amir fine-tune):
 *   When the request is JWT-authenticated, the upstream middleware passes
 *   `userId`, `userEmail`, `userFullName` via env. The prompt includes
 *   the user's name so Amir can greet them by name, reference their
 *   previous questions, and feel like a remembered companion rather than
 *   a stateless bot.
 *
 * The frontend also sends conversation history (last 6 messages) in the
 * `question` field, formatted as:
 *   "Conversation so far: ... Player's new question: ..."
 * This lets Amir have multi-turn conversations.
 */

interface Env {
  DB: D1Database;
  POKE_API_KEY: string;
  /** Authenticated user context — set by upstream JWT middleware. */
  userId?: string;
  userEmail?: string;
  userFullName?: string;
}

const POKE_ENDPOINT = "https://view-link.cx/niD7mgibuI1";

const ALLOWED_LEVELS = new Set(["easy", "medium", "hard"]);

// ============================================================================
// PLATFORM KNOWLEDGE BASE — injected into Amir's system prompt.
// ============================================================================

const PLATFORM_KB = `
KNOW YOUR WORLD — platform knowledge base (Amir's reference)

WHAT IS KYW:
A geography + AI knowledge quiz game. Players choose a continent, pick a
category, and answer 8 questions (with 2 fun facts interspersed). Score
4+ to pass and unlock the next difficulty. Built for K-12 students.

CONTINENTS (5):
- Africa — 4 categories, 3 levels each
- Asia — 4 categories, 3 levels each
- Europe — 4 categories, 3 levels each
- Americas — 4 categories, 3 levels each
- AI World — 3 AI-focused categories (Generative AI, Copilots, Software Agents)

CATEGORIES:
- Countries & Capitals — match countries to their capital cities
- Presidents / Leaders — current heads of state (auto-refreshed from Wikidata)
- Flags — identify the country from its flag emoji
- Currencies — match countries to their currency
- Generative AI — how LLMs, image gen, and audio gen work
- Copilots — AI assistants in IDEs, browsers, and apps
- Software Agents — autonomous AI agents that take actions

LEVELS:
- Easy (Level 1) — always unlocked
- Medium (Level 2) — unlocked by passing Easy
- Hard (Level 3) — unlocked by passing Medium
- Pass threshold: 4/8 correct

VOICES (3 freemium + 10 premium + 2 legacy):
- Freemium: Jessica, Laura, Charlie — free for everyone
- Premium (require Individual plan or higher): Jazzy, Beth, Sally, Alisha,
  Natasha, Aleja, Jeremy, Zain, Rupert, David
- Legacy: Morpheos (founder's voice)
- Guide: Amir (that's me!)
- Voices use ElevenLabs for primary TTS, Cloudflare Workers AI as fallback

PLANS (one-time fee, cancel anytime):
- Individual (₦5,000 / 750 π): pro voices (30%), global leaderboard, ambient
  music, additional voices at ₦500 / 200 π each
- Startup (₦12,000 / 1,500 π): everything in Individual + Marketplace
  workspace, showcase AI products, bio + links section, additional products
  at ₦1,000 each
- Organization (₦17,000 / 3,000 π): all pro voices, workspace + classroom,
  tutor dashboard, bulk student onboarding, priority support
- Payment methods: Stripe (card) or Pi Network (cryptocurrency)
- GitHub Student Pack users get 10% off

LEADERBOARD:
- Global leaderboard per (continent, category, level) track
- Top 3 get 🥇🥈🥉 badges; HONOUR badge for notable performances
- Includes AI World scores
- Best score per user per track (dedupe by user_id, not display name)

AUTH:
- Sign up with Google, GitHub, Pi Network, or email
- Email verification required for email signups
- Cloudflare Turnstile captcha on all auth flows
- Pro feature — onboarding + payment required after signup

AI WORLD:
- Special continent focused on AI literacy
- 3 categories: Generative AI, Copilots, Software Agents
- 24 questions + 8 fun facts
- Designed to teach K-12 students how AI works

ONBOARDING FLOW:
1. Sign up / sign in
2. Choose plan (Individual / Startup / Organization)
3. Choose payment method (Stripe / Pi)
4. Fill plan-specific details (Startup: name, website, MVP1, MVP2, bio)
5. Success screen

POKE GUIDE (that's me — Amir):
- Floating chat bubble bottom-right of every screen
- Click to open chat panel
- 4 suggestion chips: "How do I play?", "What are pro features?", "Tell me
  about AI World", "How do voices work?"
- Voice toggle (🔊/🔇) — off by default, opt-in
- Per-message speak button (👂) to hear a specific response
- Voice state persists in localStorage

TONE:
- Warm, playful, encouraging — K-12 friendly
- Use emojis sparingly (1-2 per response, not every sentence)
- Be specific — reference actual continents, categories, plans by name
- If the user asks something not in this KB, admit it and suggest they
  explore the game to find out
- PERSONALITY: I'm Amir — curious, encouraging, a bit nerdy about geography
  and AI. I love helping explorers discover new things. I remember our
  previous conversations and reference them naturally.
`.trim();

// ============================================================================
// GUIDE MODE PROMPT — for general chat with Amir (personalized)
// ============================================================================

function buildGuidePrompt(
  userQuestion: string,
  userContext: { fullName: string | null; email: string | null; isAnonymous: boolean },
): string {
  const greeting = userContext.isAnonymous
    ? "The player is currently anonymous (not signed in). Be welcoming and gently encourage them to sign up to unlock pro features — but don't be pushy. Address them as 'explorer' or 'friend'."
    : `The player is signed in as ${userContext.fullName ?? userContext.email ?? "a registered explorer"}. Address them by name when natural (not every sentence). Make them feel remembered and valued.`;

  return `You are Amir, the friendly AI guide for Know Your World (KYW), a geography + AI knowledge quiz game. You're chatting with a player on the landing page.

${greeting}

${PLATFORM_KB}

The player just asked (this may include conversation history for context):
"${userQuestion}"

Respond with a helpful, friendly answer (3-5 sentences). Be specific — reference actual features, continents, categories, plans, or voices by name. Use 1-2 emojis max. If the question is about something not in your knowledge base, admit it and suggest they explore the game to find out. Don't make up features that don't exist. If the player mentioned something earlier in the conversation, reference it naturally to show you remember.`;
}

// ============================================================================
// TUTOR MODE PROMPT — for when a player misses a quiz question
// ============================================================================

function buildTutorPrompt(
  params: {
    question: string;
    selectedAnswer?: string;
    correctAnswer?: string;
    category?: string;
    continent?: string;
  },
  userContext: { fullName: string | null; isAnonymous: boolean },
): string {
  const { question, selectedAnswer, correctAnswer, category, continent } = params;
  const namePart = userContext.isAnonymous
    ? "The player is anonymous."
    : `The player is ${userContext.fullName ?? "a registered explorer"}.`;
  return `You are Amir, the tutor for Know Your World (KYW). A player just missed a quiz question.

${namePart}

${PLATFORM_KB}

The question they missed:
- Category: ${category ?? "unknown"} (${continent ?? "unknown"})
- Question: ${question}
- Their answer: ${selectedAnswer || "(no answer)"}
- Correct answer: ${correctAnswer || "(not provided)"}

Give a 2-3 sentence memory trick or mnemonic to help them remember the correct answer, then ask one quick follow-up question to reinforce the learning. Be warm and encouraging — mistakes are part of learning. Use 1 emoji max.`;
}

// ============================================================================
// POST /api/ask-poke — main entry point
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
    level?: string;
  };

  const {
    question,
    selectedAnswer,
    correctAnswer,
    category,
    continent,
    level,
  } = body;

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

  // Downstream fix: validate level against schema CHECK constraint.
  const safeLevel =
    typeof level === "string" && ALLOWED_LEVELS.has(level.toLowerCase())
      ? level.toLowerCase()
      : "easy";

  const playerName = env.userId ?? "anonymous";

  // Record the mistake in D1 (only in tutor mode — guide mode isn't a mistake)
  if (category !== "guide") {
    try {
      await env.DB.prepare(
        `INSERT INTO mistakes (user_id, name, continent, category, level, question, selected_answer, correct_answer)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          env.userId ?? null,
          playerName,
          (continent ?? "unknown").slice(0, 50),
          (category ?? "unknown").slice(0, 50),
          safeLevel,
          question,
          selectedAnswer ?? "",
          correctAnswer ?? "",
        )
        .run();
    } catch {
      // Non-fatal — we still try to reach Poke
    }
  }

  // Build the user context for personalization
  const userContext = {
    fullName: env.userFullName ?? null,
    email: env.userEmail ?? null,
    isAnonymous: !env.userId,
  };

  // BUILD THE PROMPT — guide mode vs tutor mode
  const isGuideMode = category === "guide";
  const prompt = isGuideMode
    ? buildGuidePrompt(question, userContext)
    : buildTutorPrompt({ question, selectedAnswer, correctAnswer, category, continent }, userContext);

  // HARDENING: cap the prompt length.
  const cappedPrompt = prompt.slice(0, 8000);

  try {
    const res = await fetch(POKE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.POKE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: cappedPrompt }),
      signal: AbortSignal.timeout(15000),
    });

    // HARDENING: cap the response size at 32KB.
    const text = await res.text();
    const cappedText = text.slice(0, 32768);
    let data: unknown;
    try {
      data = JSON.parse(cappedText);
    } catch {
      data = { message: cappedText };
    }
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
