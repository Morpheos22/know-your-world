export interface Question {
  q: string;
  a: string;
  opts: string[];
  lvl: number;
  flag?: string;
}

export interface QueueItem {
  type: "question" | "fact";
  data?: Question;
  text?: string;
}

export type Continent = "Africa" | "Asia" | "Europe" | "Americas";
export type Category = "Countries" | "Presidents" | "Flags" | "Currencies";

export interface GameState {
  continent: Continent | null;
  category: Category | null;
  level: number;
  queue: QueueItem[];
  qIndex: number;
  score: number;
}

export type Screen = "home" | "continents" | "categories" | "game";
