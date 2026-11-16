import { afterEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
} from 'firebase/auth'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdmin } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'

const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
const projectId = process.env.GCLOUD_PROJECT || 'demo-signal'
const emulatorAvailable = Boolean(emulatorHost)
let clientApp: ReturnType<typeof initializeApp> | undefined
let adminApp: ReturnType<typeof initializeAdmin> | undefined
let createdUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | undefined

afterEach(async () => {
  if (createdUser) await deleteUser(createdUser).catch(() => undefined)
  if (clientApp) await deleteApp(clientApp)
  if (adminApp) await deleteAdminApp(adminApp)
  clientApp = undefined
  adminApp = undefined
  createdUser = undefined
})

describe.skipIf(!emulatorAvailable)('Firebase Auth session migration', () => {
  it('creates an account and verifies the ID token and server session cookie', async () => {
    clientApp = initializeApp(
      {
        apiKey: 'emulator-api-key',
        authDomain: `${projectId}.firebaseapp.com`,
        appId: 'emulator-app-id',
        projectId,
      },
      `auth-client-${Date.now()}`,
    )
    const clientAuth = getAuth(clientApp)
    const host = emulatorHost?.startsWith('http') ? emulatorHost : `http://${emulatorHost}`
    connectAuthEmulator(clientAuth, host, { disableWarnings: true })

    const credential = await createUserWithEmailAndPassword(
      clientAuth,
      `auth-${Date.now()}@example.test`,
      'emulator-test-password',
    )
    createdUser = credential.user

    adminApp = initializeAdmin({ projectId }, `auth-admin-${Date.now()}`)
    const adminAuth = getAdminAuth(adminApp)
    const idToken = await credential.user.getIdToken()
    const decodedToken = await adminAuth.verifyIdToken(idToken, true)
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: 60 * 60 * 1000,
    })
    const decodedSession = await adminAuth.verifySessionCookie(sessionCookie, true)

    expect(decodedToken.uid).toBe(credential.user.uid)
    expect(decodedSession.uid).toBe(credential.user.uid)
  })
})