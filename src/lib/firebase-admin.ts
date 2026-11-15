import "server-only"

import { cert, getApps, initializeApp, type App } from "firebase-admin/app"

import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

const appName = "signal-team-workspace"

export class FirestoreConfigurationError extends Error {
  constructor() {
    super(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    )

    this.name = "FirestoreConfigurationError"
  }
}

export function getFirebaseAdminApp(): App {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  const localEmulator =
    process.env.NODE_ENV === 'development' && !clientEmail && !privateKey
  const emulator = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      localEmulator,
  )
  if (emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
  }
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || (emulator ? 'demo-signal' : '')
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim()

  if (!projectId || (!emulator && (!clientEmail || !privateKey)))
    throw new FirestoreConfigurationError()

  const existing = getApps().find((app) => app.name === appName)

  return (
    existing ??
    initializeApp(
      {
        ...(emulator ? {} : { credential: cert({ projectId, clientEmail, privateKey }) }),

        projectId,
        storageBucket,
      },

      appName,
    )
  )
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp())
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseAdminApp())
}

export function getTeamFirestore() {
  return getFirestore(getFirebaseAdminApp())
}
