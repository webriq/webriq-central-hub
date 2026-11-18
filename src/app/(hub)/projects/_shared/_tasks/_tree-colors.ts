// Task 487 D1/D5 — Figma-style stripes (approved guide exception, phase/group headers of the Tasks listing only).
// Phase color = phase state; a programme-phase name keeps its fixed hue (DESIGN.md §2). Group color = rotation.
// Static class strings only (CLAUDE.md: no runtime-built class names).

export type PhaseTone = { stripe: string; tile: string };

const PROGRAMME: Record<string, PhaseTone> = {
  "onboard": { stripe: "bg-[#E2762F]", tile: "bg-[#FFEFE3] text-[#B85512]" },
  "migrate & rebrand": { stripe: "bg-[#0063D6]", tile: "bg-[#E5F1FF] text-[#0063D6]" },
  "publish": { stripe: "bg-[#6A48E0]", tile: "bg-[#EFEAFD] text-[#6A48E0]" },
  "ai visibility": { stripe: "bg-[#0B8A93]", tile: "bg-[#E2F6F7] text-[#0B8A93]" },
  "optimize": { stripe: "bg-[#177E48]", tile: "bg-[#E3F5EA] text-[#177E48]" },
};

const STATE: Record<string, PhaseTone> = {
  active: { stripe: "bg-[#007BFF]", tile: "bg-[#E5F1FF] text-[#0063D6]" },
  completed: { stripe: "bg-[#177E48]", tile: "bg-[#E3F5EA] text-[#177E48]" },
  planned: { stripe: "bg-[#8792B0]", tile: "bg-[#EDF0F7] text-[#5F6A88]" },
};

// Programme phases keep their programme number (the `milestones` view hides programme Phase 1, so order-based
// numbering would call "Migrate & Rebrand" Phase 1).
const PROGRAMME_NUMBER: Record<string, number> = { "onboard": 1, "migrate & rebrand": 2, "publish": 3, "ai visibility": 4, "optimize": 5 };

const programmeNo = (name: string) => PROGRAMME_NUMBER[name.trim().toLowerCase()];

/** `orderNumber` is 1-based among visible milestones; when programme Phase 1 is hidden, later custom phases shift by one. */
export function phaseNumber(m: { name: string }, orderNumber: number, all: { name: string }[]): number {
  const hiddenOnboard = all.some((x) => programmeNo(x.name)) && !all.some((x) => programmeNo(x.name) === 1) ? 1 : 0;
  return programmeNo(m.name) ?? orderNumber + hiddenOnboard;
}

export function phaseTone(m: { name: string; status: string } | null): PhaseTone {
  if (!m) return STATE.planned;
  return PROGRAMME[m.name.trim().toLowerCase()] ?? STATE[m.status] ?? STATE.planned;
}

const GROUP_STRIPES = ["bg-[#0063D6]", "bg-[#B85512]", "bg-[#0B8A93]", "bg-[#44508A]", "bg-[#177E48]", "bg-[#C0392B]"] as const;

export function groupStripe(index: number): string {
  return GROUP_STRIPES[index % GROUP_STRIPES.length];
}
