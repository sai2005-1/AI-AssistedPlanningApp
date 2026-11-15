import "server-only"

import { cert, getApps, initializeApp } from "firebase-admin/app"

import { getFirestore } from "firebase-admin/firestore"

const appName = "signal-team-workspace"

export class FirestoreConfigurationError extends Error {
  constructor() {
    super(
      "Firestore is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    )

    this.name = "FirestoreConfigurationError"
  }
}

export function getTeamFirestore() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

  if (!projectId || !clientEmail || !privateKey)
    throw new FirestoreConfigurationError()

  const existing = getApps().find((app) => app.name === appName)

  const app =
    existing ??
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),

        projectId,
      },

      appName,
    )

  return getFirestore(app)
}
