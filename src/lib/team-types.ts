export type DeliverableStatus = "open" | "in-progress" | "done"

export type TeamProjectSummary = {
  id: string

  title: string

  description: string

  finalDeadline: string

  ownerId: string
}

export type TeamMember = {
  id: string

  name: string

  username: string

  role: "owner" | "member"
}

export type TeamDeliverable = {
  id: string

  title: string

  description: string

  dueAt: string

  status: DeliverableStatus

  assigneeId: string

  assigneeName: string

  assigneeUsername: string

  parentDeliverableId?: string

  parentTitle?: string
}

export type DirectoryEntry = {
  id: string

  name: string

  username: string
}

export type TeamProjectBoard = {
  project: TeamProjectSummary

  members: TeamMember[]

  deliverables: TeamDeliverable[]
}

export type ProjectInput = {
  title: string

  description: string

  finalDeadline: string
}

export type DeliverableInput = {
  title: string

  description: string

  dueAt: string

  assigneeId: string

  parentDeliverableId?: string
}
