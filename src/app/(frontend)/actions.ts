'use server'

import { lookup } from 'node:dns/promises'
import { parseICS } from '@/lib/ics'
import type { AssignmentType, ClassLevel } from '@/lib/scoring'
import { requireAppUser } from '@/lib/app-auth'
import {
  createUserCourse,
  createUserTask,
  createWorkflow,
  deleteUserCourse,
  importUserCalendar,
  replanUserTasks,
  setUserEventCompleted,
  setUserTaskCompleted,
  updateUserCourse,
} from '@/lib/app-data'
import type { AppCourse } from '@/lib/app-data'
import {
  buildExamPlan,
  buildSyllabusPlan,
  buildTeamPlan,
  type WorkflowPlan,
} from '@/lib/workflow-planner'

type ActionResult<T = undefined> =
  | { ok: true; data: T; message: string }
  | { ok: false; error: string }

type NewTask = {
  assignmentType: AssignmentType
  careerAlignment?: number
  classLevel: ClassLevel
  consequence?: number
  courseId?: string
  dueDate?: string
  estimatedMinutes: number
  goalAlignment?: number
  title: string
}

const taskTypes = new Set([
  'exam',
  'project',
  'lab',
  'problem-set',
  'reading',
  'career',
  'personal',
])
const classLevels = new Set(['1000', '2000', '3000', '4000', 'graduate', 'independent'])
const courseColors = new Set(['blue', 'green', 'gray'])
const MAX_CALENDAR_BYTES = 5_000_000

function asNumber(value: unknown, fallback: number, min = 0, max = 100) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

export async function createTaskAction(
  input: NewTask,
): Promise<ActionResult<{ id: string }>> {
  const appUser = await requireAppUser()
  if (!appUser) return { ok: false, error: 'Sign in to add tasks.' }
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 160) : ''
  if (!title) return { ok: false, error: 'Give the task a title.' }
  if (!taskTypes.has(input.assignmentType))
    return { ok: false, error: 'Unknown assignment type.' }
  if (!classLevels.has(input.classLevel))
    return { ok: false, error: 'Unknown class level.' }
  const dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return { ok: false, error: 'The deadline could not be read.' }
  }

  try {
    const task = await createUserTask(appUser.id, {
      assignmentType: input.assignmentType,
      careerAlignment: asNumber(input.careerAlignment, 35),
      classLevel: input.classLevel,
      consequence: asNumber(input.consequence, 55),
      courseId: input.courseId,
      dueDate: dueDate?.toISOString(),
      estimatedMinutes: asNumber(input.estimatedMinutes, 60, 15, 1440),
      goalAlignment: asNumber(input.goalAlignment, 50),
      title,
    })
    return { ok: true, data: { id: task.id }, message: `${title} was added to the plan.` }
  } catch {
    return { ok: false, error: 'Signal could not save that task. Try again.' }
  }
}

export async function createCourseAction(
  input: unknown,
): Promise<ActionResult<AppCourse>> {
  const appUser = await requireAppUser()
  if (!appUser) return { ok: false, error: 'Sign in to add courses.' }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'The course details are invalid.' }
  }
  const values = input as Record<string, unknown>
  if (
    Object.keys(values).some((key) => !['code', 'name', 'level', 'color'].includes(key))
  ) {
    return { ok: false, error: 'The course details contain unsupported fields.' }
  }
  const code = typeof values.code === 'string' ? values.code.trim().toUpperCase() : ''
  const name = typeof values.name === 'string' ? values.name.trim() : ''
  const level = typeof values.level === 'string' ? values.level : ''
  const color = typeof values.color === 'string' ? values.color : 'blue'
  if (!/^[A-Z0-9][A-Z0-9 -]{1,19}$/.test(code)) {
    return { ok: false, error: 'Use a course code between 2 and 20 letters or numbers.' }
  }
  if (!name || name.length > 120)
    return { ok: false, error: 'Enter a course name up to 120 characters.' }
  if (!classLevels.has(level)) return { ok: false, error: 'Choose a valid course level.' }
  if (!courseColors.has(color))
    return { ok: false, error: 'Choose a valid course color.' }

  try {
    const course = await createUserCourse(appUser.id, {
      code,
      color: color as AppCourse['color'],
      level: level as AppCourse['level'],
      name,
    })
    return {
      ok: true,
      data: course,
      message: `${course.code} was added to your courses.`,
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Signal could not save that course.',
    }
  }
}

export async function updateCourseAction(
  courseIdValue: unknown,
  input: unknown,
): Promise<ActionResult<AppCourse>> {
  const appUser = await requireAppUser()
  if (!appUser) return { ok: false, error: 'Sign in to update courses.' }
  if (
    typeof courseIdValue !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(courseIdValue)
  ) {
    return { ok: false, error: 'That course is invalid.' }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'The course details are invalid.' }
  }
  const values = input as Record<string, unknown>
  if (Object.keys(values).some((key) => !['name', 'level', 'color'].includes(key))) {
    return { ok: false, error: 'The course details contain unsupported fields.' }
  }
  const name = typeof values.name === 'string' ? values.name.trim() : ''
  const level = typeof values.level === 'string' ? values.level : ''
  const color = typeof values.color === 'string' ? values.color : ''
  if (!name || name.length > 120)
    return { ok: false, error: 'Enter a course name up to 120 characters.' }
  if (!classLevels.has(level)) return { ok: false, error: 'Choose a valid course level.' }
  if (!courseColors.has(color))
    return { ok: false, error: 'Choose a valid course color.' }

  try {
    const course = await updateUserCourse(appUser.id, courseIdValue, {
      color: color as AppCourse['color'],
      level: level as AppCourse['level'],
      name,
    })
    return { ok: true, data: course, message: `${course.code} was updated.` }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Signal could not update that course.',
    }
  }
}

export async function deleteCourseAction(
  courseIdValue: unknown,
): Promise<ActionResult<{ id: string }>> {
  const appUser = await requireAppUser()
  if (!appUser) return { ok: false, error: 'Sign in to remove courses.' }
  if (
    typeof courseIdValue !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(courseIdValue)
  ) {
    return { ok: false, error: 'That course is invalid.' }
  }
  try {
    await deleteUserCourse(appUser.id, courseIdValue)
    return { ok: true, data: { id: courseIdValue }, message: 'Course removed.' }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Signal could not remove that course.',
    }
  }
}

export async function createWorkflowAction(input: {
  prompt: string
  workflow: 'exam' | 'syllabus' | 'team'
}): Promise<ActionResult<{ eventsCreated: number; tasksCreated: number }>> {
  const appUser = await requireAppUser()
  if (!appUser) return { ok: false, error: 'Sign in to build a plan.' }
  if (!input || !['exam', 'syllabus', 'team'].includes(input.workflow)) {
    return { ok: false, error: 'Choose a valid planning workflow.' }
  }
  const prompt = String(input.prompt ?? '')
    .trim()
    .slice(0, 20_000)
  if (!prompt)
    return { ok: false, error: 'Paste or describe the planning details first.' }

  const builders: Record<'exam' | 'syllabus' | 'team', (value: string) => WorkflowPlan> =
    {
      exam: buildExamPlan,
      syllabus: buildSyllabusPlan,
      team: buildTeamPlan,
    }
  const plan = builders[input.workflow](prompt)
  if (!plan.tasks.length) {
    return {
      ok: false,
      error: 'No dated items were found. Put each item and date on its own line.',
    }
  }

  try {
    const result = await createWorkflow(appUser.id, plan)
    return {
      ok: true,
      data: result,
      message: `Created ${result.tasksCreated} ${plan.label} and ${result.eventsCreated} calendar block${result.eventsCreated === 1 ? '' : 's'}.`,
    }
  } catch {
    return { ok: false, error: 'Signal could not save the generated plan.' }
  }
}

export async function setTaskCompletedAction(
  id: string,
  completed: boolean,
): Promise<ActionResult<{ completed: boolean; id: string }>> {
  if (!id || id.length > 100 || id.startsWith('calendar-')) {
    return { ok: false, error: 'That task is invalid.' }
  }
  try {
    const appUser = await requireAppUser()
    if (!appUser) return { ok: false, error: 'Sign in to update tasks.' }
    if (typeof completed !== 'boolean')
      return { ok: false, error: 'That task state is invalid.' }
    const task = await setUserTaskCompleted(appUser.id, id, completed)
    return {
      ok: true,
      data: task,
      message: completed
        ? 'Task moved to Completed.'
        : 'Task restored to the upcoming plan.',
    }
  } catch {
    return { ok: false, error: 'Signal could not update that task.' }
  }
}

function isPrivateAddress(address: string) {
  return (
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80:') ||
    /^127\./.test(address) ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^169\.254\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  )
}

async function readCalendarSource(formData: FormData) {
  const file = formData.get('file')
  const urlValue = String(formData.get('url') ?? '').trim()

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CALENDAR_BYTES)
      throw new Error('Choose an .ics file smaller than 5 MB.')
    const text = await file.text()
    return {
      isCanvas: /canvas|instructure/i.test(`${file.name}\n${text.slice(0, 2000)}`),
      source: 'ics-file' as const,
      text,
    }
  }
  if (!urlValue) throw new Error('Choose an .ics file or enter a calendar URL.')

  let url = new URL(urlValue.replace(/^webcal:\/\//i, 'https://'))
  const isCanvas =
    /(^|\.)instructure\.com$/i.test(url.hostname) || /canvas/i.test(url.hostname)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Use an HTTP or HTTPS calendar URL.')

  let response: Response | undefined
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
      throw new Error('Local network calendar URLs are not supported.')
    }
    const addresses = await lookup(url.hostname, { all: true })
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('Private network calendar URLs are not supported.')
    }
    response = await fetch(url, {
      headers: {
        Accept: 'text/calendar,text/plain;q=0.9',
        'User-Agent': 'Signal Calendar Importer',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location) throw new Error('Calendar server returned an invalid redirect.')
    url = new URL(location, url)
  }
  if (!response) throw new Error('Calendar server did not respond.')
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error('Calendar feed redirected too many times.')
  }
  if (!response.ok) throw new Error(`Calendar server returned ${response.status}.`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_CALENDAR_BYTES)
    throw new Error('Calendar response is larger than 5 MB.')
  const text = await response.text()
  if (text.length > MAX_CALENDAR_BYTES)
    throw new Error('Calendar response is larger than 5 MB.')
  if (/<(?:!doctype\s+)?html/i.test(text)) {
    throw new Error(
      isCanvas
        ? 'Canvas returned a web page instead of a calendar. Copy the Calendar Feed link from Canvas Calendar settings, not the browser page URL.'
        : 'That URL returned a web page instead of an .ics calendar.',
    )
  }
  return { isCanvas, source: 'ics-url' as const, text }
}

export async function importCalendarAction(formData: FormData): Promise<
  ActionResult<{
    created: number
    duplicates: number
    parsed: number
    tasksCreated: number
  }>
> {
  try {
    const appUser = await requireAppUser()
    if (!appUser) return { ok: false, error: 'Sign in to import a calendar.' }
    const calendar = await readCalendarSource(formData)
    const events = parseICS(calendar.text)
    if (!events.length) {
      return {
        ok: false,
        error: calendar.isCanvas
          ? 'No Canvas events were found. In Canvas, open Calendar → Calendar Feed and copy that feed link, or download its .ics file.'
          : 'No VEVENT entries were found in that calendar.',
      }
    }

    const result = await importUserCalendar(appUser.id, events, calendar.source)
    return {
      ok: true,
      data: {
        created: result.created,
        duplicates: result.duplicates,
        parsed: events.length,
        tasksCreated: result.tasksCreated,
      },
      message: `${calendar.isCanvas ? 'Canvas: ' : ''}imported ${result.created} event${result.created === 1 ? '' : 's'}, synced ${result.tasksCreated} priority task${result.tasksCreated === 1 ? '' : 's'}; ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped.`,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Calendar import failed.',
    }
  }
}

export async function setCalendarEventCompletedAction(
  id: string,
  completed: boolean,
): Promise<ActionResult<{ completed: boolean; id: string }>> {
  if (!id || id.length > 100)
    return { ok: false, error: 'That calendar event is invalid.' }
  try {
    const appUser = await requireAppUser()
    if (!appUser) return { ok: false, error: 'Sign in to update assignments.' }
    if (typeof completed !== 'boolean')
      return { ok: false, error: 'That event state is invalid.' }
    const event = await setUserEventCompleted(appUser.id, id, completed)
    return {
      ok: true,
      data: event,
      message: completed
        ? 'Assignment marked completed.'
        : 'Assignment restored to the plan.',
    }
  } catch {
    return { ok: false, error: 'Signal could not update that assignment.' }
  }
}

export async function replanTasksAction(
  window: 'fortnight' | 'week' = 'fortnight',
): Promise<
  ActionResult<{ count: number; starts: Array<{ id: string; plannedStart: string }> }>
> {
  try {
    const appUser = await requireAppUser()
    if (!appUser) return { ok: false, error: 'Sign in to replan your tasks.' }
    const starts = await replanUserTasks(appUser.id, window)
    return {
      ok: true,
      data: { count: starts.length, starts },
      message: `Replanned ${starts.length} priority task${starts.length === 1 ? '' : 's'} into open ${window === 'week' ? 'slots this week' : 'focus blocks'} without changing hard deadlines.`,
    }
  } catch {
    return { ok: false, error: 'Signal could not replan the workload right now.' }
  }
}
