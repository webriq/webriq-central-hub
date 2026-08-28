import Link from "next/link";
import { Chip } from "../../dashboard/_components/dashboard-shared";
import type { ContactListItem, AccountListItem } from "./_contacts-index";

const CONTACT_COLS = "grid-cols-[1.4fr_1.6fr_150px_1fr_1fr]";
const ACCOUNT_COLS = "grid-cols-[1.6fr_1.6fr_1.4fr_140px_110px_1fr]";

function HeadCell({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">{children}</span>
  );
}

export function ContactsTable({ contacts }: { contacts: ContactListItem[] }) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      <div className={`grid ${CONTACT_COLS} items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]`}>
        <HeadCell>Name</HeadCell>
        <HeadCell>Email</HeadCell>
        <HeadCell>Phone</HeadCell>
        <HeadCell>Account</HeadCell>
        <HeadCell>Customer</HeadCell>
      </div>
      {contacts.map((c) => (
        <Link
          key={c.id}
          href={`/desk/contacts/${c.id}`}
          className={`grid ${CONTACT_COLS} items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] transition-colors`}
        >
          <span className="text-[13px] text-[#0B1533] truncate" title={c.name}>{c.name}</span>
          <span className="text-[13px] text-[#3A4565] truncate">{c.email ?? "-"}</span>
          <span className="text-[11px] font-mono text-[#5F6A88] truncate">{c.phone ?? "-"}</span>
          <span className="text-[13px] text-[#3A4565] truncate">{c.accountName ?? "-"}</span>
          <span className="text-[13px] text-[#3A4565] truncate">{c.customerName ?? "-"}</span>
        </Link>
      ))}
    </div>
  );
}

export function AccountsTable({ accounts }: { accounts: AccountListItem[] }) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      <div className={`grid ${ACCOUNT_COLS} items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]`}>
        <HeadCell>Account</HeadCell>
        <HeadCell>Website</HeadCell>
        <HeadCell>Email</HeadCell>
        <HeadCell>Phone</HeadCell>
        <HeadCell>Happiness</HeadCell>
        <HeadCell>Customer</HeadCell>
      </div>
      {accounts.map((a) => (
        <Link
          key={a.id}
          href={`/desk/accounts/${a.id}`}
          className={`grid ${ACCOUNT_COLS} items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] transition-colors`}
        >
          <span className="text-[13px] text-[#0B1533] truncate" title={a.accountName}>{a.accountName}</span>
          <span className="text-[13px] text-[#3A4565] truncate">
            {a.website ? a.website.replace(/^https?:\/\//, "") : "-"}
          </span>
          <span className="text-[13px] text-[#3A4565] truncate">{a.email ?? "-"}</span>
          <span className="text-[11px] font-mono text-[#5F6A88] truncate">{a.phone ?? "-"}</span>
          <span>
            {a.goodPercentage === null ? (
              <span className="text-[13px] text-[#5F6A88]">-</span>
            ) : (
              <Chip tone={a.goodPercentage >= 80 ? "ok" : a.goodPercentage >= 50 ? "warn" : "neutral"}>
                {a.goodPercentage}%
              </Chip>
            )}
          </span>
          <span className="text-[13px] text-[#3A4565] truncate">{a.customerName ?? "-"}</span>
        </Link>
      ))}
    </div>
  );
}
