import 'server-only'

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore'

import type { AppUser } from './app-auth'

import { getTeamFirestore } from './firebase-admin'

import { isDeadlineWithinReviewFreeze } from './team-deliverable-rules'

import type {
  DeliverableInput,
  DeliverableStatus,
  DirectoryEntry,
  TeamDeliverable,
  TeamMember,
  TeamProjectBoard,
  TeamProjectSummary,
  ProjectInput,
} from './team-types'

export class TeamDataError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'TeamDataError'
  }
}

const directoryCollection = 'teamUserDirectory'

const projectCollection = 'teamProjects'

function documentId(id: string) {
  return encodeURIComponent(id)
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('en-US')
}

function requiredString(data: DocumentData, key: string) {
  const value = data[key]

  if (typeof value !== 'string') throw new TeamDataError(`Stored ${key} is invalid.`)

  return value
}

function optionalString(data: DocumentData, key: string) {
  const value = data[key]

  if (value === undefined || value === null || value === '') return undefined

  if (typeof value !== 'string') throw new TeamDataError(`Stored ${key} is invalid.`)

  return value
}

function requiredIsoDate(data: DocumentData, key: string) {
  const value = data[key]

  if (!(value instanceof Timestamp)) throw new TeamDataError(`Stored ${key} is invalid.`)

  return value.toDate().toISOString()
}

function projectReference(db: Firestore, projectId: string) {
  return db.collection(projectCollection).doc(projectId)
}

function memberReference(projectRef: DocumentReference, userId: string) {
  return projectRef.collection('members').doc(documentId(userId))
}

function directoryReference(db: Firestore, userId: string) {
  return db.collection(directoryCollection).doc(documentId(userId))
}

function projectFromData(id: string, data: DocumentData): TeamProjectSummary {
  return {
    id,

    title: requiredString(data, 'title'),

    description: requiredString(data, 'description'),

    finalDeadline: requiredIsoDate(data, 'finalDeadline'),

    ownerId: requiredString(data, 'ownerId'),
  }
}

function directoryFromData(id: string, data: DocumentData): DirectoryEntry {
  return {
    id: requiredString(data, 'userId') || id,

    name: requiredString(data, 'name'),

    username: requiredString(data, 'username'),
  }
}

function directoryProfile(user: AppUser) {
  return {
    userId: user.id,

    name: user.name,

    username: user.username ?? '',

    nameNormalized: normalized(user.name),

    usernameNormalized: normalized(user.username ?? ''),

    updatedAt: Timestamp.now(),
  }
}

function memberFromData(id: string, data: DocumentData): TeamMember {
  const role = requiredString(data, 'role')

  if (role !== 'owner' && role !== 'member')
    throw new TeamDataError('Stored member role is invalid.')

  return {
    id: requiredString(data, 'userId') || id,

    name: requiredString(data, 'name'),

    username: requiredString(data, 'username'),

    role,
  }
}

function deliverableFromData(id: string, data: DocumentData): TeamDeliverable {
  const status = requiredString(data, 'status')

  if (status !== 'open' && status !== 'in-progress' && status !== 'done') {
    throw new TeamDataError('Stored deliverable status is invalid.')
  }

  return {
    id,

    title: requiredString(data, 'title'),

    description: requiredString(data, 'description'),

    dueAt: requiredIsoDate(data, 'dueAt'),

    status,

    assigneeId: requiredString(data, 'assigneeId'),

    assigneeName: requiredString(data, 'assigneeName'),

    assigneeUsername: requiredString(data, 'assigneeUsername'),

    parentDeliverableId: optionalString(data, 'parentDeliverableId'),
  }
}

function assertDeadline(dueAt: string, finalDeadline: string) {
  if (!isDeadlineWithinReviewFreeze(dueAt, finalDeadline)) {
    throw new TeamDataError(
      'Set the milestone deadline at least 72 hours before final submission.',
    )
  }
}

async function assertParentChain(
  transaction: Transaction,

  projectRef: DocumentReference,

  parentId: string | undefined,

  currentDeliverableId?: string,
) {
  const visited = new Set<string>()

  let nextId = parentId

  let depth = 0

  while (nextId) {
    if (nextId === currentDeliverableId || visited.has(nextId)) {
      throw new TeamDataError('A deliverable cannot be its own ancestor.')
    }

    if (++depth > 50) throw new TeamDataError('Deliverable nesting is too deep.')

    visited.add(nextId)

    const snapshot = await transaction.get(
      projectRef.collection('deliverables').doc(nextId),
    )

    if (!snapshot.exists)
      throw new TeamDataError('Choose a parent deliverable in this project.')

    nextId = optionalString(snapshot.data() ?? {}, 'parentDeliverableId')
  }
}

export async function searchDirectory(
  user: AppUser,
  searchText: string,
): Promise<DirectoryEntry[]> {
  const query = normalized(searchText)

  if (query.length < 2) return []

  const db = getTeamFirestore()

  await directoryReference(db, user.id).set(
    {
      userId: user.id,

      name: user.name,

      username: user.username ?? '',

      nameNormalized: normalized(user.name),

      usernameNormalized: normalized(user.username ?? ''),

      updatedAt: FieldValue.serverTimestamp(),
    },

    { merge: true },
  )

  const directory = db.collection(directoryCollection)

  const [byName, byUsername] = await Promise.all([
    directory

      .orderBy('nameNormalized')

      .startAt(query)

      .endAt(`${query}\uf8ff`)

      .limit(10)

      .get(),

    directory

      .orderBy('usernameNormalized')

      .startAt(query)

      .endAt(`${query}\uf8ff`)

      .limit(10)

      .get(),
  ])

  const matches = new Map<string, DirectoryEntry>()

  for (const snapshot of [...byName.docs, ...byUsername.docs]) {
    const entry = directoryFromData(snapshot.id, snapshot.data())

    if (entry.id !== user.id) matches.set(entry.id, entry)
  }

  return [...matches.values()]
}

export async function loadTeamWorkspace(user: AppUser): Promise<TeamProjectSummary[]> {
  const db = getTeamFirestore()

  await directoryReference(db, user.id).set(
    {
      userId: user.id,

      name: user.name,

      username: user.username ?? '',

      nameNormalized: normalized(user.name),

      usernameNormalized: normalized(user.username ?? ''),

      updatedAt: FieldValue.serverTimestamp(),
    },

    { merge: true },
  )

  const memberships = await directoryReference(db, user.id)
    .collection('projects')

    .orderBy('createdAt', 'desc')

    .limit(50)

    .get()

  const projects = await Promise.all(
    memberships.docs.map(async (membership) => {
      const projectId = requiredString(membership.data(), 'projectId')

      const snapshot = await projectReference(db, projectId).get()

      if (!snapshot.exists)
        throw new TeamDataError('A project membership points to a missing project.')

      return projectFromData(snapshot.id, snapshot.data() ?? {})
    }),
  )

  return projects
}

export async function loadTeamProjectBoard(
  userId: string,

  projectId: string,
): Promise<TeamProjectBoard> {
  const db = getTeamFirestore()

  const projectRef = projectReference(db, projectId)

  const [projectSnapshot, requesterMembership] = await Promise.all([
    projectRef.get(),

    memberReference(projectRef, userId).get(),
  ])

  if (!projectSnapshot.exists)
    throw new TeamDataError('That team project could not be found.')

  if (!requesterMembership.exists)
    throw new TeamDataError('You are not a member of this project.')

  const [memberSnapshot, deliverableSnapshot] = await Promise.all([
    projectRef.collection('members').orderBy('username').limit(100).get(),

    projectRef.collection('deliverables').orderBy('updatedAt', 'desc').limit(200).get(),
  ])

  const members = memberSnapshot.docs.map((snapshot) =>
    memberFromData(snapshot.id, snapshot.data()),
  )

  const deliverables = deliverableSnapshot.docs.map((snapshot) =>
    deliverableFromData(snapshot.id, snapshot.data()),
  )

  const titleById = new Map(deliverables.map((item) => [item.id, item.title]))

  return {
    project: projectFromData(projectSnapshot.id, projectSnapshot.data() ?? {}),

    members,

    deliverables: deliverables.map((item) => ({
      ...item,

      parentTitle: item.parentDeliverableId
        ? (titleById.get(item.parentDeliverableId) ?? 'Parent deliverable')
        : undefined,
    })),
  }
}

export async function createTeamProject(user: AppUser, input: ProjectInput) {
  const db = getTeamFirestore()

  const projectRef = db.collection(projectCollection).doc()

  const memberRef = memberReference(projectRef, user.id)

  const profileRef = directoryReference(db, user.id)

  const membershipRef = profileRef.collection('projects').doc(projectRef.id)

  const now = Timestamp.now()

  const project: TeamProjectSummary = {
    id: projectRef.id,

    title: input.title,

    description: input.description,

    finalDeadline: new Date(input.finalDeadline).toISOString(),

    ownerId: user.id,
  }

  const batch = db.batch()

  batch.set(profileRef, directoryProfile(user), { merge: true })

  batch.set(projectRef, {
    title: input.title,

    description: input.description,

    finalDeadline: Timestamp.fromDate(new Date(input.finalDeadline)),

    ownerId: user.id,

    createdAt: now,

    updatedAt: now,
  })

  batch.set(memberRef, {
    userId: user.id,

    name: user.name,

    username: user.username ?? '',

    role: 'owner',

    createdAt: now,
  })

  batch.set(membershipRef, {
    projectId: projectRef.id,

    role: 'owner',

    createdAt: now,
  })

  await batch.commit()

  return project
}

export async function updateTeamProject(
  user: AppUser,

  projectId: string,

  input: ProjectInput,
) {
  const db = getTeamFirestore()

  const projectRef = projectReference(db, projectId)

  await db.runTransaction(async (transaction) => {
    const projectSnapshot = await transaction.get(projectRef)

    if (!projectSnapshot.exists)
      throw new TeamDataError('That team project could not be found.')

    const projectData = projectSnapshot.data() ?? {}

    if (requiredString(projectData, 'ownerId') !== user.id) {
      throw new TeamDataError('Only the project owner can edit project details.')
    }

    const deliverables = await transaction.get(projectRef.collection('deliverables'))

    for (const deliverable of deliverables.docs) {
      const dueAt = requiredIsoDate(deliverable.data(), 'dueAt')

      assertDeadline(dueAt, input.finalDeadline)
    }

    transaction.update(projectRef, {
      title: input.title,

      description: input.description,

      finalDeadline: Timestamp.fromDate(new Date(input.finalDeadline)),

      updatedAt: Timestamp.now(),
    })
  })

  return {
    id: projectId,

    title: input.title,

    description: input.description,

    finalDeadline: new Date(input.finalDeadline).toISOString(),

    ownerId: user.id,
  } satisfies TeamProjectSummary
}

export async function addProjectMember(
  user: AppUser,

  projectId: string,

  username: string,
) {
  const db = getTeamFirestore()

  const matches = await db

    .collection(directoryCollection)

    .where('usernameNormalized', '==', normalized(username))

    .limit(2)

    .get()

  if (matches.empty) {
    throw new TeamDataError('No matching teammate is in the collaborator directory yet.')
  }

  if (matches.size > 1)
    throw new TeamDataError('That username is ambiguous; contact an administrator.')

  const teammate = directoryFromData(matches.docs[0].id, matches.docs[0].data())

  if (teammate.id === user.id)
    throw new TeamDataError('You are already the project owner.')

  const projectRef = projectReference(db, projectId)

  const teammateRef = memberReference(projectRef, teammate.id)

  const membershipRef = directoryReference(db, teammate.id)
    .collection('projects')
    .doc(projectId)

  const now = Timestamp.now()

  await db.runTransaction(async (transaction) => {
    const [projectSnapshot, existingMembership] = await Promise.all([
      transaction.get(projectRef),

      transaction.get(teammateRef),
    ])

    if (!projectSnapshot.exists)
      throw new TeamDataError('That team project could not be found.')

    if (requiredString(projectSnapshot.data() ?? {}, 'ownerId') !== user.id) {
      throw new TeamDataError('Only the project owner can add collaborators.')
    }

    if (existingMembership.exists)
      throw new TeamDataError('That teammate is already on this project.')

    transaction.set(teammateRef, {
      userId: teammate.id,

      name: teammate.name,

      username: teammate.username,

      role: 'member',

      createdAt: now,
    })

    transaction.set(membershipRef, {
      projectId,
      role: 'member',
      createdAt: now,
    })
  })

  return { ...teammate, role: 'member' as const }
}

export async function createProjectDeliverable(
  user: AppUser,

  projectId: string,

  input: DeliverableInput,
) {
  const db = getTeamFirestore()

  const projectRef = projectReference(db, projectId)

  const memberRef = memberReference(projectRef, user.id)

  const assigneeRef = memberReference(projectRef, input.assigneeId)

  const deliverableRef = projectRef.collection('deliverables').doc()

  const now = Timestamp.now()

  await db.runTransaction(async (transaction) => {
    const [projectSnapshot, requester, assignee] = await Promise.all([
      transaction.get(projectRef),

      transaction.get(memberRef),

      transaction.get(assigneeRef),
    ])

    if (!projectSnapshot.exists)
      throw new TeamDataError('That team project could not be found.')

    if (!requester.exists)
      throw new TeamDataError('You are not a member of this project.')

    if (requiredString(projectSnapshot.data() ?? {}, 'ownerId') !== user.id) {
      throw new TeamDataError('Only the project owner can create deliverables.')
    }

    if (!assignee.exists)
      throw new TeamDataError('Choose a current project collaborator.')

    const project = projectFromData(projectSnapshot.id, projectSnapshot.data() ?? {})

    assertDeadline(input.dueAt, project.finalDeadline)

    await assertParentChain(transaction, projectRef, input.parentDeliverableId)

    const assigneeData = assignee.data() ?? {}

    transaction.set(deliverableRef, {
      projectId,

      title: input.title,

      description: input.description,

      dueAt: Timestamp.fromDate(new Date(input.dueAt)),

      status: 'open',

      assigneeId: input.assigneeId,

      assigneeName: requiredString(assigneeData, 'name'),

      assigneeUsername: requiredString(assigneeData, 'username'),

      ...(input.parentDeliverableId
        ? { parentDeliverableId: input.parentDeliverableId }
        : {}),

      createdAt: now,

      updatedAt: now,
    })
  })

  return { id: deliverableRef.id }
}

export async function updateProjectDeliverable(
  user: AppUser,

  projectId: string,

  deliverableId: string,

  input: DeliverableInput,
) {
  const db = getTeamFirestore()

  const projectRef = projectReference(db, projectId)

  const deliverableRef = projectRef.collection('deliverables').doc(deliverableId)

  const assigneeRef = memberReference(projectRef, input.assigneeId)

  await db.runTransaction(async (transaction) => {
    const [projectSnapshot, deliverableSnapshot, assigneeSnapshot] = await Promise.all([
      transaction.get(projectRef),

      transaction.get(deliverableRef),

      transaction.get(assigneeRef),
    ])

    if (!projectSnapshot.exists)
      throw new TeamDataError('That team project could not be found.')

    if (requiredString(projectSnapshot.data() ?? {}, 'ownerId') !== user.id) {
      throw new TeamDataError('Only the project owner can edit deliverable details.')
    }

    if (!deliverableSnapshot.exists)
      throw new TeamDataError('That deliverable could not be found.')

    if (!assigneeSnapshot.exists)
      throw new TeamDataError('Choose a current project collaborator.')

    const project = projectFromData(projectSnapshot.id, projectSnapshot.data() ?? {})

    assertDeadline(input.dueAt, project.finalDeadline)

    await assertParentChain(
      transaction,
      projectRef,
      input.parentDeliverableId,
      deliverableId,
    )

    const assignee = assigneeSnapshot.data() ?? {}

    transaction.update(deliverableRef, {
      title: input.title,

      description: input.description,

      dueAt: Timestamp.fromDate(new Date(input.dueAt)),

      assigneeId: input.assigneeId,

      assigneeName: requiredString(assignee, 'name'),

      assigneeUsername: requiredString(assignee, 'username'),

      parentDeliverableId: input.parentDeliverableId ?? FieldValue.delete(),

      updatedAt: Timestamp.now(),
    })
  })

  return { id: deliverableId }
}

export async function setProjectDeliverableStatus(
  user: AppUser,

  projectId: string,

  deliverableId: string,

  status: DeliverableStatus,
) {
  const db = getTeamFirestore()

  const projectRef = projectReference(db, projectId)

  const deliverableRef = projectRef.collection('deliverables').doc(deliverableId)

  await db.runTransaction(async (transaction) => {
    const [projectSnapshot, requester, deliverableSnapshot] = await Promise.all([
      transaction.get(projectRef),

      transaction.get(memberReference(projectRef, user.id)),

      transaction.get(deliverableRef),
    ])

    if (!projectSnapshot.exists)
      throw new TeamDataError('That team project could not be found.')

    if (!requester.exists)
      throw new TeamDataError('You are not a member of this project.')

    if (!deliverableSnapshot.exists)
      throw new TeamDataError('That deliverable could not be found.')

    const project = projectFromData(projectSnapshot.id, projectSnapshot.data() ?? {})

    const deliverable = deliverableFromData(
      deliverableSnapshot.id,
      deliverableSnapshot.data() ?? {},
    )

    if (project.ownerId !== user.id && deliverable.assigneeId !== user.id) {
      throw new TeamDataError(
        'Only the project owner or assigned teammate can change this status.',
      )
    }

    transaction.update(deliverableRef, { status, updatedAt: Timestamp.now() })
  })

  return { id: deliverableId, status }
}
