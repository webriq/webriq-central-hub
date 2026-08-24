import type { Metadata } from "next";
import NewCustomerContent from "./_content";

export const metadata: Metadata = { title: "New Customer" };

export default function OnboardCustomerPage() {
  return <NewCustomerContent />;
}
