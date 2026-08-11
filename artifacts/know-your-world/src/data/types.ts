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
  /** Total questions answered correctly (excludes fact cards). */
  score: number;
  /** Total questions answered (correct or wrong; excludes fact cards). */
  questionsAnswered: number;
  /** Total number of question items in the queue (excludes fact cards). */
  totalQuestions: number;
  /** Wall-clock ms when the quiz started, for time tracking. */
  startedAt: number;
  /** Wall-clock ms when the quiz ended, for submission. */
  endedAt: number | null;
}

export type Screen =
  "home" | "continents" | "categories" | "levels" | "game" | "leaderboard";
