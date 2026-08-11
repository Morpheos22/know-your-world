/**
 * usePlayer — localStorage-backed player name persistence.
 *
 * Behavior:
 *   - On first load, name is null (player must enter it).
 *   - On setName, validates (trim, max 20 chars) and persists to localStorage.
 *   - On clear, removes the name from localStorage.
 *   - "Not [Name]? Click here" pattern: clearing re-shows the name entry screen.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "kyw_player_name";
const MAX_NAME_LENGTH = 20;

function readStoredName(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    // Defensive: cap length on read in case storage was tampered with
    return v.length > MAX_NAME_LENGTH ? v.slice(0, MAX_NAME_LENGTH) : v;
  } catch {
    // localStorage may be unavailable (private mode, sandboxed iframe)
    return null;
  }
}

function writeStoredName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Silently ignore — name persists for the session only
  }
}

function clearStoredName(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function usePlayer() {
  const [name, setNameState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR mismatch, though we're CSR-only)
  useEffect(() => {
    setNameState(readStoredName());
    setHydrated(true);
  }, []);

  const setName = useCallback(
    (raw: string): { ok: true } | { ok: false; error: string } => {
      const trimmed = raw.trim().replace(/\s+/g, " ");
      if (trimmed.length === 0) {
        return { ok: false, error: "Please enter your name, explorer!" };
      }
      if (trimmed.length > MAX_NAME_LENGTH) {
        return { ok: false, error: "Names must be 20 characters or less." };
      }
      writeStoredName(trimmed);
      setNameState(trimmed);
      return { ok: true };
    },
    [],
  );

  const clearName = useCallback(() => {
    clearStoredName();
    setNameState(null);
  }, []);

  return { name, hydrated, setName, clearName, maxNameLength: MAX_NAME_LENGTH };
}
