import type { Question, Continent, Category } from "./types";
import { africaCountries, africaFlags, africaCurrencies } from "./africa";
import { asiaCountries, asiaFlags, asiaCurrencies } from "./asia";
import { europeCountries, europeFlags, europeCurrencies } from "./europe";
import {
  americasCountries,
  americasFlags,
  americasCurrencies,
} from "./americas";
// Presidents/leaders data is auto-generated from Wikidata at build time.
// Run `pnpm run generate:leaders` to refresh, or see scripts/wikidata/.
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
  },
  Asia: {
    Countries: asiaCountries,
    Presidents: asiaPresidents,
    Flags: asiaFlags,
    Currencies: asiaCurrencies,
  },
  Europe: {
    Countries: europeCountries,
    Presidents: europePresidents,
    Flags: europeFlags,
    Currencies: europeCurrencies,
  },
  Americas: {
    Countries: americasCountries,
    Presidents: americasPresidents,
    Flags: americasFlags,
    Currencies: americasCurrencies,
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

export { DB };
export type { Question, Continent, Category };
