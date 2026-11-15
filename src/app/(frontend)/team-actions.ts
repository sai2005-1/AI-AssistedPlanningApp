"use server"

import { FirestoreConfigurationError } from "@/lib/firebase-admin"

import { requireAppUser, type AppUser } from "@/lib/app-auth"

import type {
  DeliverableInput,
  DeliverableStatus,
  ProjectInput,
} from "@/lib/team-types"

import {
  addProjectMember,
  createProjectDeliverable,
  createTeamProject,
  loadTeamProjectBoard,
  loadTeamWorkspace,
  searchDirectory,
  setProjectDeliverableStatus,
  TeamDataError,
  updateProjectDeliverable,
  updateTeamProject,
} from "@/lib/team-deliverables"

type ActionResult<T> =
  | { ok: true; data: T; message: string }
  | {
  ok: false
  error: string
}

class InputError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("The submitted data is invalid.")
  }

  return value as Record<string, unknown>
}

function allowKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new InputError("The submitted data contains unsupported fields.")
  }
}

function text(value: unknown, label: string, maximum: number, required = true) {
  if (typeof value !== "string") throw new InputError(`Enter a valid ${label}.`)

  const result = value.trim()

  if (required && !result) throw new InputError(`Enter a ${label}.`)

  if (result.length > maximum)
    throw new InputError(`${label} must be ${maximum} characters or fewer.`)

  return result
}

function documentId(value: unknown, label: string) {
  const id = text(value, label, 128)

  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new InputError(`The ${label} is invalid.`)

  return id
}

function isoDate(value: unknown, label: string) {
  const date = text(value, label, 40)

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      date,
    )
  ) {
    throw new InputError(`Enter a valid ${label}.`)
  }

  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime()))
    throw new InputError(`Enter a valid ${label}.`)

  return parsed.toISOString()
}

function parseProjectInput(value: unknown): ProjectInput {
  const input = record(value)

  allowKeys(input, ["title", "description", "finalDeadline"])

  return {
    title: text(input.title, "project title", 160),

    description: text(input.description ?? "", "description", 2000, false),

    finalDeadline: isoDate(input.finalDeadline, "final submission date"),
  }
}

function parseDeliverableInput(value: unknown): DeliverableInput {
  const input = record(value)

  allowKeys(input, [
    "title",
    "description",
    "dueAt",
    "assigneeId",
    "parentDeliverableId",
  ])

  const parentDeliverableId =
    input.parentDeliverableId === undefined || input.parentDeliverableId === ""
      ? undefined
      : documentId(input.parentDeliverableId, "parent deliverable")

  return {
    title: text(input.title, "deliverable title", 160),

    description: text(input.description ?? "", "description", 2000, false),

    dueAt: isoDate(input.dueAt, "milestone deadline"),

    assigneeId: documentId(input.assigneeId, "assignee"),

    parentDeliverableId,
  }
}

function publicError(error: unknown, fallback: string) {
  if (
    error instanceof InputError ||
    error instanceof TeamDataError ||
    error instanceof FirestoreConfigurationError
  ) {
    return error.message
  }

  console.error(
    "Team deliverables action failed",
    error instanceof Error ? error.name : "Unknown error",
  )

  return fallback
}

async function runAction<T>(
  fallback: string,

  operation: (user: AppUser) => Promise<{ data: T; message: string }>,
): Promise<ActionResult<T>> {
  try {
    const user = await requireAppUser()

    if (!user) return { ok: false, error: "Sign in to use team deliverables." }

    const result = await operation(user)

    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: publicError(error, fallback) }
  }
}

export async function loadTeamWorkspaceAction(): Promise<ActionResult<{
  projects: Awaited<ReturnType<typeof loadTeamWorkspace>>
}>> {
  return runAction(
    "Could not load team projects. Check the Firestore setup and try again.",
    async (user) => ({
      data: { projects: await loadTeamWorkspace(user) },

      message: "Team projects loaded.",
    }),
  )
}

export async function loadTeamProjectBoardAction(
  projectIdValue: unknown,
): Promise<ActionResult<{
  board: Awaited<ReturnType<typeof loadTeamProjectBoard>>
}>> {
  return runAction(
    "Could not load this project. Check the Firestore setup and try again.",
    async (user) => {
      const projectId = documentId(projectIdValue, "project")

      return {
        data: { board: await loadTeamProjectBoard(user.id, projectId) },

        message: "Project loaded.",
      }
    },
  )
}

export async function searchTeammatesAction(
  queryValue: unknown,
): Promise<ActionResult<{
  matches: Awaited<ReturnType<typeof searchDirectory>>
}>> {
  return runAction(
    "Could not search the collaborator directory. Try again.",
    async (user) => {
      const query = text(queryValue, "search", 80, false)

      return {
        data: { matches: await searchDirectory(user, query) },
        message: "Search complete.",
      }
    },
  )
}

export async function createTeamProjectAction(
  inputValue: unknown,
): Promise<ActionResult<{
  project: Awaited<ReturnType<typeof createTeamProject>>
}>> {
  return runAction(
    "Could not create the project. Check the Firestore setup and try again.",
    async (user) => ({
      data: {
        project: await createTeamProject(user, parseProjectInput(inputValue)),
      },

      message: "Team project created.",
    }),
  )
}

export async function updateTeamProjectAction(
  projectIdValue: unknown,

  inputValue: unknown,
): Promise<ActionResult<{
  project: Awaited<ReturnType<typeof updateTeamProject>>
}>> {
  return runAction("Could not update the project. Try again.", async (user) => {
    const projectId = documentId(projectIdValue, "project")

    return {
      data: {
        project: await updateTeamProject(
          user,
          projectId,
          parseProjectInput(inputValue),
        ),
      },

      message: "Project details updated.",
    }
  })
}

export async function addProjectMemberAction(
  projectIdValue: unknown,

  usernameValue: unknown,
): Promise<ActionResult<{
  member: Awaited<ReturnType<typeof addProjectMember>>
}>> {
  return runAction(
    "Could not add that collaborator. Try again.",
    async (user) => {
      const projectId = documentId(projectIdValue, "project")

      const username = text(usernameValue, "username", 32)

      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
        throw new InputError("Enter a valid teammate username.")
      }

      return {
        data: { member: await addProjectMember(user, projectId, username) },

        message: "Collaborator added.",
      }
    },
  )
}

export async function createProjectDeliverableAction(
  projectIdValue: unknown,

  inputValue: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(
    "Could not create the deliverable. Try again.",
    async (user) => {
      const projectId = documentId(projectIdValue, "project")

      const result = await createProjectDeliverable(
        user,
        projectId,
        parseDeliverableInput(inputValue),
      )

      return { data: result, message: "Deliverable created." }
    },
  )
}

export async function updateProjectDeliverableAction(
  projectIdValue: unknown,

  deliverableIdValue: unknown,

  inputValue: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(
    "Could not update the deliverable. Try again.",
    async (user) => {
      const projectId = documentId(projectIdValue, "project")

      const deliverableId = documentId(deliverableIdValue, "deliverable")

      const result = await updateProjectDeliverable(
        user,

        projectId,

        deliverableId,

        parseDeliverableInput(inputValue),
      )

      return { data: result, message: "Deliverable updated." }
    },
  )
}

export async function setProjectDeliverableStatusAction(
  projectIdValue: unknown,

  deliverableIdValue: unknown,

  statusValue: unknown,
): Promise<ActionResult<{ id: string; status: DeliverableStatus }>> {
  return runAction(
    "Could not update the deliverable status. Try again.",
    async (user) => {
      const projectId = documentId(projectIdValue, "project")

      const deliverableId = documentId(deliverableIdValue, "deliverable")

      if (
        statusValue !== "open" &&
        statusValue !== "in-progress" &&
        statusValue !== "done"
      ) {
        throw new InputError("Choose a valid deliverable status.")
      }

      return {
        data: {
          ...(await setProjectDeliverableStatus(
            user,
            projectId,
            deliverableId,
            statusValue,
          )),
        },

        message: "Deliverable status updated.",
      }
    },
  )
}
