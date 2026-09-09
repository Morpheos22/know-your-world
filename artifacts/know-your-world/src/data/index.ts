import type { Question, Continent, Category } from "./types";
import { africaCountries, africaFlags, africaCurrencies } from "./africa";
import { asiaCountries, asiaFlags, asiaCurrencies } from "./asia";
import { europeCountries, europeFlags, europeCurrencies } from "./europe";
import {
  americasCountries,
  americasFlags,
  americasCurrencies,
} from "./americas";
import { aiGenerative, aiCopilots, aiAgents, AI_FACTS } from "./aiworld";
// Presidents/leaders data is auto-generated from Wikidata at build time.
import {
  africaPresidents,
  asiaPresidents,
  europePresidents,
  americasPresidents,
} from "./leaders-generated";

const DB: Record<Continent, Record<Category, Question[]>> = {
  Africa: {
    Countries: africaCountries,
    Presidents: africaPresidents,
    Flags: africaFlags,
    Currencies: africaCurrencies,
    "Generative AI": [],
    Copilots: [],
    "Software Agents": [],
  },
  Asia: {
    Countries: asiaCountries,
    Presidents: asiaPresidents,
    Flags: asiaFlags,
    Currencies: asiaCurrencies,
    "Generative AI": [],
    Copilots: [],
    "Software Agents": [],
  },
  Europe: {
    Countries: europeCountries,
    Presidents: europePresidents,
    Flags: europeFlags,
    Currencies: europeCurrencies,
    "Generative AI": [],
    Copilots: [],
    "Software Agents": [],
  },
  Americas: {
    Countries: americasCountries,
    Presidents: americasPresidents,
    Flags: americasFlags,
    Currencies: americasCurrencies,
    "Generative AI": [],
    Copilots: [],
    "Software Agents": [],
  },
  "AI World": {
    Countries: [],
    Presidents: [],
    Flags: [],
    Currencies: [],
    "Generative AI": aiGenerative,
    Copilots: aiCopilots,
    "Software Agents": aiAgents,
  },
};

export function getQuestionsForLevel(
  continent: Continent,
  category: Category,
  level: number,
): Question[] {
  const items = DB[continent][category].filter((i) => i.lvl === level);
  return items.slice(0, 8);
}

export function getFactsForContinent(continent: Continent): string[] {
  if (continent === "AI World") return AI_FACTS;
  // Fall back to existing continent facts
  return [];
}

// Re-export AI facts for use in App.tsx
export { AI_FACTS };

export { DB };
export type { Question, Continent, Category };
