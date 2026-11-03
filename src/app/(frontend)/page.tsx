import { getPayload } from 'payload'
import config from '@payload-config'
import SignalApp, { type CalendarEventView, type TaskView } from './signal-app'
import { taskDataFromCalendarAssignment } from '@/lib/calendar-task'
import { calculateScore } from '@/lib/scoring'
import { asPayloadUser, requireAppUser } from '@/lib/app-auth'
import AuthScreen from './auth-screen'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const user = await requireAppUser()
  if (!user) return <AuthScreen />
  const payload = await getPayload({ config })
  const payloadUser = asPayloadUser(user)
  const [taskResult, eventResult] = await Promise.all([
    payload.find({
      collection: 'tasks',
      depth: 1,
      limit: 50,
      overrideAccess: false,
      sort: '-score',
      user: payloadUser,
    }),
    payload.find({
      collection: 'calendar-events',
      depth: 1,
      limit: 100,
      overrideAccess: false,
      sort: 'start',
      user: payloadUser,
      where: { start: { greater_than_equal: new Date().toISOString() } },
    }),
  ])

  const tasks: TaskView[] = taskResult.docs.map((task) => ({
    academicValue: Number(task.academicValue ?? 0),
    assignmentType: task.assignmentType,
    careerValue: Number(task.careerValue ?? 0),
    classLevel: task.classLevel,
    consequence: Number(task.consequence ?? 0),
    courseCode:
      typeof task.course === 'object' && task.course ? String(task.course.code) : undefined,
    dueDate: task.dueDate ?? undefined,
    estimatedMinutes: Number(task.estimatedMinutes ?? 60),
    goalAlignment: Number(task.goalAlignment ?? 0),
    id: String(task.id),
    calendarEventId:
      typeof task.calendarEvent === 'object' && task.calendarEvent
        ? String(task.calendarEvent.id)
        : task.calendarEvent
          ? String(task.calendarEvent)
          : undefined,
    neglectFactor: Number(task.neglectFactor ?? 0),
    plannedStart: task.plannedStart ?? undefined,
    score: Number(task.score ?? 0),
    status: task.status ?? 'open',
    title: task.title,
    urgency: Number(task.urgency ?? 0),
    workload: Number(task.workload ?? 0),
  }))

  const events: CalendarEventView[] = eventResult.docs.map((event) => ({
    allDay: Boolean(event.allDay),
    completed: Boolean(event.completed),
    end: event.end,
    id: String(event.id),
    kind: event.kind ?? 'other',
    location: event.location ?? undefined,
    start: event.start,
    title: event.title,
  }))

  const persistedEventIds = new Set(tasks.map((task) => task.calendarEventId).filter(Boolean))
  for (const event of events) {
    if (event.kind !== 'deadline' || persistedEventIds.has(event.id)) continue
    const inferred = taskDataFromCalendarAssignment(event)
    tasks.push({
      ...calculateScore(inferred),
      ...inferred,
      calendarEventId: event.id,
      courseCode: event.title.match(/\b[A-Z]{2,5}[- ]\d{4}\b/)?.[0].replace('-', ' '),
      id: `calendar-${event.id}`,
      plannedStart: undefined,
    })
  }

  tasks.sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1
    if (b.status === 'done' && a.status !== 'done') return -1
    return b.score - a.score
  })

  return <SignalApp currentUser={user} initialEvents={events} initialTasks={tasks} />
}
