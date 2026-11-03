import type { CollectionBeforeChangeHook, CollectionConfig, FieldAccess } from 'payload'
import { calculateScore, type ScoreInput } from '@/lib/scoring'
import { canAccessOwned, canCreateOwned, cmsFieldOnly } from '@/lib/app-access'

const serverOwned: FieldAccess = ({ req }) => req.user?.collection === 'admins'

const calculateTaskScore: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const task = { ...originalDoc, ...data } as ScoreInput
  return { ...data, ...calculateScore(task) }
}

const assignOwner: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  if (operation === 'create' && req.user?.collection === 'users') {
    return { ...data, owner: req.user.id }
  }
  return { ...data, owner: originalDoc?.owner ?? data.owner }
}

const scoreField = (name: string, label: string) =>
  ({
    name,
    type: 'number',
    label,
    admin: { readOnly: true },
    access: { create: serverOwned, update: serverOwned },
  }) as const

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  access: {
    create: canCreateOwned,
    delete: canAccessOwned,
    read: canAccessOwned,
    update: canAccessOwned,
  },
  admin: {
    defaultColumns: ['title', 'score', 'dueDate', 'status'],
    group: 'Signal',
    useAsTitle: 'title',
  },
  hooks: {
    beforeChange: [assignOwner, calculateTaskScore],
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
    { name: 'title', type: 'text', required: true, maxLength: 160 },
    { name: 'course', type: 'relationship', relationTo: 'courses' },
    {
      name: 'calendarEvent',
      type: 'relationship',
      relationTo: 'calendar-events',
      admin: {
        description: 'Imported assignment that created this task.',
        position: 'sidebar',
      },
    },
    {
      name: 'classLevel',
      type: 'select',
      required: true,
      options: ['1000', '2000', '3000', '4000', 'graduate', 'independent'],
    },
    {
      name: 'assignmentType',
      type: 'select',
      required: true,
      options: ['exam', 'project', 'lab', 'problem-set', 'reading', 'career', 'personal'],
    },
    { name: 'dueDate', type: 'date' },
    { name: 'plannedStart', type: 'date' },
    { name: 'estimatedMinutes', type: 'number', required: true, min: 15, max: 1440 },
    { name: 'careerAlignment', type: 'number', min: 0, max: 100, defaultValue: 35 },
    { name: 'goalAlignment', type: 'number', min: 0, max: 100, defaultValue: 50 },
    { name: 'consequence', type: 'number', min: 0, max: 100, defaultValue: 55 },
    { name: 'lastWorkedAt', type: 'date' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'open',
      options: ['open', 'scheduled', 'done'],
    },
    scoreField('score', 'Priority score'),
    scoreField('urgency', 'Urgency'),
    scoreField('academicValue', 'Academic value'),
    scoreField('careerValue', 'Career value'),
    scoreField('workload', 'Workload'),
    scoreField('neglectFactor', 'Neglect factor'),
  ],
}
