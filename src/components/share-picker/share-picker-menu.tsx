import { Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./share-chips";
import { roleLabelOf } from "./share-picker-logic";
import type { SharePerson, ShareRoleOption, ShareSelection } from "./types";

// Option ids are derived from the listbox id so aria-activedescendant can point at them.
export const optionId = (listboxId: string, kind: "role" | "user", key: string) => `${listboxId}-${kind}-${key}`;

type Props = {
  listboxId: string;
  roles: ShareRoleOption[];
  allRoles: ShareRoleOption[];
  people: SharePerson[];
  selection: ShareSelection;
  query: string;
  activeId: string | null;
  noPeople: boolean;
  everyoneCovered: boolean;
  onToggleRole: (role: string) => void;
  onToggleUser: (userId: string) => void;
  onHover: (id: string) => void;
};

const section = "px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]";

// Task 438 — menu body: role toggle chips on top (navy when selected), people rows beneath. Selected
// people stay listed with a check so they can be toggled off; members of a selected role never appear.
export function SharePickerMenu(p: Props) {
  const hasRoles = p.roles.length > 0;
  const hasPeople = p.people.length > 0;
  const nothing = !hasRoles && !hasPeople;

  let emptyText: string | null = null;
  if (nothing) {
    emptyText = p.query ? `No people match “${p.query}”.` : p.everyoneCovered ? "Everyone in the selected roles is already included." : p.noPeople ? "No one else to share with." : "Nothing left to add.";
  }

  return (
    <div id={p.listboxId} role="listbox" aria-multiselectable="true" aria-label="People and roles" className="overflow-y-auto py-1">
      {hasRoles ? (
        <div role="group" aria-label="Roles">
          <p className={section}>Roles</p>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {p.roles.map((r) => {
              const selected = p.selection.roles.includes(r.value);
              const id = optionId(p.listboxId, "role", r.value);
              return (
                <button
                  key={r.value} id={id} type="button" role="option" aria-selected={selected}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => p.onToggleRole(r.value)} onMouseEnter={() => p.onHover(id)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                    selected ? "border-[#071133] bg-[#071133] text-white" : "border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5]",
                    p.activeId === id && "outline-2 outline-offset-1 outline-[#007BFF]",
                  )}
                >
                  <Users size={11} aria-hidden className={selected ? "text-[#5EB0FF]" : "text-[#5F6A88]"} />
                  {r.label}
                  {selected ? <Check size={11} aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {hasPeople ? (
        <div role="group" aria-label="People">
          <p className={section}>People</p>
          {p.people.map((person) => {
            const selected = p.selection.userIds.includes(person.id);
            const id = optionId(p.listboxId, "user", person.id);
            return (
              <button
                key={person.id} id={id} type="button" role="option" aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()} onClick={() => p.onToggleUser(person.id)} onMouseEnter={() => p.onHover(id)}
                className={cn(
                  "flex min-h-10 w-full cursor-pointer items-center gap-2.5 border-none px-3 py-1.5 text-left transition-colors hover:bg-[#F0F7FF]",
                  selected ? "bg-[#F0F7FF]" : "bg-transparent",
                  p.activeId === id && "bg-[#F0F7FF] outline-2 -outline-offset-2 outline-[#007BFF]",
                )}
              >
                <PersonAvatar id={person.id} name={person.name} size={24} avatarUrl={person.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#0B1533]">{person.name}</span>
                  <span className="block truncate text-[11px] text-[#5F6A88]">{roleLabelOf(person, p.allRoles)}</span>
                </span>
                {selected ? <Check size={14} aria-hidden className="shrink-0 text-[#007BFF]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {emptyText ? <p className="px-3 py-4 text-center text-[12.5px] text-[#5F6A88]">{emptyText}</p> : null}
    </div>
  );
}
