/**
 * Server-side blocklist — D1-backed with hardcoded fallback.
 *
 * Why this exists (C4 fix):
 *   Previously the blocklist lived in the frontend (src/hooks/useAuth.ts) as
 *   a hardcoded array. Anyone could read the bundle, see the blocklist, and
 *   bypass it trivially. The blocklist now lives here, on the server, and
 *   is enforced at every authenticated endpoint.
 *
 * The blocklist is stored in D1 (table: `blocklist`) so it can be updated
 * without redeploying the Worker. The hardcoded FALLBACK_BLOCKLIST below
 * is used to seed a fresh D1 database and as a fallback if D1 is
 * unreachable.
 *
 * Defense in depth:
 *   The frontend still keeps a copy (for UX) but the server is the source
 *   of truth. If the frontend list is tampered with, the server still
 *   rejects the request.
 */

export interface BlockEntry {
  emailContains?: string | null;
  nameContains?: string | null;
  reason: string;
}

export const FALLBACK_BLOCKLIST: readonly BlockEntry[] = [
  {
    emailContains: "faizafadipe1@gmail.com",
    reason: "Prior abuse — denied access per operator decision",
  },
  {
    nameContains: "faiza fadipe",
    reason: "Prior abuse — denied access per operator decision",
  },
  {
    nameContains: "faiza",
    reason: "Prior abuse — denied access per operator decision",
  },
  {
    nameContains: "fadipe",
    reason: "Prior abuse — denied access per operator decision",
  },
];

interface D1BlockRow {
  email_contains: string | null;
  name_contains: string | null;
  reason: string;
}

function rowToEntry(row: D1BlockRow): BlockEntry {
  return {
    emailContains: row.email_contains,
    nameContains: row.name_contains,
    reason: row.reason,
  };
}

function entryMatches(
  entry: BlockEntry,
  email: string,
  fullName: string,
): boolean {
  if (entry.emailContains && email.includes(entry.emailContains.toLowerCase())) {
    return true;
  }
  if (entry.nameContains && fullName.includes(entry.nameContains.toLowerCase())) {
    return true;
  }
  return false;
}

/** Hardcoded-list check. Used as fallback when D1 is unreachable. */
export function findBlock(
  email: string | null | undefined,
  fullName: string | null | undefined,
): BlockEntry | null {
  const e = (email ?? "").toLowerCase();
  const n = (fullName ?? "").toLowerCase();
  for (const entry of FALLBACK_BLOCKLIST) {
    if (entryMatches(entry, e, n)) return entry;
  }
  return null;
}

/** Seed the D1 blocklist table from FALLBACK_BLOCKLIST if empty. Idempotent. */
export async function seedBlocklistIfEmpty(db: D1Database): Promise<void> {
  try {
    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM blocklist`)
      .first<{ count: number }>();
    if ((countResult?.count ?? 0) > 0) return;

    for (const entry of FALLBACK_BLOCKLIST) {
      await db
        .prepare(
          `INSERT INTO blocklist (email_contains, name_contains, reason, created_at)
           VALUES (?, ?, ?, unixepoch())`,
        )
        .bind(entry.emailContains ?? null, entry.nameContains ?? null, entry.reason)
        .run();
    }
  } catch {
    // Non-fatal — findBlockInD1 will fall back to FALLBACK_BLOCKLIST.
  }
}

/**
 * D1-backed blocklist check. Seeds the table on first call, then queries
 * it. If D1 is unreachable, falls back to the hardcoded list.
 *
 * HARDENING: SELECT capped at 1000 rows as a safety net. If the blocklist
 * grows beyond that, switch to a Bloom filter or trie.
 */
export async function findBlockInD1(
  db: D1Database,
  email: string | null | undefined,
  fullName: string | null | undefined,
): Promise<BlockEntry | null> {
  const e = (email ?? "").toLowerCase();
  const n = (fullName ?? "").toLowerCase();
  try {
    await seedBlocklistIfEmpty(db);
    const rows = await db
      .prepare(`SELECT email_contains, name_contains, reason FROM blocklist LIMIT 1000`)
      .all<D1BlockRow>();
    for (const row of rows.results ?? []) {
      const entry = rowToEntry(row);
      if (entryMatches(entry, e, n)) return entry;
    }
    return null;
  } catch {
    return findBlock(email, fullName);
  }
}
