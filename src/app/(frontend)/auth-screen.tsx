'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { loginAction, signupAction } from './auth-actions'

export default function AuthScreen() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    startTransition(async () => {
      const result =
        mode === 'login'
          ? await loginAction({
              password: String(form.get('password') ?? ''),
              username: String(form.get('username') ?? ''),
            })
          : await signupAction({
              email: String(form.get('email') ?? ''),
              name: String(form.get('name') ?? ''),
              password: String(form.get('password') ?? ''),
              username: String(form.get('username') ?? ''),
            })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
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
              <label>
                <span>EMAIL</span>
                <input autoComplete="email" name="email" required type="email" />
              </label>
            </>
          )}
          <label>
            <span>USERNAME</span>
            <input autoCapitalize="none" autoComplete="username" name="username" required />
          </label>
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
        <p className="auth-privacy">HTTP-only session · isolated Payload records · no cross-account access</p>
      </section>
    </main>
  )
}
