'use server'

import { appAuth } from '@/lib/app-auth'

type AuthResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

const usernamePattern = /^[a-zA-Z0-9_-]{3,32}$/

export async function loginAction(input: {
  password: string
  username: string
}): Promise<AuthResult> {
  const username = String(input.username ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  const isTestLogin = username === 'test' && password === 'testdemo'
  if (
    !usernamePattern.test(username) ||
    (!isTestLogin && password.length < 8) ||
    password.length > 128
  ) {
    return { ok: false, error: 'Check your username and password.' }
  }
  try {
    await appAuth.login(username, password)
    return { ok: true, message: 'Welcome back.' }
  } catch {
    return { ok: false, error: 'Invalid username or password.' }
  }
}

export async function signupAction(input: {
  email: string
  name: string
  password: string
  username: string
}): Promise<AuthResult> {
  const email = String(input.email ?? '').trim().toLowerCase()
  const name = String(input.name ?? '').trim().slice(0, 100)
  const username = String(input.username ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  if (!name) return { ok: false, error: 'Enter your name.' }
  if (!usernamePattern.test(username)) {
    return { ok: false, error: 'Use 3–32 letters, numbers, underscores, or dashes.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  if (password.length < 8 || password.length > 128) {
    return { ok: false, error: 'Use a password between 8 and 128 characters.' }
  }
  try {
    await appAuth.signup({ email, name, password, username })
    return { ok: true, message: 'Your private workspace is ready.' }
  } catch {
    return { ok: false, error: 'That username or email is already in use.' }
  }
}

export async function logoutAction(): Promise<AuthResult> {
  await appAuth.logout()
  return { ok: true, message: 'Signed out.' }
}
