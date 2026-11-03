import type { Access, CollectionConfig, FieldAccess } from 'payload'
import { isCMSAdmin } from '@/lib/app-access'

const ownProfile: Access = ({ req }) => {
  const user = req.user
  if (isCMSAdmin(user)) return true
  if (!user || user.collection !== 'users') return false
  return { id: { equals: user.id } }
}

const adminField: FieldAccess = ({ req }) => isCMSAdmin(req.user)

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    loginWithUsername: {
      allowEmailLogin: true,
      requireEmail: true,
      requireUsername: true,
    },
    maxLoginAttempts: 8,
    tokenExpiration: 60 * 60 * 12,
    useSessions: false,
  },
  access: {
    create: () => true,
    delete: ({ req }) => isCMSAdmin(req.user),
    read: ownProfile,
    update: ownProfile,
  },
  admin: {
    hidden: true,
    useAsTitle: 'username',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 100,
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'student',
      required: true,
      options: [
        { label: 'Student', value: 'student' },
        { label: 'Test', value: 'test' },
        { label: 'Admin', value: 'admin' },
      ],
      access: {
        create: adminField,
        update: adminField,
      },
    },
  ],
}
