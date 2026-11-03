'use server'

import { lookup } from 'node:dns/promises'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import config from '@payload-config'
import { taskDataFromCalendarAssignment } from '@/lib/calendar-task'
import { parseICS } from '@/lib/ics'
import type { AssignmentType, ClassLevel } from '@/lib/scoring'
import { asPayloadUser, requireAppUser } from '@/lib/app-auth'
import type { User as PayloadUser } from 'payload'
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
const MAX_CALENDAR_BYTES = 5_000_000

type AssignmentEvent = {
  completed?: boolean | null
  id: string | number
  kind?: string | null
  sourceKey?: string | null
  start: string
  title: string
}

async function createInBatches<T>(
  items: T[],
  operation: (item: T) => Promise<unknown>,
  batchSize = 25,
) {
  let created = 0
  let failed = 0
  for (let index = 0; index < items.length; index += batchSize) {
    const results = await Promise.allSettled(items.slice(index, index + batchSize).map(operation))
    for (const result of results) {
      if (result.status === 'fulfilled') created += 1
      else failed += 1
    }
  }
  return { created, failed }
}

async function syncAssignmentTasks(
  payload: Payload,
  events: AssignmentEvent[],
  user: PayloadUser,
) {
  const assignments = events.filter((event) => event.kind === 'deadline')
  if (!assignments.length) return { created: 0, failed: 0 }
  const existingEventIds = new Set<string>()

  for (let index = 0; index < assignments.length; index += 75) {
    const ids = assignments.slice(index, index + 75).map((event) => event.id)
    const existing = await payload.find({
      collection: 'tasks',
      limit: 100,
      overrideAccess: false,
      user,
      where: { calendarEvent: { in: ids } },
    })
    for (const task of existing.docs) {
      const eventId =
        typeof task.calendarEvent === 'object' && task.calendarEvent
          ? task.calendarEvent.id
          : task.calendarEvent
      if (eventId) existingEventIds.add(String(eventId))
    }
  }

  return createInBatches(
    assignments.filter((event) => !existingEventIds.has(String(event.id))),
    (event) =>
      payload.create({
        collection: 'tasks',
        data: taskDataFromCalendarAssignment(event),
        overrideAccess: false,
        user,
      }),
  )
}

function asNumber(value: unknown, fallback: number, min = 0, max = 100) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

export async function createTaskAction(input: NewTask): Promise<ActionResult<{ id: string }>> {
  const appUser = await requireAppUser()
  if (!appUser) return { ok: false, error: 'Sign in to add tasks.' }
  const user = asPayloadUser(appUser)
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 160) : ''
  if (!title) return { ok: false, error: 'Give the task a title.' }
  if (!taskTypes.has(input.assignmentType)) return { ok: false, error: 'Unknown assignment type.' }
  if (!classLevels.has(input.classLevel)) return { ok: false, error: 'Unknown class level.' }
  const dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return { ok: false, error: 'The deadline could not be read.' }
  }

  try {
    const payload = await getPayload({ config })
    const task = await payload.create({
      collection: 'tasks',
      data: {
        assignmentType: input.assignmentType,
        careerAlignment: asNumber(input.careerAlignment, 35),
        classLevel: input.classLevel,
        consequence: asNumber(input.consequence, 55),
        dueDate: dueDate?.toISOString(),
        estimatedMinutes: asNumber(input.estimatedMinutes, 60, 15, 1440),
        goalAlignment: asNumber(input.goalAlignment, 50),
        status: 'open',
        title,
      },
      overrideAccess: false,
      user,
    })
    return { ok: true, data: { id: String(task.id) }, message: `${title} was added to the plan.` }
  } catch {
    return { ok: false, error: 'Signal could not save that task. Try again.' }
  }
}

export async function createWorkflowAction(
  input: { prompt: string; workflow: 'exam' | 'syllabus' | 'team' },
): Promise<ActionResult<{ eventsCreated: number; tasksCreated: number }>> {
  const appUser = await requireAppUser()
  if (!appUser) return { ok: false, error: 'Sign in to build a plan.' }
  const prompt = String(input.prompt ?? '').trim().slice(0, 20_000)
  if (!prompt) return { ok: false, error: 'Paste or describe the planning details first.' }

  const builders: Record<typeof input.workflow, (value: string) => WorkflowPlan> = {
    exam: buildExamPlan,
    syllabus: buildSyllabusPlan,
    team: buildTeamPlan,
  }
  const plan = builders[input.workflow](prompt)
  if (!plan.tasks.length) {
    return { ok: false, error: 'No dated items were found. Put each item and date on its own line.' }
  }

  try {
    const payload = await getPayload({ config })
    const user = asPayloadUser(appUser)
    const eventIds: string[] = []
    let eventFailures = 0
    for (const event of plan.events) {
      try {
        const created = await payload.create({
          collection: 'calendar-events',
          data: {
            ...event,
            source: 'manual',
            uid: `workflow-${crypto.randomUUID()}`,
          },
          overrideAccess: false,
          user,
        })
        eventIds.push(String(created.id))
      } catch {
        eventFailures += 1
        eventIds.push('')
      }
    }
    let tasksCreated = 0
    for (const [index, task] of plan.tasks.entries()) {
      try {
        await payload.create({
          collection: 'tasks',
          data: {
            ...task,
            calendarEvent:
              eventIds.length === plan.tasks.length ? eventIds[index] || undefined : undefined,
            status: 'open',
          },
          overrideAccess: false,
          user,
        })
        tasksCreated += 1
      } catch {
        // Keep successfully created plan items and report the partial result.
      }
    }
    if (!tasksCreated) return { ok: false, error: 'Signal could not save the generated plan.' }
    const eventsCreated = plan.events.length - eventFailures
    return {
      ok: true,
      data: { eventsCreated, tasksCreated },
      message: `Created ${tasksCreated} ${plan.label} and ${eventsCreated} calendar block${eventsCreated === 1 ? '' : 's'}.`,
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
    const user = asPayloadUser(appUser)
    const payload = await getPayload({ config })
    const task = await payload.update({
      collection: 'tasks',
      id,
      data: { status: completed ? 'done' : 'open' },
      overrideAccess: false,
      user,
    })
    const eventId =
      typeof task.calendarEvent === 'object' && task.calendarEvent
        ? task.calendarEvent.id
        : task.calendarEvent
    if (eventId) {
      await payload.update({
        collection: 'calendar-events',
        id: eventId,
        data: { completed },
        overrideAccess: false,
        user,
      })
    }
    return {
      ok: true,
      data: { completed, id: String(task.id) },
      message: completed ? 'Task moved to Completed.' : 'Task restored to the upcoming plan.',
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
    if (file.size > MAX_CALENDAR_BYTES) throw new Error('Choose an .ics file smaller than 5 MB.')
    const text = await file.text()
    return {
      isCanvas: /canvas|instructure/i.test(`${file.name}\n${text.slice(0, 2000)}`),
      source: 'ics-file' as const,
      text,
    }
  }
  if (!urlValue) throw new Error('Choose an .ics file or enter a calendar URL.')

  let url = new URL(urlValue.replace(/^webcal:\/\//i, 'https://'))
  const isCanvas = /(^|\.)instructure\.com$/i.test(url.hostname) || /canvas/i.test(url.hostname)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS calendar URL.')

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
  if (length > MAX_CALENDAR_BYTES) throw new Error('Calendar response is larger than 5 MB.')
  const text = await response.text()
  if (text.length > MAX_CALENDAR_BYTES) throw new Error('Calendar response is larger than 5 MB.')
  if (/<(?:!doctype\s+)?html/i.test(text)) {
    throw new Error(
      isCanvas
        ? 'Canvas returned a web page instead of a calendar. Copy the Calendar Feed link from Canvas Calendar settings, not the browser page URL.'
        : 'That URL returned a web page instead of an .ics calendar.',
    )
  }
  return { isCanvas, source: 'ics-url' as const, text }
}

export async function importCalendarAction(
  formData: FormData,
): Promise<ActionResult<{ created: number; duplicates: number; parsed: number; tasksCreated: number }>> {
  try {
    const appUser = await requireAppUser()
    if (!appUser) return { ok: false, error: 'Sign in to import a calendar.' }
    const user = asPayloadUser(appUser)
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

    const payload = await getPayload({ config })
    const keyedEvents = events.map((event) => ({
      event,
      sourceKey: `${event.uid}:${event.start}`,
    }))
    const existingKeys = new Set<string>()
    const importedEvents = new Map<string, AssignmentEvent>()

    for (let index = 0; index < keyedEvents.length; index += 75) {
      const keys = keyedEvents.slice(index, index + 75).map(({ sourceKey }) => sourceKey)
      const existing = await payload.find({
        collection: 'calendar-events',
        limit: 100,
        overrideAccess: false,
        user,
        where: { sourceKey: { in: keys } },
      })
      for (const event of existing.docs) {
        if (event.sourceKey) {
          existingKeys.add(event.sourceKey)
          importedEvents.set(event.sourceKey, event)
        }
      }
    }

    const newEvents = keyedEvents.filter(({ sourceKey }) => !existingKeys.has(sourceKey))
    const duplicates = keyedEvents.length - newEvents.length
    let created = 0
    let failed = 0
    for (let index = 0; index < newEvents.length; index += 25) {
      const batch = newEvents.slice(index, index + 25)
      const results = await Promise.allSettled(
        batch.map(({ event }) =>
          payload.create({
            collection: 'calendar-events',
            data: { ...event, source: calendar.source },
            overrideAccess: false,
            user,
          }),
        ),
      )
      for (const [resultIndex, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          created += 1
          importedEvents.set(batch[resultIndex].sourceKey, result.value)
        } else failed += 1
      }
    }
    if (!created && failed) {
      return {
        ok: false,
        error: `${calendar.isCanvas ? 'Canvas' : 'The calendar'} contained ${events.length} events, but Signal could not save them.`,
      }
    }
    const taskSync = await syncAssignmentTasks(payload, [...importedEvents.values()], user)
    return {
      ok: true,
      data: {
        created,
        duplicates,
        parsed: events.length,
        tasksCreated: taskSync.created,
      },
      message: `${calendar.isCanvas ? 'Canvas: ' : ''}imported ${created} event${created === 1 ? '' : 's'}, synced ${taskSync.created} priority task${taskSync.created === 1 ? '' : 's'}; ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped${failed || taskSync.failed ? `; ${failed + taskSync.failed} could not be saved` : ''}.`,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Calendar import failed.' }
  }
}

export async function setCalendarEventCompletedAction(
  id: string,
  completed: boolean,
): Promise<ActionResult<{ completed: boolean; id: string }>> {
  if (!id || id.length > 100) return { ok: false, error: 'That calendar event is invalid.' }
  try {
    const appUser = await requireAppUser()
    if (!appUser) return { ok: false, error: 'Sign in to update assignments.' }
    const user = asPayloadUser(appUser)
    const payload = await getPayload({ config })
    const event = await payload.update({
      collection: 'calendar-events',
      id,
      data: { completed: Boolean(completed) },
      overrideAccess: false,
      user,
    })
    const linkedTasks = await payload.find({
      collection: 'tasks',
      limit: 10,
      overrideAccess: false,
      user,
      where: { calendarEvent: { equals: id } },
    })
    await Promise.all(
      linkedTasks.docs.map((task) =>
        payload.update({
          collection: 'tasks',
          id: task.id,
          data: { status: completed ? 'done' : 'open' },
          overrideAccess: false,
          user,
        }),
      ),
    )
    return {
      ok: true,
      data: { completed: Boolean(event.completed), id: String(event.id) },
      message: completed ? 'Assignment marked completed.' : 'Assignment restored to the plan.',
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
    const user = asPayloadUser(appUser)
    const payload = await getPayload({ config })
    const now = new Date()
    const horizon = new Date(now)
    horizon.setDate(horizon.getDate() + (window === 'week' ? 7 : 14))
    const eventResult = await payload.find({
      collection: 'calendar-events',
      limit: 500,
      overrideAccess: false,
      sort: 'start',
      user,
      where: {
        and: [
          { start: { greater_than_equal: now.toISOString() } },
          { start: { less_than_equal: horizon.toISOString() } },
        ],
      },
    })
    await syncAssignmentTasks(payload, eventResult.docs, user)
    const result = await payload.find({
      collection: 'tasks',
      limit: 100,
      overrideAccess: false,
      sort: ['dueDate', '-score'],
      user,
      where: { status: { not_equals: 'done' } },
    })
    const busy = eventResult.docs
      .filter((event) => event.kind !== 'deadline' && !event.completed)
      .map((event) => [new Date(event.start).getTime(), new Date(event.end).getTime()] as [number, number])
    const allocations: Array<[number, number]> = []
    const starts: Array<{ id: string; plannedStart: string }> = []

    for (const task of result.docs) {
      const duration = Math.max(30, Math.min(240, Number(task.estimatedMinutes ?? 60))) * 60_000
      const deadline = task.dueDate
        ? Math.min(new Date(task.dueDate).getTime(), horizon.getTime())
        : horizon.getTime()
      let planned: number | undefined
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)

      while (day.getTime() < deadline && !planned) {
        const windowStart = new Date(day)
        windowStart.setHours(8, 0, 0, 0)
        const windowEnd = new Date(day)
        windowEnd.setHours(20, 0, 0, 0)
        let cursor = Math.max(windowStart.getTime(), now.getTime())
        const end = Math.min(windowEnd.getTime(), deadline)
        const intervals = [...busy, ...allocations]
          .filter(([start, finish]) => finish > cursor && start < end)
          .sort((a, b) => a[0] - b[0])
        for (const [start, finish] of intervals) {
          if (start - cursor >= duration) break
          cursor = Math.max(cursor, finish)
        }
        if (end - cursor >= duration) planned = cursor
        else day.setDate(day.getDate() + 1)
      }

      if (planned) {
        allocations.push([planned, planned + duration + 30 * 60_000])
        starts.push({ id: String(task.id), plannedStart: new Date(planned).toISOString() })
      }
    }

    await createInBatches(
      starts,
      ({ id, plannedStart }) =>
        payload.update({
          collection: 'tasks',
          id,
          data: { plannedStart, status: 'scheduled' },
          overrideAccess: false,
          user,
        }),
      20,
    )
    return {
      ok: true,
      data: { count: starts.length, starts },
      message: `Replanned ${starts.length} priority task${starts.length === 1 ? '' : 's'} into open ${window === 'week' ? 'slots this week' : 'focus blocks'} without changing hard deadlines.`,
    }
  } catch {
    return { ok: false, error: 'Signal could not replan the workload right now.' }
  }
}
