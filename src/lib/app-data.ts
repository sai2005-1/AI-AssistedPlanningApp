import 'server-only'

import { createHash } from 'node:crypto'
import type { WriteBatch } from 'firebase-admin/firestore'
import { getTeamFirestore } from './firebase-admin'
import { calculateScore, type ScoreInput } from './scoring'
import { taskDataFromCalendarAssignment } from './calendar-task'
import type { ParsedCalendarEvent } from './ics'
import type { WorkflowPlan } from './workflow-planner'

const TASKS = 'tasks'
const EVENTS = 'calendarEvents'
const COURSES = 'courses'

export type AppTaskInput = ScoreInput & {
  assignmentType: NonNullable<ScoreInput['assignmentType']>
  classLevel: NonNullable<ScoreInput['classLevel']>
  estimatedMinutes: number
  title: string
}

export type AppTask = AppTaskInput & {
  academicValue: number
  calendarEventId?: string
  careerValue: number
  courseId?: string
  id: string
  neglectFactor: number
  plannedStart?: string
  score: number
  status: 'done' | 'open' | 'scheduled'
  urgency: number
  workload: number
}

export type AppCalendarEvent = ParsedCalendarEvent & {
  courseId?: string
  id: string
  source: 'ics-file' | 'ics-url' | 'manual'
}

function deterministicId(scope: string, value: string) {
  return createHash('sha256').update(`${scope}\0${value}`).digest('hex')
}

function eventFromSnapshot(id: string, data: FirebaseFirestore.DocumentData): AppCalendarEvent {
  return {
    allDay: Boolean(data.allDay),
    completed: Boolean(data.completed),
    description: typeof data.description === 'string' ? data.description : undefined,
    end: String(data.end ?? ''),
    id,
    kind: data.kind ?? 'other',
    location: typeof data.location === 'string' ? data.location : undefined,
    source: data.source,
    start: String(data.start ?? ''),
    title: String(data.title ?? ''),
    uid: String(data.uid ?? id),
    courseId: typeof data.courseId === 'string' ? data.courseId : undefined,
  }
}

function taskFromSnapshot(id: string, data: FirebaseFirestore.DocumentData): AppTask {
  return {
    academicValue: Number(data.academicValue ?? 0),
    assignmentType: data.assignmentType,
    calendarEventId: typeof data.calendarEventId === 'string' ? data.calendarEventId : undefined,
    careerAlignment: Number(data.careerAlignment ?? 35),
    careerValue: Number(data.careerValue ?? 0),
    classLevel: data.classLevel,
    consequence: Number(data.consequence ?? 55),
    courseId: typeof data.courseId === 'string' ? data.courseId : undefined,
    dueDate: typeof data.dueDate === 'string' ? data.dueDate : undefined,
    estimatedMinutes: Number(data.estimatedMinutes ?? 60),
    goalAlignment: Number(data.goalAlignment ?? 50),
    id,
    neglectFactor: Number(data.neglectFactor ?? 0),
    plannedStart: typeof data.plannedStart === 'string' ? data.plannedStart : undefined,
    score: Number(data.score ?? 0),
    status: data.status === 'done' || data.status === 'scheduled' ? data.status : 'open',
    title: String(data.title ?? ''),
    urgency: Number(data.urgency ?? 0),
    workload: Number(data.workload ?? 0),
  }
}

async function commitInBatches<T>(
  items: T[],
  write: (batch: WriteBatch, item: T) => void,
  batchSize = 400,
) {
  const db = getTeamFirestore()
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = db.batch()
    for (const item of items.slice(index, index + batchSize)) write(batch, item)
    await batch.commit()
  }
}

export async function listUserTasks(userId: string, limit = 50) {
  const result = await getTeamFirestore()
    .collection(TASKS)
    .where('ownerId', '==', userId)
    .orderBy('score', 'desc')
    .limit(limit)
    .get()
  return result.docs.map((snapshot) => taskFromSnapshot(snapshot.id, snapshot.data()))
}

export async function listUserEvents(userId: string, from = new Date().toISOString()) {
  const result = await getTeamFirestore()
    .collection(EVENTS)
    .where('ownerId', '==', userId)
    .where('start', '>=', from)
    .orderBy('start', 'asc')
    .limit(100)
    .get()
  return result.docs.map((snapshot) => eventFromSnapshot(snapshot.id, snapshot.data()))
}

export async function getCoursesByIds(ids: string[]) {
  const uniqueIds = [...new Set(ids)]
  const db = getTeamFirestore()
  const snapshots = await Promise.all(
    uniqueIds.map((id) => db.collection(COURSES).doc(id).get()),
  )
  return new Map(
    snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data()?.code]),
  )
}

export async function createUserTask(userId: string, input: AppTaskInput) {
  const db = getTeamFirestore()
  const reference = db.collection(TASKS).doc()
  const score = calculateScore(input)
  const now = new Date().toISOString()
  await reference.set({
    ...input,
    ...score,
    ownerId: userId,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  })
  return taskFromSnapshot(reference.id, {
    ...input,
    ...score,
    status: 'open',
  })
}

export async function createWorkflow(userId: string, plan: WorkflowPlan) {
  const db = getTeamFirestore()
  const eventRefs = plan.events.map(() => db.collection(EVENTS).doc())
  const taskRefs = plan.tasks.map(() => db.collection(TASKS).doc())
  const now = new Date().toISOString()
  const eventWrites = plan.events.map((event, index) => ({ event, reference: eventRefs[index] }))
  await commitInBatches(eventWrites, (batch, { event, reference }) => {
    batch.set(reference, {
      ...event,
      completed: false,
      ownerId: userId,
      source: 'manual',
      sourceKey: `workflow:${reference.id}`,
      uid: `workflow-${reference.id}`,
      createdAt: now,
      updatedAt: now,
    })
  })

  const taskWrites = plan.tasks.map((task, index) => ({
    reference: taskRefs[index],
    task,
    calendarEventId: eventRefs.length === taskRefs.length ? eventRefs[index].id : undefined,
  }))
  await commitInBatches(taskWrites, (batch, { reference, task, calendarEventId }) => {
    batch.set(reference, {
      ...task,
      ...calculateScore(task),
      ...(calendarEventId ? { calendarEventId } : {}),
      ownerId: userId,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    })
  })
  return { eventsCreated: eventRefs.length, tasksCreated: taskRefs.length }
}

async function syncAssignmentTasks(userId: string, events: AppCalendarEvent[]) {
  const assignments = events.filter((event) => event.kind === 'deadline')
  const existing = new Set<string>()
  const db = getTeamFirestore()
  for (let index = 0; index < assignments.length; index += 30) {
    const ids = assignments.slice(index, index + 30).map((event) => event.id)
    if (!ids.length) continue
    const result = await db
      .collection(TASKS)
      .where('ownerId', '==', userId)
      .where('calendarEventId', 'in', ids)
      .get()
    for (const task of result.docs) {
      if (typeof task.data().calendarEventId === 'string') existing.add(task.data().calendarEventId)
    }
  }

  const writes = assignments
    .filter((event) => !existing.has(event.id))
    .map((event) => {
      const reference = db.collection(TASKS).doc(`calendar_${deterministicId(userId, event.id)}`)
      const task = taskDataFromCalendarAssignment(event)
      return { event, reference, taskData: task }
    })
  await commitInBatches(writes, (batch, { event, reference, taskData }) => {
    batch.set(reference, {
      ...taskData,
      ...calculateScore(taskData),
      calendarEventId: event.id,
      ownerId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })
  return writes.length
}

export async function importUserCalendar(
  userId: string,
  events: ParsedCalendarEvent[],
  source: 'ics-file' | 'ics-url',
) {
  const db = getTeamFirestore()
  const uniqueEvents = new Map(
    events.map((event) => [`${event.uid}:${event.start}`, event] as const),
  )
  const keyedEvents = [...uniqueEvents].map(([sourceKey, event]) => ({ event, sourceKey }))
  const existingKeys = new Set<string>()
  const existingEvents = new Map<string, AppCalendarEvent>()

  for (let index = 0; index < keyedEvents.length; index += 30) {
    const keys = keyedEvents.slice(index, index + 30).map(({ sourceKey }) => sourceKey)
    const result = await db
      .collection(EVENTS)
      .where('ownerId', '==', userId)
      .where('sourceKey', 'in', keys)
      .get()
    for (const snapshot of result.docs) {
      const sourceKey = snapshot.data().sourceKey
      if (typeof sourceKey !== 'string') continue
      existingKeys.add(sourceKey)
      existingEvents.set(sourceKey, eventFromSnapshot(snapshot.id, snapshot.data()))
    }
  }

  const newEvents = keyedEvents.filter(({ sourceKey }) => !existingKeys.has(sourceKey))
  const createdEvents = newEvents.map(({ event, sourceKey }) => {
    const reference = db
      .collection(EVENTS)
      .doc(`import_${deterministicId(userId, sourceKey)}`)
    return { event, reference, sourceKey }
  })
  await commitInBatches(createdEvents, (batch, { event, reference, sourceKey }) => {
    batch.set(reference, {
      ...event,
      ownerId: userId,
      source,
      sourceKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })

  const imported = new Map(existingEvents)
  for (const { event, reference, sourceKey } of createdEvents) {
    imported.set(sourceKey, { ...event, id: reference.id, source })
  }
  const tasksCreated = await syncAssignmentTasks(userId, [...imported.values()])
  return {
    created: createdEvents.length,
    duplicates: events.length - createdEvents.length,
    tasksCreated,
  }
}

export async function setUserTaskCompleted(userId: string, taskId: string, completed: boolean) {
  const db = getTeamFirestore()
  const taskRef = db.collection(TASKS).doc(taskId)
  await db.runTransaction(async (transaction) => {
    const task = await transaction.get(taskRef)
    if (!task.exists || task.data()?.ownerId !== userId) throw new Error('Task not found.')
    const calendarEventId = task.data()?.calendarEventId
    let eventRef
    let event
    if (typeof calendarEventId === 'string') {
      eventRef = db.collection(EVENTS).doc(calendarEventId)
      event = await transaction.get(eventRef)
    }
    transaction.update(taskRef, {
      status: completed ? 'done' : 'open',
      updatedAt: new Date().toISOString(),
    })
    if (eventRef && event?.exists && event.data()?.ownerId === userId) {
      transaction.update(eventRef, { completed, updatedAt: new Date().toISOString() })
    }
  })
  return { completed, id: taskId }
}

export async function setUserEventCompleted(userId: string, eventId: string, completed: boolean) {
  const db = getTeamFirestore()
  const eventRef = db.collection(EVENTS).doc(eventId)
  const linkedTasksQuery = db
    .collection(TASKS)
    .where('ownerId', '==', userId)
    .where('calendarEventId', '==', eventId)

  await db.runTransaction(async (transaction) => {
    const [event, linkedTasks] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(linkedTasksQuery),
    ])
    if (!event.exists || event.data()?.ownerId !== userId) throw new Error('Event not found.')
    transaction.update(eventRef, { completed, updatedAt: new Date().toISOString() })
    for (const task of linkedTasks.docs) {
      transaction.update(task.ref, {
        status: completed ? 'done' : 'open',
        updatedAt: new Date().toISOString(),
      })
    }
  })
  return { completed, id: eventId }
}

export async function replanUserTasks(userId: string, window: 'fortnight' | 'week' = 'fortnight') {
  const db = getTeamFirestore()
  const now = new Date()
  const horizon = new Date(now)
  horizon.setDate(horizon.getDate() + (window === 'week' ? 7 : 14))
  const [eventResult, taskResult] = await Promise.all([
    db
      .collection(EVENTS)
      .where('ownerId', '==', userId)
      .where('start', '>=', now.toISOString())
      .where('start', '<=', horizon.toISOString())
      .orderBy('start', 'asc')
      .limit(500)
      .get(),
    db.collection(TASKS).where('ownerId', '==', userId).limit(500).get(),
  ])
  const events = eventResult.docs.map((snapshot) => eventFromSnapshot(snapshot.id, snapshot.data()))
  const tasks = taskResult.docs
    .map((snapshot) => taskFromSnapshot(snapshot.id, snapshot.data()))
    .filter((task) => task.status !== 'done')
    .sort((left, right) => {
      if (!left.dueDate) return right.dueDate ? 1 : right.score - left.score
      if (!right.dueDate) return -1
      return left.dueDate.localeCompare(right.dueDate) || right.score - left.score
    })
  const busy = events
    .filter((event) => event.kind !== 'deadline' && !event.completed)
    .map((event) => [Date.parse(event.start), Date.parse(event.end)] as [number, number])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
  const allocations: Array<[number, number]> = []
  const starts: Array<{ id: string; plannedStart: string }> = []

  for (const task of tasks) {
    const duration = Math.max(30, Math.min(240, task.estimatedMinutes)) * 60_000
    const deadline = task.dueDate
      ? Math.min(Date.parse(task.dueDate), horizon.getTime())
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
        .sort((left, right) => left[0] - right[0])
      for (const [start, finish] of intervals) {
        if (start - cursor >= duration) break
        cursor = Math.max(cursor, finish)
      }
      if (end - cursor >= duration) planned = cursor
      else day.setDate(day.getDate() + 1)
    }
    if (planned) {
      allocations.push([planned, planned + duration + 30 * 60_000])
      starts.push({ id: task.id, plannedStart: new Date(planned).toISOString() })
    }
  }

  await commitInBatches(starts, (batch, { id, plannedStart }) => {
    batch.update(db.collection(TASKS).doc(id), {
      plannedStart,
      status: 'scheduled',
      updatedAt: new Date().toISOString(),
    })
  })
  return starts
}