import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getTeamFirestore } from './firebase-admin'
import {
  importUserCalendar,
  listUserEvents,
  listUserTasks,
  setUserEventCompleted,
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

    await expect(setUserEventCompleted(otherUserId, tasks[0].calendarEventId!, true)).rejects.toThrow(
      'Event not found.',
    )
    await setUserEventCompleted(ownerId, tasks[0].calendarEventId!, true)

    expect((await listUserTasks(ownerId))[0].status).toBe('done')
    expect((await listUserEvents(ownerId, new Date(0).toISOString()))[0].completed).toBe(true)
    expect(await listUserTasks(otherUserId)).toHaveLength(0)
  })
})