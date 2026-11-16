import { describe, expect, it } from 'vitest'

import { isDeadlineWithinReviewFreeze } from './team-deliverable-rules'

const finalDeadline = '2026-12-10T17:00:00.000Z'

const freeze = '2026-12-07T17:00:00.000Z'

describe('isDeadlineWithinReviewFreeze', () => {
  it('accepts a milestone exactly at the 72-hour freeze boundary', () => {
    expect(isDeadlineWithinReviewFreeze(freeze, finalDeadline)).toBe(true)
  })

  it('rejects milestones after the freeze boundary', () => {
    expect(isDeadlineWithinReviewFreeze('2026-12-07T17:00:00.001Z', finalDeadline)).toBe(
      false,
    )
  })

  it('rejects invalid date inputs', () => {
    expect(isDeadlineWithinReviewFreeze('not-a-date', finalDeadline)).toBe(false)

    expect(isDeadlineWithinReviewFreeze(freeze, 'not-a-date')).toBe(false)
  })

  it('accepts a milestone one millisecond before the freeze', () => {
    expect(isDeadlineWithinReviewFreeze('2026-12-07T16:59:59.999Z', finalDeadline)).toBe(
      true,
    )
  })

  it.each([finalDeadline, '2026-12-11T17:00:00.000Z'])(
    'rejects a milestone at or after final submission: %s',
    (dueAt) => {
      expect(isDeadlineWithinReviewFreeze(dueAt, finalDeadline)).toBe(false)
    },
  )

  it.each([
    ['', finalDeadline],
    [freeze, ''],
    [' ', finalDeadline],
    [freeze, ' '],
    ['not-a-date', 'not-a-date'],
  ])('rejects unreadable inputs (%j, %j)', (dueAt, finalAt) => {
    expect(isDeadlineWithinReviewFreeze(dueAt, finalAt)).toBe(false)
  })

  it('compares instants across different timezone offsets', () => {
    expect(
      isDeadlineWithinReviewFreeze(
        '2026-12-07T12:00:00.000-05:00',
        '2026-12-11T02:00:00.000+09:00',
      ),
    ).toBe(true)
    expect(
      isDeadlineWithinReviewFreeze(
        '2026-12-07T12:00:00.001-05:00',
        '2026-12-11T02:00:00.000+09:00',
      ),
    ).toBe(false)
  })

  it('measures 72 elapsed hours across spring daylight saving time', () => {
    // New York advances from UTC-5 to UTC-4 on March 8, 2026.
    const finalAt = '2026-03-10T12:00:00-04:00'
    expect(isDeadlineWithinReviewFreeze('2026-03-07T11:00:00-05:00', finalAt)).toBe(true)
    expect(isDeadlineWithinReviewFreeze('2026-03-07T12:00:00-05:00', finalAt)).toBe(false)
  })

  it('measures 72 elapsed hours across fall daylight saving time', () => {
    // New York returns from UTC-4 to UTC-5 on November 1, 2026.
    const finalAt = '2026-11-03T12:00:00-05:00'
    expect(isDeadlineWithinReviewFreeze('2026-10-31T13:00:00-04:00', finalAt)).toBe(true)
    expect(isDeadlineWithinReviewFreeze('2026-10-31T13:00:00.001-04:00', finalAt)).toBe(
      false,
    )
  })

  it('accepts the exact freeze across a year boundary', () => {
    expect(
      isDeadlineWithinReviewFreeze('2026-12-30T17:00:00Z', '2027-01-02T17:00:00Z'),
    ).toBe(true)
  })
})
