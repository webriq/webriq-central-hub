// Task 468 — "closest project name first" ranking (pure). Token Jaccard + trigram Dice, same-customer boost.
import { norm } from "./keys";
import type { CandidateProject } from "./types";

const trigrams = (s: string) => {
  const p = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
  return set;
};

function overlap(a: Set<string>, b: Set<string>, dice: boolean) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return dice ? (2 * n) / (a.size + b.size) : n / (a.size + b.size - n);
}

export function nameSimilarity(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return 0.5 * overlap(new Set(na.split(" ")), new Set(nb.split(" ")), false) + 0.5 * overlap(trigrams(na), trigrams(nb), true);
}

export const SAME_CUSTOMER_BOOST = 0.15;

type Src = { name: string; customer_id: string };
type Cand = Omit<CandidateProject, "score">;

export function rankSimilarProjects(source: Src, candidates: Cand[]): CandidateProject[] {
  return candidates
    .map((c) => ({
      ...c,
      score: Math.min(1, nameSimilarity(source.name, c.name) + (c.customer_id === source.customer_id ? SAME_CUSTOMER_BOOST : 0)),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Score at/above which a candidate is shown under "Suggested". */
export const SUGGEST_THRESHOLD = 0.3;
