import { describe, expect, it } from "vitest"

import { calculateScore, type ScoreInput } from "./scoring"

const now = new Date("2026-12-01T12:00:00.000Z")
const hour = 3_600_000

describe("calculateScore deterministic fixtures", () => {
  it("returns the current default breakdown for missing or null optional values", () => {
    const expected = {
      academicValue: 42,
      careerValue: 35,
      consequence: 55,
      goalAlignment: 50,
      neglectFactor: 98,
      score: 43,
      urgency: 24,
      workload: 25,
    }
    expect(calculateScore({}, now)).toEqual(expected)
    expect(
      calculateScore(
        {
          assignmentType: null,
          careerAlignment: null,
          classLevel: null,
          consequence: null,
          dueDate: null,
          estimatedMinutes: null,
          goalAlignment: null,
          lastWorkedAt: null,
        },
        now,
      ),
    ).toEqual(expected)
  })

  it("matches an independently calculated exam score", () => {
    const input: ScoreInput = {
      assignmentType: "exam",
      classLevel: "3000",
      careerAlignment: 70,
      consequence: 90,
      dueDate: "2026-12-03T12:00:00.000Z",
      estimatedMinutes: 120,
      goalAlignment: 80,
      lastWorkedAt: "2026-11-25T12:00:00.000Z",
    }
    // Components contribute 22.68 + 15.48 + 11.2 + 11.2 + 12.6 + 7.04 + 1.5
    // = 81.7, which rounds to 82. Expected values are not derived by calling
    // production helpers or duplicating the scoring algorithm in this test.
    expect(calculateScore(input, now)).toEqual({
      academicValue: 86,
      careerValue: 70,
      consequence: 90,
      goalAlignment: 80,
      neglectFactor: 88,
      score: 82,
      urgency: 84,
      workload: 50,
    })
  })

  it("uses assignment-specific defaults and honors explicit zero values", () => {
    expect(calculateScore({ assignmentType: "career" }, now).careerValue).toBe(
      92,
    )
    expect(calculateScore({ assignmentType: "exam" }, now).consequence).toBe(90)
    expect(
      calculateScore(
        {
          assignmentType: "exam",
          careerAlignment: 0,
          consequence: 0,
          goalAlignment: 0,
          estimatedMinutes: 0,
        },
        now,
      ),
    ).toMatchObject({
      careerValue: 0,
      consequence: 0,
      goalAlignment: 0,
      workload: 0,
    })
  })

  it("does not mutate the input or supplied clock", () => {
    const input: ScoreInput = { dueDate: "2026-12-03T12:00:00.000Z" }
    const original = { ...input }
    const clock = new Date(now)
    calculateScore(input, clock)
    expect(input).toEqual(original)
    expect(clock.toISOString()).toBe("2026-12-01T12:00:00.000Z")
  })
})

describe("calculateScore urgency boundaries", () => {
  it.each([
    [-1, 100],
    [0, 100],
    [1, 96],
    [24 * hour, 96],
    [24 * hour + 1, 84],
    [72 * hour, 84],
    [72 * hour + 1, 68],
    [168 * hour, 68],
    [168 * hour + 1, 48],
    [336 * hour, 48],
    [336 * hour + 1, 24],
  ])("uses urgency %i ms from now => %i", (offset, urgency) => {
    const dueDate = new Date(now.getTime() + offset).toISOString()
    expect(calculateScore({ dueDate }, now).urgency).toBe(urgency)
  })

  it("keeps overdue tasks at maximum urgency regardless of lateness", () => {
    expect(
      calculateScore({ dueDate: "2026-11-30T12:00:00.000Z" }, now).urgency,
    ).toBe(100)
    expect(
      calculateScore({ dueDate: "2025-12-01T12:00:00.000Z" }, now).urgency,
    ).toBe(100)
  })

  it("compares equivalent deadline instants regardless of offset notation", () => {
    expect(
      calculateScore({ dueDate: "2026-12-02T07:00:00-05:00" }, now),
    ).toEqual(calculateScore({ dueDate: "2026-12-02T12:00:00Z" }, now))
  })
})

describe("calculateScore clamping and neglect", () => {
  it.each([
    [-10, 0],
    [0, 0],
    [49.4, 49],
    [49.5, 50],
    [100, 100],
    [150, 100],
    [-Infinity, 0],
    [Infinity, 100],
  ])("rounds and clamps score inputs %s => %i", (value, expected) => {
    const result = calculateScore(
      {
        careerAlignment: value,
        consequence: value,
        goalAlignment: value,
      },
      now,
    )
    expect(result).toMatchObject({
      careerValue: expected,
      consequence: expected,
      goalAlignment: expected,
    })
  })

  it.each([
    [-60, 0],
    [0, 0],
    [120, 50],
    [240, 100],
    [480, 100],
  ])(
    "maps %i estimated minutes to bounded workload %i",
    (estimatedMinutes, workload) => {
      expect(calculateScore({ estimatedMinutes }, now).workload).toBe(workload)
    },
  )

  it("caps academic value and the final score for high-value, urgent work", () => {
    const result = calculateScore(
      {
        assignmentType: "exam",
        classLevel: "graduate",
        careerAlignment: 200,
        consequence: 200,
        goalAlignment: 200,
        estimatedMinutes: 1000,
        dueDate: now.toISOString(),
        lastWorkedAt: "2026-01-01T12:00:00Z",
      },
      now,
    )
    expect(Object.values(result)).toEqual(Array(8).fill(100))
  })

  it.each([
    ["2026-12-02T12:00:00Z", 28],
    ["2026-12-01T12:00:00Z", 28],
    ["2026-11-30T12:00:00Z", 38],
    ["2026-11-24T12:00:00Z", 98],
    ["2026-11-23T12:00:00Z", 100],
  ])("maps lastWorkedAt %s to neglect %i", (lastWorkedAt, neglectFactor) => {
    expect(calculateScore({ lastWorkedAt }, now).neglectFactor).toBe(
      neglectFactor,
    )
  })
})

describe("scoring current invalid-input behavior (characterization only)", () => {
  it("currently treats an unreadable due date like a distant deadline", () => {
    expect(calculateScore({ dueDate: "not-a-date" }, now)).toEqual(
      calculateScore({}, now),
    )
  })

  it("currently propagates an unreadable lastWorkedAt into a NaN score", () => {
    const result = calculateScore({ lastWorkedAt: "not-a-date" }, now)
    expect(result.neglectFactor).toBeNaN()
    expect(result.score).toBeNaN()
  })

  it.each([
    "careerAlignment",
    "consequence",
    "goalAlignment",
    "estimatedMinutes",
  ] as const)(
    "currently propagates NaN in %s into the final score",
    (field) => {
      expect(calculateScore({ [field]: NaN }, now).score).toBeNaN()
    },
  )

  it("currently produces NaN for an unsupported class level at runtime", () => {
    // Simulates a value crossing a runtime boundary despite the TS union;
    // calendar-task currently emits this value for an ITCS 5155 title.
    const input = { classLevel: "5000" } as unknown as ScoreInput
    const result = calculateScore(input, now)
    expect(result.academicValue).toBeNaN()
    expect(result.score).toBeNaN()
  })
})
