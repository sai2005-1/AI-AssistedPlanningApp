'use client'

import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

let authEmulatorConnected = false

export class FirebaseClientConfigurationError extends Error {
  constructor(missing: string[]) {
    super(`Firebase Authentication is not configured. Missing: ${missing.join(', ')}.`)
    this.name = 'FirebaseClientConfigurationError'
  }
}

export function getFirebaseClientAuth() {
  const localDevelopment = process.env.NODE_ENV === 'development'
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    (localDevelopment ? 'demo-signal' : '')
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
    (localDevelopment ? 'emulator-api-key' : '')
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ||
    (localDevelopment ? `${projectId}.firebaseapp.com` : '')
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ||
    (localDevelopment ? 'emulator-app-id' : '')
  const missing = [
    ['NEXT_PUBLIC_FIREBASE_API_KEY', apiKey],
    ['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', authDomain],
    ['NEXT_PUBLIC_FIREBASE_APP_ID', appId],
    ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', projectId],
  ].filter(([, value]) => !value).map(([name]) => name)

  if (missing.length) throw new FirebaseClientConfigurationError(missing)

  const app =
    getApps().find((candidate) => candidate.name === 'signal-app') ??
    initializeApp(
      { apiKey, authDomain, appId, projectId },
      'signal-app',
    )

  const auth = getAuth(app)
  const emulatorHost =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST?.trim() ||
    (localDevelopment ? '127.0.0.1:9099' : '')
  if (emulatorHost && !authEmulatorConnected) {
    connectAuthEmulator(
      auth,
      emulatorHost.startsWith('http') ? emulatorHost : `http://${emulatorHost}`,
      { disableWarnings: true },
    )
    authEmulatorConnected = true
  }
  return auth
}