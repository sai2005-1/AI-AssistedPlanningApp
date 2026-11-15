import 'server-only'

import { cookies } from 'next/headers'
import { getFirebaseAdminAuth, getTeamFirestore } from '@/lib/firebase-admin'

const APP_SESSION_COOKIE = 'app-session'
const SESSION_MAX_AGE = 12 * 60 * 60 * 1000
const USER_COLLECTION = 'users'
const USERNAME_COLLECTION = 'usernames'
const AUTH_PROFILE_COLLECTION = 'authUserProfiles'

export type AppUser = {
  collection: 'users'
  email: string
  id: string
  name: string
  role: 'admin' | 'student' | 'test'
  username: string
}

function usernameKey(username: string) {
  return username.trim().toLocaleLowerCase('en-US')
}

function profileFromData(id: string, data: FirebaseFirestore.DocumentData): AppUser | null {
  if (
    typeof data.email !== 'string' ||
    typeof data.name !== 'string' ||
    typeof data.username !== 'string' ||
    (data.role !== 'admin' && data.role !== 'student' && data.role !== 'test')
  ) {
    return null
  }

  return {
    collection: 'users',
    email: data.email,
    id,
    name: data.name,
    role: data.role,
    username: data.username,
  }
}

async function profileForAuthUid(authUid: string): Promise<AppUser | null> {
  const db = getTeamFirestore()
  const authProfile = await db.collection(AUTH_PROFILE_COLLECTION).doc(authUid).get()
  const profileId = authProfile.data()?.profileId
  const userId = typeof profileId === 'string' ? profileId : authUid
  const profile = await db.collection(USER_COLLECTION).doc(userId).get()
  if (!profile.exists) return null

  const data = profile.data() ?? {}
  if (data.authUid && data.authUid !== authUid) return null
  return profileFromData(profile.id, data)
}

async function setSession(idToken: string) {
  const auth = getFirebaseAdminAuth()
  const decoded = await auth.verifyIdToken(idToken, true)
  const user = await profileForAuthUid(decoded.uid)
  if (!user) throw new Error('Your account profile is not ready. Contact support.')

  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE,
  })
  const cookieStore = await cookies()
  cookieStore.set(APP_SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE / 1000,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return user
}

async function currentUser(): Promise<AppUser | null> {
  const sessionCookie = (await cookies()).get(APP_SESSION_COOKIE)?.value
  if (!sessionCookie) return null

  try {
    const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true)
    return profileForAuthUid(decoded.uid)
  } catch {
    return null
  }
}

async function signup(
  idToken: string,
  input: { name: string; username: string },
) {
  const auth = getFirebaseAdminAuth()
  const decoded = await auth.verifyIdToken(idToken, true)
  const email = decoded.email?.trim().toLowerCase()
  if (!email) throw new Error('Add an email address to your Firebase account.')

  const db = getTeamFirestore()
  const userRef = db.collection(USER_COLLECTION).doc(decoded.uid)
  const usernameRef = db.collection(USERNAME_COLLECTION).doc(usernameKey(input.username))
  const authProfileRef = db.collection(AUTH_PROFILE_COLLECTION).doc(decoded.uid)
  await db.runTransaction(async (transaction) => {
    const [existingUsername, existingUser] = await Promise.all([
      transaction.get(usernameRef),
      transaction.get(userRef),
    ])
    const existingProfileId = existingUsername.data()?.profileId
    if (existingUsername.exists && existingProfileId !== decoded.uid) {
      throw new Error('That username is already in use.')
    }
    if (existingUser.exists && existingUser.data()?.authUid !== decoded.uid) {
      throw new Error('That account profile already exists.')
    }

    const now = new Date().toISOString()
    transaction.set(
      userRef,
      {
        authUid: decoded.uid,
        email,
        name: input.name,
        role: 'student',
        updatedAt: now,
        username: input.username,
        ...(existingUser.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    )
    transaction.set(usernameRef, { profileId: decoded.uid })
    transaction.set(authProfileRef, { profileId: decoded.uid })
  })

  const user = await setSession(idToken)
  return user
}

async function login(idToken: string) {
  return setSession(idToken)
}

async function logout() {
  const user = await currentUser()
  const cookieStore = await cookies()
  cookieStore.delete(APP_SESSION_COOKIE)
  if (user?.role === 'test') {
    try {
      const db = getTeamFirestore()
      for (const collection of ['tasks', 'calendarEvents']) {
        const records = await db.collection(collection).where('ownerId', '==', user.id).get()
        for (let index = 0; index < records.docs.length; index += 400) {
          const batch = db.batch()
          for (const record of records.docs.slice(index, index + 400)) batch.delete(record.ref)
          await batch.commit()
        }
      }
    } catch {
      // Test data cleanup must not prevent the session from ending.
    }
  }
}

export const appAuth = { currentUser, login, logout, signup }

export async function requireAppUser() {
  return appAuth.currentUser()
}
