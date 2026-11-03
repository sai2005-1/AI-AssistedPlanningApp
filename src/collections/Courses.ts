import type { Access, CollectionConfig } from 'payload'

const isAdmin: Access = ({ req }) => req.user?.collection === 'admins'

export const Courses: CollectionConfig = {
  slug: 'courses',
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: () => true,
    update: isAdmin,
  },
  admin: {
    group: 'Signal',
    useAsTitle: 'code',
  },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'level',
      type: 'select',
      required: true,
      options: [
        { label: '1000 level', value: '1000' },
        { label: '2000 level', value: '2000' },
        { label: '3000 level', value: '3000' },
        { label: '4000 level', value: '4000' },
        { label: 'Graduate', value: 'graduate' },
        { label: 'Independent study', value: 'independent' },
      ],
    },
    {
      name: 'color',
      type: 'select',
      defaultValue: 'blue',
      options: ['blue', 'green', 'gray'],
    },
  ],
}
