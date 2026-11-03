import type { Access, FieldAccess, Where } from 'payload'

export const isCMSAdmin = (user: { collection?: string } | null | undefined) =>
  user?.collection === 'admins'

export const isAppUser = (user: { collection?: string } | null | undefined) =>
  user?.collection === 'users'

export const canCreateOwned: Access = ({ req }) =>
  isCMSAdmin(req.user) || isAppUser(req.user)

export const canAccessOwned: Access = ({ req }) => {
  const user = req.user
  if (isCMSAdmin(user)) return true
  if (!user || user.collection !== 'users') return false
  if ('role' in user && user.role === 'admin') {
    const where: Where = {
      or: [{ owner: { equals: user.id } }, { owner: { exists: false } }],
    }
    return where
  }
  return { owner: { equals: user.id } }
}

export const cmsFieldOnly: FieldAccess = ({ req }) => isCMSAdmin(req.user)
