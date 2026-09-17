// Task 347 — every StackShift order submission notifies a fixed list (Philippe, Danielle,
// Dannea, Alex, Bert — addresses live in STACKSHIFT_ORDER_NOTIFY_EMAILS).
// Task 374 — dropped the auto-included PM recipients (every `profiles.role = 'pm'` user);
// only the fixed list receives this email now.
export async function getOrderNotificationRecipients(): Promise<string[]> {
  const out = new Set<string>();

  for (const raw of (process.env.STACKSHIFT_ORDER_NOTIFY_EMAILS ?? "").split(",")) {
    const email = raw.trim().toLowerCase();
    if (email.includes("@")) out.add(email);
  }

  return [...out];
}
