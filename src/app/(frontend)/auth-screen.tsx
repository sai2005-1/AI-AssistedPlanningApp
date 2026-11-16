'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  FirebaseClientConfigurationError,
  getFirebaseClientAuth,
} from '@/lib/firebase-client'
import { loginAction, signupAction } from './auth-actions'

function authErrorMessage(error: unknown) {
  if (error instanceof FirebaseClientConfigurationError) return error.message
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  if (code === 'auth/email-already-in-use') return 'That email is already in use.'
  if (code === 'auth/invalid-email') return 'Enter a valid email address.'
  if (code === 'auth/invalid-credential') return 'Invalid email or password.'
  if (code === 'auth/weak-password') return 'Use a stronger password.'
  if (code === 'auth/operation-not-allowed') {
    return 'Email and password sign-in is not enabled for this Firebase project.'
  }
  return 'Authentication is unavailable. Check the Firebase setup and try again.'
}

export default function AuthScreen() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const password = String(form.get('password') ?? '')
    setError('')
    startTransition(async () => {
      let auth: ReturnType<typeof getFirebaseClientAuth> | undefined
      try {
        auth = getFirebaseClientAuth()
        if (mode === 'login') {
          const credential = await signInWithEmailAndPassword(auth, email, password)
          const result = await loginAction({ idToken: await credential.user.getIdToken() })
          if (!result.ok) {
            await signOut(auth)
            setError(result.error)
            return
          }
        } else {
          const credential = await createUserWithEmailAndPassword(auth, email, password)
          let result
          try {
            result = await signupAction({
              idToken: await credential.user.getIdToken(),
              name: String(form.get('name') ?? ''),
              username: String(form.get('username') ?? ''),
            })
          } catch (signupError) {
            await deleteUser(credential.user).catch(() => undefined)
            await signOut(auth)
            throw signupError
          }
          if (!result.ok) {
            await deleteUser(credential.user).catch(() => undefined)
            await signOut(auth)
            setError(result.error)
            return
          }
        }
        await signOut(auth)
        router.refresh()
      } catch (authError) {
        if (auth) await signOut(auth).catch(() => undefined)
        setError(authErrorMessage(authError))
      }
    })
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span>S</span>
          <div>
            <strong>SIGNAL</strong>
            <small>PRIVATE DECISION SYSTEM</small>
          </div>
        </div>
        <div className="auth-heading">
          <small>{mode === 'login' ? 'SECURE SESSION' : 'NEW WORKSPACE'}</small>
          <h1>{mode === 'login' ? 'Welcome back' : 'Plan in private'}</h1>
          <p>
            {mode === 'login'
              ? 'Sign in to open your tasks, imports, and planning context.'
              : 'Your tasks and calendar imports are isolated from every other account.'}
          </p>
        </div>
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Log in
          </button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>
                <span>NAME</span>
                <input autoComplete="name" name="name" required />
              </label>
            </>
          )}
          <label>
            <span>EMAIL</span>
            <input
              autoCapitalize="none"
              autoComplete="email"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </label>
          {mode === 'signup' && (
            <label>
              <span>USERNAME</span>
              <input
                autoCapitalize="none"
                autoComplete="username"
                maxLength={32}
                minLength={3}
                name="username"
                required
                title="Use 3–32 letters, numbers, underscores, or dashes."
              />
            </label>
          )}
          <label>
            <span>PASSWORD</span>
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" disabled={pending} type="submit">
            {pending ? 'VERIFYING…' : mode === 'login' ? 'OPEN WORKSPACE' : 'CREATE PRIVATE WORKSPACE'}
          </button>
        </form>
        <p className="auth-privacy">HTTP-only session · isolated Firestore records · no cross-account access</p>
      </section>
    </main>
  )
}
