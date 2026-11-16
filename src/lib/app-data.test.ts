import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getTeamFirestore } from './firebase-admin'
import {
  importUserCalendar,
  createUserCourse,
  createUserTask,
  deleteUserCourse,
  listUserCourses,
  listUserEvents,
  listUserTasks,
  setUserEventCompleted,
  updateUserCourse,
} from './app-data'

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const testUserIds = [crypto.randomUUID(), crypto.randomUUID()]

async function clearOwnedRecords(collection: string, ownerId: string) {
  const db = getTeamFirestore()
  const records = await db.collection(collection).where('ownerId', '==', ownerId).get()
  const batch = db.batch()
  for (const record of records.docs) batch.delete(record.ref)
  if (!records.empty) await batch.commit()
}

describe.skipIf(!emulatorAvailable)('Firestore app-data repository', () => {
  afterEach(async () => {
    await Promise.all(
      testUserIds.flatMap((userId) => [
        clearOwnedRecords('tasks', userId),
        clearOwnedRecords('calendarEvents', userId),
        clearOwnedRecords('courses', userId),
      ]),
    )
  })

  it('deduplicates calendar imports, syncs task completion, and isolates owners', async () => {
    const [ownerId, otherUserId] = testUserIds
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const event = {
      allDay: false,
      completed: false,
      end: new Date(Date.parse(start) + 60 * 60 * 1000).toISOString(),
      kind: 'deadline' as const,
      start,
      title: 'Systems exam',
      uid: `exam-${crypto.randomUUID()}`,
    }

    const firstImport = await importUserCalendar(ownerId, [event, event], 'ics-file')
    expect(firstImport).toMatchObject({ created: 1, duplicates: 1, tasksCreated: 1 })

    const repeatedImport = await importUserCalendar(ownerId, [event], 'ics-file')
    expect(repeatedImport).toMatchObject({ created: 0, duplicates: 1, tasksCreated: 0 })

    const tasks = await listUserTasks(ownerId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].calendarEventId).toBeTruthy()

    await expect(
      setUserEventCompleted(otherUserId, tasks[0].calendarEventId!, true),
    ).rejects.toThrow('Event not found.')
    await setUserEventCompleted(ownerId, tasks[0].calendarEventId!, true)

    expect((await listUserTasks(ownerId))[0].status).toBe('done')
    expect((await listUserEvents(ownerId, new Date(0).toISOString()))[0].completed).toBe(
      true,
    )
    expect(await listUserTasks(otherUserId)).toHaveLength(0)
  })

  it('creates, updates, and safely removes user-owned courses', async () => {
    const [ownerId, otherUserId] = testUserIds
    const input = {
      code: 'ITSC 3155',
      color: 'blue' as const,
      level: '3000' as const,
      name: 'Software Engineering',
    }

    const course = await createUserCourse(ownerId, input)
    expect(await listUserCourses(ownerId)).toEqual([course])
    expect(await listUserCourses(otherUserId)).toHaveLength(0)
    await expect(createUserCourse(ownerId, input)).rejects.toThrow(
      'already have a course',
    )

    const updated = await updateUserCourse(ownerId, course.id, {
      color: 'green',
      level: '4000',
      name: 'Advanced Software Engineering',
    })
    expect(updated).toMatchObject({
      code: 'ITSC 3155',
      color: 'green',
      level: '4000',
      name: 'Advanced Software Engineering',
    })

    await createUserTask(ownerId, {
      assignmentType: 'project',
      classLevel: '4000',
      courseId: course.id,
      estimatedMinutes: 90,
      title: 'Course project',
    })
    await expect(deleteUserCourse(ownerId, course.id)).rejects.toThrow(
      'linked tasks and events',
    )

    await clearOwnedRecords('tasks', ownerId)
    await deleteUserCourse(ownerId, course.id)
    expect(await listUserCourses(ownerId)).toHaveLength(0)
  })
})
