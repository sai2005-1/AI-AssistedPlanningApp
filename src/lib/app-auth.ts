import 'server-only'

import { cookies } from 'next/headers'
import { getPayload, JWTAuthentication, type User as PayloadUser } from 'payload'
import config from '@payload-config'

const APP_SESSION_COOKIE = 'app-session'

export type AppUser = {
  collection: 'users'
  email: string
  id: string
  name: string
  role: 'admin' | 'student' | 'test'
  username?: null | string
}

export function asPayloadUser(user: AppUser) {
  return user as unknown as PayloadUser
}

export function createAppAuth(collection: 'users') {
  async function currentUser(): Promise<AppUser | null> {
    const token = (await cookies()).get(APP_SESSION_COOKIE)?.value
    if (!token) return null
    const payload = await getPayload({ config })
    const authHeaders = new Headers({ Authorization: `JWT ${token}` })
    const { user } = await JWTAuthentication({
      headers: authHeaders,
      payload,
      strategyName: 'signal-app-jwt',
    })
    if (!user || user.collection !== collection) return null
    return user as AppUser
  }

  async function setSession(token: string, exp?: number) {
    const cookieStore = await cookies()
    cookieStore.set(APP_SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: exp ? Math.max(60, exp - Math.floor(Date.now() / 1000)) : 60 * 60 * 12,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  async function login(username: string, password: string) {
    const payload = await getPayload({ config })
    const result = await payload.login({
      collection,
      data: { password, username },
      overrideAccess: false,
    })
    if (!result.token || !result.user) throw new Error('Invalid username or password.')
    await setSession(result.token, result.exp)
    return result.user as AppUser
  }

  async function signup(data: {
    email: string
    name: string
    password: string
    username: string
  }) {
    const payload = await getPayload({ config })
    await payload.create({
      collection,
      data: {
        email: data.email,
        name: data.name,
        password: data.password,
        role: 'student',
        username: data.username,
      },
      draft: false,
      overrideAccess: false,
    })
    return login(data.username, data.password)
  }

  async function logout() {
    const user = await currentUser()
    if (user?.role === 'test') {
      const payload = await getPayload({ config })
      const ownedByTestUser = { owner: { equals: user.id } }
      await payload.delete({
        collection: 'tasks',
        overrideAccess: true,
        where: ownedByTestUser,
      })
      await payload.delete({
        collection: 'calendar-events',
        overrideAccess: true,
        where: ownedByTestUser,
      })
    }
    const cookieStore = await cookies()
    cookieStore.delete(APP_SESSION_COOKIE)
  }

  return { currentUser, login, logout, signup }
}

export const appAuth = createAppAuth('users')

export async function requireAppUser() {
  return appAuth.currentUser()
}
