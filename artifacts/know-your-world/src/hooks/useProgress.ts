/**
 * useProgress — tracks best scores per track + unlocked levels in localStorage.
 *
 * A "track" is a (continent, category) pair. Each track has 3 levels.
 * Unlock rules:
 *   - Level 1 (Easy) is always unlocked.
 *   - Level 2 (Medium) unlocks when Level 1 is passed (score >= 5/10).
 *   - Level 3 (Hard) unlocks when Level 2 is passed.
 *
 * Best scores are stored per (continent, category, level) for badge display.
 */
import { useCallback, useEffect, useState } from "react";
import type { Continent, Category } from "../data/types";

const STORAGE_KEY = "kyw_progress";

interface ProgressRecord {
  bestScore: number;
  total: number;
  passed: boolean;
  playedAt: number;
}

interface ProgressData {
  // Key: `${continent}|${category}|${level}`
  tracks: Record<string, ProgressRecord>;
}

function trackKey(
  continent: Continent,
  category: Category,
  level: number,
): string {
  return `${continent}|${category}|${level}`;
}

function readStored(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tracks: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.tracks) {
      return parsed as ProgressData;
    }
    return { tracks: {} };
  } catch {
    return { tracks: {} };
  }
}

function writeStored(data: ProgressData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export interface UseProgressResult {
  /**
   * Returns the best score for a track, or null if never played.
   */
  getBest: (
    continent: Continent,
    category: Category,
    level: number,
  ) => ProgressRecord | null;

  /**
   * Records a score. Only keeps the best (highest score, fastest time tiebreak).
   * Returns true if this was a new best.
   */
  recordScore: (params: {
    continent: Continent;
    category: Category;
    level: number;
    score: number;
    total: number;
    passed: boolean;
  }) => boolean;

  /**
   * Returns true if the given level is unlocked for the given track.
   * Level 1 is always unlocked. Level N (N>1) is unlocked if level N-1 passed.
   */
  isLevelUnlocked: (
    continent: Continent,
    category: Category,
    level: number,
  ) => boolean;

  /**
   * Returns the highest unlocked level for a track (1, 2, or 3).
   */
  highestUnlockedLevel: (continent: Continent, category: Category) => number;

  /**
   * Returns the number of levels passed for a track (0-3).
   */
  levelsPassed: (continent: Continent, category: Category) => number;

  /**
   * Returns the number of tracks (continent x category combinations) that have
   * at least one level passed, out of 16 total (4 continents x 4 categories).
   */
  tracksStarted: () => number;

  /**
   * Returns the number of tracks where all 3 levels are passed.
   */
  tracksCompleted: () => number;
}

export function useProgress(): UseProgressResult {
  const [data, setData] = useState<ProgressData>({ tracks: {} });

  // Hydrate on mount
  useEffect(() => {
    setData(readStored());
  }, []);

  const getBest = useCallback(
    (
      continent: Continent,
      category: Category,
      level: number,
    ): ProgressRecord | null => {
      return data.tracks[trackKey(continent, category, level)] ?? null;
    },
    [data],
  );

  const recordScore = useCallback(
    (params: {
      continent: Continent;
      category: Category;
      level: number;
      score: number;
      total: number;
      passed: boolean;
    }): boolean => {
      const key = trackKey(params.continent, params.category, params.level);
      const existing = data.tracks[key];
      const isNewBest =
        !existing ||
        params.score > existing.bestScore ||
        (params.score === existing.bestScore &&
          params.passed &&
          !existing.passed);

      if (isNewBest) {
        const newRecord: ProgressRecord = {
          bestScore: params.score,
          total: params.total,
          passed: params.passed,
          playedAt: Date.now(),
        };
        const newData: ProgressData = {
          tracks: { ...data.tracks, [key]: newRecord },
        };
        setData(newData);
        writeStored(newData);
      }
      return isNewBest;
    },
    [data],
  );

  const isLevelUnlocked = useCallback(
    (continent: Continent, category: Category, level: number): boolean => {
      if (level <= 1) return true;
      const prev = data.tracks[trackKey(continent, category, level - 1)];
      return Boolean(prev?.passed);
    },
    [data],
  );

  const highestUnlockedLevel = useCallback(
    (continent: Continent, category: Category): number => {
      for (const lvl of [3, 2, 1]) {
        if (lvl === 1) return 1;
        const prev = data.tracks[trackKey(continent, category, lvl - 1)];
        if (prev?.passed) return lvl;
      }
      return 1;
    },
    [data],
  );

  const levelsPassed = useCallback(
    (continent: Continent, category: Category): number => {
      let count = 0;
      for (const lvl of [1, 2, 3]) {
        if (data.tracks[trackKey(continent, category, lvl)]?.passed) count++;
      }
      return count;
    },
    [data],
  );

  const tracksStarted = useCallback((): number => {
    const seen = new Set<string>();
    for (const key of Object.keys(data.tracks)) {
      const parts = key.split("|");
      if (parts.length >= 2) seen.add(`${parts[0]}|${parts[1]}`);
    }
    return seen.size;
  }, [data]);

  const tracksCompleted = useCallback((): number => {
    // 4 continents x 4 categories = 16 tracks total
    let count = 0;
    const continents: Continent[] = ["Africa", "Asia", "Europe", "Americas"];
    const categories: Category[] = [
      "Countries",
      "Presidents",
      "Flags",
      "Currencies",
    ];
    for (const c of continents) {
      for (const cat of categories) {
        if (
          data.tracks[trackKey(c, cat, 1)]?.passed &&
          data.tracks[trackKey(c, cat, 2)]?.passed &&
          data.tracks[trackKey(c, cat, 3)]?.passed
        ) {
          count++;
        }
      }
    }
    return count;
  }, [data]);

  return {
    getBest,
    recordScore,
    isLevelUnlocked,
    highestUnlockedLevel,
    levelsPassed,
    tracksStarted,
    tracksCompleted,
  };
}

export type { ProgressRecord };
