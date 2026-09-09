import type { Question } from "./types";

// ============================================================================
// AI World — Level 1: Generative AI
// 8 questions on OpenAI, ChatGPT, Gemini, Claude, Anthropic, GLM
// ============================================================================

export const aiGenerative: Question[] = [
  {
    q: "Which company created ChatGPT?",
    a: "OpenAI",
    opts: ["Google", "OpenAI", "Anthropic", "Meta"],
    lvl: 1,
  },
  {
    q: "What does GPT stand for in ChatGPT?",
    a: "Generative Pre-trained Transformer",
    opts: [
      "General Purpose Tech",
      "Generative Pre-trained Transformer",
      "Global Processing Tool",
      "Graphical Processing Terminal",
    ],
    lvl: 1,
  },
  {
    q: "Which company developed the Claude AI assistant?",
    a: "Anthropic",
    opts: ["OpenAI", "Google", "Anthropic", "Microsoft"],
    lvl: 1,
  },
  {
    q: "What is Google's generative AI model called?",
    a: "Gemini",
    opts: ["Bard", "Gemini", "PaLM", "LaMDA"],
    lvl: 1,
  },
  {
    q: "Which AI model was trained by Z.ai?",
    a: "GLM",
    opts: ["GPT", "GLM", "BERT", "T5"],
    lvl: 1,
  },
  {
    q: "What year was OpenAI founded?",
    a: "2015",
    opts: ["2012", "2015", "2018", "2020"],
    lvl: 1,
  },
  {
    q: "Which of these is NOT a generative AI model?",
    a: "Excel",
    opts: ["DALL-E", "Midjourney", "Excel", "Stable Diffusion"],
    lvl: 1,
  },
  {
    q: "What does LLM stand for in AI?",
    a: "Large Language Model",
    opts: [
      "Light Logic Machine",
      "Large Language Model",
      "Long Learning Method",
      "Local Logic Module",
    ],
    lvl: 1,
  },
];

// ============================================================================
// AI World — Level 2: Copilots
// 8 questions on GitHub Copilot, Microsoft Copilot, AI coding assistants
// ============================================================================

export const aiCopilots: Question[] = [
  {
    q: "Which company created GitHub Copilot?",
    a: "GitHub (Microsoft)",
    opts: ["Google", "GitHub (Microsoft)", "Anthropic", "Amazon"],
    lvl: 2,
  },
  {
    q: "What AI model powers GitHub Copilot?",
    a: "OpenAI Codex",
    opts: ["Claude", "OpenAI Codex", "Gemini", "GLM"],
    lvl: 2,
  },
  {
    q: "What is Microsoft Copilot?",
    a: "An AI assistant integrated into Microsoft 365",
    opts: [
      "A gaming console",
      "An AI assistant integrated into Microsoft 365",
      "A programming language",
      "A web browser",
    ],
    lvl: 2,
  },
  {
    q: "Which of these is an AI pair programming tool?",
    a: "GitHub Copilot",
    opts: ["Notepad++", "GitHub Copilot", "FileZilla", "GIMP"],
    lvl: 2,
  },
  {
    q: "What does Copilot suggest while you code?",
    a: "Code completions and snippets",
    opts: [
      "Pizza recipes",
      "Code completions and snippets",
      "Stock prices",
      "Weather forecasts",
    ],
    lvl: 2,
  },
  {
    q: "Which IDEs support GitHub Copilot?",
    a: "VS Code, JetBrains, Neovim",
    opts: ["MS Paint", "VS Code, JetBrains, Neovim", "Photoshop", "Excel only"],
    lvl: 2,
  },
  {
    q: "What is Tabnine?",
    a: "An AI code completion tool",
    opts: ["A browser", "An AI code completion tool", "A database", "An OS"],
    lvl: 2,
  },
  {
    q: "Which company makes the Copilot key on keyboards?",
    a: "Microsoft",
    opts: ["Apple", "Microsoft", "Dell", "Logitech"],
    lvl: 2,
  },
];

// ============================================================================
// AI World — Level 3: Software Agents
// 8 questions on AI agents, autonomous systems, agentic workflows
// ============================================================================

export const aiAgents: Question[] = [
  {
    q: "What is an AI agent?",
    a: "An AI system that takes actions to achieve goals",
    opts: [
      "A human worker",
      "An AI system that takes actions to achieve goals",
      "A type of computer virus",
      "A gaming character",
    ],
    lvl: 3,
  },
  {
    q: "Which framework is popular for building AI agents?",
    a: "LangChain",
    opts: ["React", "LangChain", "Bootstrap", "jQuery"],
    lvl: 3,
  },
  {
    q: "What is AutoGPT?",
    a: "An autonomous AI agent that chains GPT calls",
    opts: [
      "A car",
      "An autonomous AI agent that chains GPT calls",
      "A game",
      "A browser extension",
    ],
    lvl: 3,
  },
  {
    q: "What does RAG stand for in AI?",
    a: "Retrieval-Augmented Generation",
    opts: [
      "Rapid Application Graphics",
      "Retrieval-Augmented Generation",
      "Random Access Generator",
      "Recursive Algorithm Graph",
    ],
    lvl: 3,
  },
  {
    q: "What is the key difference between a copilot and an agent?",
    a: "Agents act autonomously, copilots assist",
    opts: [
      "Copilots are faster",
      "Agents act autonomously, copilots assist",
      "Agents are free",
      "Copilots are smarter",
    ],
    lvl: 3,
  },
  {
    q: "Which tool helps agents browse the web?",
    a: "Playwright / Puppeteer",
    opts: ["Paint", "Playwright / Puppeteer", "Calculator", "Notepad"],
    lvl: 3,
  },
  {
    q: "What is MCP (Model Context Protocol)?",
    a: "A protocol for AI models to access external tools",
    opts: [
      "A gaming protocol",
      "A protocol for AI models to access external tools",
      "A network cable",
      "A programming language",
    ],
    lvl: 3,
  },
  {
    q: "What can AI agents do that LLMs alone cannot?",
    a: "Execute actions and use external tools",
    opts: [
      "Generate text faster",
      "Execute actions and use external tools",
      "Train themselves",
      "Run without electricity",
    ],
    lvl: 3,
  },
];

// ============================================================================
// AI World — Fun Facts
// ============================================================================

export const AI_FACTS: string[] = [
  "The term 'Artificial Intelligence' was coined by John McCarthy in 1956.",
  "GPT-4 has over 1 trillion parameters, making it one of the largest AI models ever built.",
  "Claude can read and analyze documents up to 200,000 tokens in a single conversation.",
  "The first chatbot, ELIZA, was created in 1966 at MIT.",
  "Gemini can process text, images, audio, and video simultaneously.",
  "AI agents can now book flights, write code, and manage your calendar.",
  "The GLM model by Z.ai was the first open-source model to rival GPT-4 on benchmarks.",
  "GitHub Copilot has written over 46% of code in some programming languages.",
];
