import type { CollectionBeforeChangeHook, CollectionConfig, FieldAccess } from 'payload'
import { canAccessOwned, canCreateOwned, cmsFieldOnly } from '@/lib/app-access'

const serverOwned: FieldAccess = ({ req }) => req.user?.collection === 'admins'

const setSourceKey: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const uid = data.uid ?? originalDoc?.uid
  const start = data.start ?? originalDoc?.start
  return uid && start ? { ...data, sourceKey: `${uid}:${start}` } : data
}

const assignOwner: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  if (operation === 'create' && req.user?.collection === 'users') {
    return { ...data, owner: req.user.id }
  }
  return { ...data, owner: originalDoc?.owner ?? data.owner }
}

export const CalendarEvents: CollectionConfig = {
  slug: 'calendar-events',
  access: {
    create: canCreateOwned,
    delete: canAccessOwned,
    read: canAccessOwned,
    update: canAccessOwned,
  },
  admin: {
    defaultColumns: ['title', 'start', 'end', 'kind'],
    group: 'Signal',
    useAsTitle: 'title',
  },
  hooks: {
    beforeChange: [assignOwner, setSourceKey],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { position: 'sidebar', readOnly: true },
      access: { create: cmsFieldOnly, update: cmsFieldOnly },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 200,
      access: { update: serverOwned },
    },
    { name: 'start', type: 'date', required: true, access: { update: serverOwned } },
    { name: 'end', type: 'date', required: true, access: { update: serverOwned } },
    {
      name: 'allDay',
      type: 'checkbox',
      defaultValue: false,
      access: { update: serverOwned },
    },
    {
      name: 'completed',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'class',
      options: ['class', 'lab', 'office', 'deadline', 'study', 'other'],
      access: { update: serverOwned },
    },
    {
      name: 'location',
      type: 'text',
      maxLength: 200,
      access: { update: serverOwned },
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: 2000,
      access: { update: serverOwned },
    },
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      access: { update: serverOwned },
    },
    { name: 'uid', type: 'text', required: true, access: { update: serverOwned } },
    {
      name: 'source',
      type: 'select',
      required: true,
      options: ['ics-file', 'ics-url', 'manual'],
      access: { update: serverOwned },
    },
    {
      name: 'sourceKey',
      type: 'text',
      index: true,
      admin: { readOnly: true },
      access: { create: serverOwned, update: serverOwned },
    },
  ],
}
