import type { AssignmentType, ClassLevel } from './scoring'

export type CalendarAssignmentInput = {
  completed?: boolean | null
  id: string | number
  start: string
  title: string
}

export function taskDataFromCalendarAssignment(event: CalendarAssignmentInput) {
  const lower = event.title.toLowerCase()
  const courseMatch = event.title.match(/\b[A-Z]{2,5}[- ](\d{4})\b/)
  const classLevel = (courseMatch
    ? `${courseMatch[1][0]}000`
    : '3000') as ClassLevel
  const assignmentType: AssignmentType =
    lower.includes('final') || lower.includes('midterm') || lower.includes('exam')
      ? 'exam'
      : lower.includes('lab')
        ? 'lab'
        : lower.includes('project') ||
            lower.includes('paper') ||
            lower.includes('presentation') ||
            lower.includes('sprint')
          ? 'project'
          : lower.includes('read')
            ? 'reading'
            : 'problem-set'
  const estimatedMinutes =
    assignmentType === 'exam'
      ? 180
      : assignmentType === 'project'
        ? 240
        : assignmentType === 'lab'
          ? 150
          : assignmentType === 'reading'
            ? 60
            : 90
  const title = event.title.replace(/\s*\[[^\]]+\]\s*$/, '').trim() || event.title

  return {
    assignmentType,
    calendarEvent: String(event.id),
    careerAlignment: assignmentType === 'lab' || assignmentType === 'project' ? 70 : 42,
    classLevel,
    consequence: assignmentType === 'exam' ? 92 : assignmentType === 'project' ? 84 : 72,
    dueDate: event.start,
    estimatedMinutes,
    goalAlignment: 76,
    status: event.completed ? ('done' as const) : ('open' as const),
    title,
  }
}
