import type { AssignmentType, ClassLevel, ScoreBreakdown } from './scoring'
import type { ParsedCalendarEvent } from './ics'

export type FirestoreOwnedDocument = {
  ownerId: string
  createdAt: string
  updatedAt: string
}

export type FirestoreUserProfileDocument = {
  authUid: string
  email: string
  name: string
  role: 'admin' | 'student' | 'test'
  username: string
  createdAt: string
  updatedAt: string
}

export type FirestoreCourseDocument = FirestoreOwnedDocument & {
  code: string
  color: 'blue' | 'green' | 'gray'
  level: ClassLevel
  name: string
}

export type FirestoreTaskDocument = FirestoreOwnedDocument &
  ScoreBreakdown & {
    assignmentType: AssignmentType
    calendarEventId?: string
    careerAlignment?: number | null
    classLevel: ClassLevel
    courseId?: string
    consequence?: number | null
    dueDate?: string
    estimatedMinutes: number
    goalAlignment?: number | null
    lastWorkedAt?: string
    plannedStart?: string
    status: 'done' | 'open' | 'scheduled'
    title: string
  }

export type FirestoreCalendarEventDocument = FirestoreOwnedDocument &
  ParsedCalendarEvent & {
    courseId?: string
    source: 'ics-file' | 'ics-url' | 'manual'
    sourceKey: string
  }
