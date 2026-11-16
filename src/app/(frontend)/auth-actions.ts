'use server'

import { appAuth } from '@/lib/app-auth'

type AuthResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

const usernamePattern = /^[a-zA-Z0-9_-]{3,32}$/

export async function loginAction(input: {
  idToken: string
}): Promise<AuthResult> {
  const idToken = typeof input?.idToken === 'string' ? input.idToken : ''
  if (!idToken || idToken.length > 8192) return { ok: false, error: 'Sign in again.' }
  try {
    await appAuth.login(idToken)
    return { ok: true, message: 'Welcome back.' }
  } catch {
    return { ok: false, error: 'Invalid username or password.' }
  }
}

export async function signupAction(input: {
  idToken: string
  name: string
  username: string
}): Promise<AuthResult> {
  const idToken = typeof input?.idToken === 'string' ? input.idToken : ''
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 100) : ''
  const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase() : ''
  if (!idToken || idToken.length > 8192) return { ok: false, error: 'Sign up again.' }
  if (!name) return { ok: false, error: 'Enter your name.' }
  if (!usernamePattern.test(username)) {
    return { ok: false, error: 'Use 3–32 letters, numbers, underscores, or dashes.' }
  }
  try {
    await appAuth.signup(idToken, { name, username })
    return { ok: true, message: 'Your private workspace is ready.' }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Account setup failed. Try again.',
    }
  }
}

export async function logoutAction(): Promise<AuthResult> {
  await appAuth.logout()
  return { ok: true, message: 'Signed out.' }
}
