import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { calculateScore } from '../src/lib/scoring'
import type {
  FirestoreCourseDocument,
  FirestoreTaskDocument,
} from '../src/lib/firestore-models'

const projectId = process.env.FIREBASE_PROJECT_ID
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST
const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST
const seedEmail = process.env.FIREBASE_SEED_USER_EMAIL?.trim().toLowerCase()

if (
  projectId !== 'demo-signal' ||
  firestoreEmulator !== '127.0.0.1:8080' ||
  authEmulator !== '127.0.0.1:9099'
) {
  throw new Error('Seeding is restricted to the demo-signal local Auth and Firestore emulators.')
}

if (!seedEmail) {
  throw new Error('Set FIREBASE_SEED_USER_EMAIL to an account already created in the Auth emulator.')
}

const app = initializeApp({ projectId })
const auth = getAuth(app)
const db = getFirestore(app)
const authUser = await auth.getUserByEmail(seedEmail)
const authProfile = await db.collection('authUserProfiles').doc(authUser.uid).get()
const profileId = authProfile.data()?.profileId

if (typeof profileId !== 'string') {
  throw new Error('The emulator account has no Firestore profile. Sign up through the app first.')
}

const profile = await db.collection('users').doc(profileId).get()
if (!profile.exists || profile.data()?.authUid !== authUser.uid) {
  throw new Error('The emulator account profile does not match its Auth identity.')
}

const now = new Date()
const timestamp = now.toISOString()
const dueDate = new Date(now)
dueDate.setDate(dueDate.getDate() + 7)
dueDate.setHours(17, 0, 0, 0)

const courseId = `seed_course_${authUser.uid}`
const course: FirestoreCourseDocument = {
  code: 'DEMO 101',
  color: 'blue',
  createdAt: timestamp,
  level: '1000',
  name: 'Development Foundations',
  ownerId: profileId,
  updatedAt: timestamp,
}

const taskId = `seed_task_${authUser.uid}`
const task: FirestoreTaskDocument = {
  ...calculateScore({
    assignmentType: 'reading',
    classLevel: '1000',
    dueDate: dueDate.toISOString(),
    estimatedMinutes: 60,
    goalAlignment: 60,
  }),
  assignmentType: 'reading',
  careerAlignment: 35,
  classLevel: '1000',
  courseId,
  consequence: 55,
  createdAt: timestamp,
  dueDate: dueDate.toISOString(),
  estimatedMinutes: 60,
  goalAlignment: 60,
  ownerId: profileId,
  status: 'open',
  title: 'Seeded reading assignment',
  updatedAt: timestamp,
}

const batch = db.batch()
batch.set(db.collection('courses').doc(courseId), course)
batch.set(db.collection('tasks').doc(taskId), task)
await batch.commit()
console.log('Seeded one course and one task for the configured emulator account.')
await deleteApp(app)
