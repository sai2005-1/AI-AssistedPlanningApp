export type ClassLevel = '1000' | '2000' | '3000' | '4000' | 'graduate' | 'independent'
export type AssignmentType =
  | 'exam'
  | 'project'
  | 'lab'
  | 'problem-set'
  | 'reading'
  | 'career'
  | 'personal'

export type ScoreInput = {
  assignmentType?: AssignmentType | null
  careerAlignment?: number | null
  classLevel?: ClassLevel | null
  consequence?: number | null
  dueDate?: string | null
  estimatedMinutes?: number | null
  goalAlignment?: number | null
  lastWorkedAt?: string | null
}

export type ScoreBreakdown = {
  academicValue: number
  careerValue: number
  consequence: number
  goalAlignment: number
  neglectFactor: number
  score: number
  urgency: number
  workload: number
}

const academicByLevel: Record<ClassLevel, number> = {
  '1000': 48,
  '2000': 58,
  '3000': 72,
  '4000': 86,
  graduate: 94,
  independent: 42,
}

const typeBoost: Record<AssignmentType, number> = {
  exam: 14,
  project: 12,
  lab: 9,
  'problem-set': 7,
  reading: 1,
  career: 2,
  personal: 0,
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function calculateScore(input: ScoreInput, now = new Date()): ScoreBreakdown {
  const due = input.dueDate ? new Date(input.dueDate) : null
  const hoursUntilDue = due ? (due.getTime() - now.getTime()) / 3_600_000 : 24 * 21
  const urgency =
    hoursUntilDue <= 0
      ? 100
      : hoursUntilDue <= 24
        ? 96
        : hoursUntilDue <= 72
          ? 84
          : hoursUntilDue <= 168
            ? 68
            : hoursUntilDue <= 336
              ? 48
              : 24

  const assignmentType = input.assignmentType ?? 'personal'
  const classLevel = input.classLevel ?? 'independent'
  const academicValue = clamp(academicByLevel[classLevel] + typeBoost[assignmentType])
  const careerValue = clamp(input.careerAlignment ?? (assignmentType === 'career' ? 92 : 35))
  const goalAlignment = clamp(input.goalAlignment ?? 50)
  const consequence = clamp(input.consequence ?? (assignmentType === 'exam' ? 90 : 55))
  const workload = clamp(((input.estimatedMinutes ?? 60) / 240) * 100)
  const lastWorked = input.lastWorkedAt ? new Date(input.lastWorkedAt) : null
  const daysNeglected = lastWorked
    ? Math.max(0, (now.getTime() - lastWorked.getTime()) / 86_400_000)
    : 7
  const neglectFactor = clamp(28 + daysNeglected * 10)

  const weighted =
    urgency * 0.27 +
    academicValue * 0.18 +
    careerValue * 0.16 +
    goalAlignment * 0.14 +
    consequence * 0.14 +
    neglectFactor * 0.08 +
    workload * 0.03

  return {
    academicValue,
    careerValue,
    consequence,
    goalAlignment,
    neglectFactor,
    score: clamp(weighted),
    urgency,
    workload,
  }
}
