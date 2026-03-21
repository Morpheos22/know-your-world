import type { Question, Continent, Category } from "./types";
import { africaCountries, africaPresidents, africaFlags, africaCurrencies } from "./africa";
import { asiaCountries, asiaPresidents, asiaFlags, asiaCurrencies } from "./asia";
import { europeCountries, europePresidents, europeFlags, europeCurrencies } from "./europe";
import { americasCountries, americasPresidents, americasFlags, americasCurrencies } from "./americas";

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
  level: number
): Question[] {
  const items = DB[continent][category].filter((i) => i.lvl === level);
  return items.slice(0, 8);
}

export { DB };
export type { Question, Continent, Category };
