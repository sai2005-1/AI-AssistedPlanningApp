import { describe, expect, it } from "vitest"

import { isDeadlineWithinReviewFreeze } from "./team-deliverable-rules"

const finalDeadline = "2026-12-10T17:00:00.000Z"

const freeze = "2026-12-07T17:00:00.000Z"

describe("isDeadlineWithinReviewFreeze", () => {
  it("accepts a milestone exactly at the 72-hour freeze boundary", () => {
    expect(isDeadlineWithinReviewFreeze(freeze, finalDeadline)).toBe(true)
  })

  it("rejects milestones after the freeze boundary", () => {
    expect(
      isDeadlineWithinReviewFreeze("2026-12-07T17:00:00.001Z", finalDeadline),
    ).toBe(false)
  })

  it("rejects invalid date inputs", () => {
    expect(isDeadlineWithinReviewFreeze("not-a-date", finalDeadline)).toBe(
      false,
    )

    expect(isDeadlineWithinReviewFreeze(freeze, "not-a-date")).toBe(false)
  })
})
