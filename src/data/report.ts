/** Why someone reports a bean; the same list as `private.reports.reason`. */
export const REPORT_REASONS = ["scam", "impersonation", "spam", "inappropriate", "other"] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_LABELS: Readonly<Record<ReportReason, string>> = {
  scam: "Scam or asking for money",
  impersonation: "Pretending to be someone else",
  spam: "Spam or ads",
  inappropriate: "Offensive or inappropriate",
  other: "Something else",
};
