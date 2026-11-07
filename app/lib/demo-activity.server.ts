import type { PaymentMethod, Snapshot } from "./mock-checkout-domain.server";

type Submission = {
  snapshot: Snapshot;
  reference: string;
  method: PaymentMethod;
  createdAt: Date;
  retry: boolean;
};

const singleLine = (value: string) => value.replace(/\s+/g, " ").trim();

export function logDemoSubmission(submission: Submission): void {
  try {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(submission.createdAt);
    const items = submission.snapshot.items.map(item => `${singleLine(item.title)} × ${item.quantity}`).join("; ");
    const total = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(submission.snapshot.amount));
    const action = submission.retry ? "Payment retry submitted" : "Checkout submitted";
    const method = submission.method === "mmqr" ? "MMQR" : "KBZPay PWA";
    console.info(`[COCO DEMO] ${action} | ${time} UTC+07:00 | ${items} | ${total} ${singleLine(submission.snapshot.currency)} | ${method} | ${singleLine(submission.reference)}`);
  } catch { /* Runtime logging is best effort and must not interrupt checkout. */ }
}
