export const REVIEW_FREEZE_HOURS = 72

export function isDeadlineWithinReviewFreeze(dueAt: string, finalDeadline: string) {
  const dueAtMs = Date.parse(dueAt)

  const finalDeadlineMs = Date.parse(finalDeadline)

  return (
    Number.isFinite(dueAtMs) &&
    Number.isFinite(finalDeadlineMs) &&
    dueAtMs <= finalDeadlineMs - REVIEW_FREEZE_HOURS * 60 * 60 * 1000
  )
}
