'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'

import {
  addProjectMemberAction,
  createProjectDeliverableAction,
  createTeamProjectAction,
  loadTeamProjectBoardAction,
  loadTeamWorkspaceAction,
  searchTeammatesAction,
  setProjectDeliverableStatusAction,
  updateProjectDeliverableAction,
  updateTeamProjectAction,
} from './team-actions'

import type {
  DeliverableStatus,
  DirectoryEntry,
  TeamDeliverable,
  TeamProjectBoard,
  TeamProjectSummary,
} from '@/lib/team-types'

const fieldClassName =
  'w-full rounded-sm border border-[var(--line)] bg-[#0f1012] px-3 py-2 text-sm text-white outline-none focus:border-[var(--blue)]'

const labelClassName = 'grid gap-1 text-xs text-[var(--muted)]'

function localDateTimeValue(value: string) {
  const date = new Date(value)

  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())

  return date.toISOString().slice(0, 16)
}

function toIsoDateTime(value: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function deadlineLabel(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',

    timeStyle: 'short',
  })
}

function deadlineIsLate(value: string, finalDeadline: string) {
  const dueAt = Date.parse(value)

  const finalAt = Date.parse(finalDeadline)

  return (
    Number.isFinite(dueAt) &&
    Number.isFinite(finalAt) &&
    dueAt > finalAt - 72 * 60 * 60 * 1000
  )
}

export default function TeamDeliverables({
  currentUserId,

  onChanged,
}: {
  currentUserId: string

  onChanged: (message: string) => void
}) {
  const [projects, setProjects] = useState<TeamProjectSummary[]>([])

  const [selectedProjectId, setSelectedProjectId] = useState('')

  const [board, setBoard] = useState<TeamProjectBoard>()

  const [directoryMatches, setDirectoryMatches] = useState<DirectoryEntry[]>([])

  const [searchValue, setSearchValue] = useState('')

  const [error, setError] = useState('')

  const [notice, setNotice] = useState('')

  const [loading, setLoading] = useState(true)

  const [showProjectForm, setShowProjectForm] = useState(false)

  const [editingProject, setEditingProject] = useState(false)

  const [showDeliverableForm, setShowDeliverableForm] = useState(false)

  const [editingDeliverable, setEditingDeliverable] = useState<TeamDeliverable>()

  const [pending, startTransition] = useTransition()

  const [projectTitle, setProjectTitle] = useState('')

  const [projectDescription, setProjectDescription] = useState('')

  const [projectFinalDeadline, setProjectFinalDeadline] = useState('')

  const [deliverableTitle, setDeliverableTitle] = useState('')

  const [deliverableDescription, setDeliverableDescription] = useState('')

  const [deliverableDueAt, setDeliverableDueAt] = useState('')

  const [deliverableAssigneeId, setDeliverableAssigneeId] = useState('')

  const [parentDeliverableId, setParentDeliverableId] = useState('')

  useEffect(() => {
    let active = true

    startTransition(async () => {
      const result = await loadTeamWorkspaceAction()

      if (!active) return

      if (!result.ok) {
        setError(result.error)
      } else {
        setProjects(result.data.projects)

        setSelectedProjectId((current) => current || result.data.projects[0]?.id || '')
      }

      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      setBoard(undefined)

      return
    }

    let active = true

    startTransition(async () => {
      const result = await loadTeamProjectBoardAction(selectedProjectId)

      if (!active) return

      if (!result.ok) {
        setError(result.error)

        setBoard(undefined)
      } else {
        setBoard(result.data.board)

        setProjectTitle(result.data.board.project.title)

        setProjectDescription(result.data.board.project.description)

        setProjectFinalDeadline(
          localDateTimeValue(result.data.board.project.finalDeadline),
        )
      }
    })

    return () => {
      active = false
    }
  }, [selectedProjectId])

  function reportError(message: string) {
    setError(message)

    setNotice('')
  }

  function reportSuccess(message: string) {
    setError('')

    setNotice(message)

    onChanged(message)
  }

  async function refreshBoard(projectId: string, successMessage: string) {
    const refreshed = await loadTeamProjectBoardAction(projectId)

    if (!refreshed.ok) {
      setError('')

      setNotice(
        `${successMessage} The change was saved, but the board could not be refreshed: ${refreshed.error}`,
      )

      onChanged(successMessage)

      return
    }

    setBoard(refreshed.data.board)

    reportSuccess(successMessage)
  }

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const input = {
      title: projectTitle,

      description: projectDescription,

      finalDeadline: toIsoDateTime(projectFinalDeadline),
    }

    if (!input.finalDeadline) {
      reportError('Enter a valid final submission date and time.')

      return
    }

    startTransition(async () => {
      const result = editingProject
        ? await updateTeamProjectAction(selectedProjectId, input)
        : await createTeamProjectAction(input)

      if (!result.ok) {
        reportError(result.error)

        return
      }

      if (editingProject) {
        setProjects((current) =>
          current.map((project) =>
            project.id === result.data.project.id ? result.data.project : project,
          ),
        )

        setBoard((current) =>
          current ? { ...current, project: result.data.project } : current,
        )
      } else {
        setProjects((current) => [result.data.project, ...current])

        setSelectedProjectId(result.data.project.id)
      }

      setShowProjectForm(false)

      setEditingProject(false)

      reportSuccess(result.message)
    })
  }

  function beginEditProject() {
    if (!board) return

    setProjectTitle(board.project.title)

    setProjectDescription(board.project.description)

    setProjectFinalDeadline(localDateTimeValue(board.project.finalDeadline))

    setEditingProject(true)

    setShowProjectForm(true)
  }

  function searchDirectory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    startTransition(async () => {
      const result = await searchTeammatesAction(searchValue)

      if (!result.ok) {
        reportError(result.error)

        return
      }

      const currentMemberIds = new Set(board?.members.map((member) => member.id))

      const availableMatches = result.data.matches.filter(
        (member) => !currentMemberIds?.has(member.id),
      )

      setDirectoryMatches(availableMatches)

      setError('')

      setNotice(
        availableMatches.length
          ? ''
          : 'No new matches. Teammates appear after they open this workspace.',
      )
    })
  }

  function addMember(member: DirectoryEntry) {
    if (!selectedProjectId) return

    startTransition(async () => {
      const result = await addProjectMemberAction(selectedProjectId, member.username)

      if (!result.ok) {
        reportError(result.error)

        return
      }

      setDirectoryMatches((current) => current.filter((entry) => entry.id !== member.id))

      await refreshBoard(selectedProjectId, result.message)
    })
  }

  function beginEditDeliverable(deliverable: TeamDeliverable) {
    setEditingDeliverable(deliverable)

    setDeliverableTitle(deliverable.title)

    setDeliverableDescription(deliverable.description)

    setDeliverableDueAt(localDateTimeValue(deliverable.dueAt))

    setDeliverableAssigneeId(deliverable.assigneeId)

    setParentDeliverableId(deliverable.parentDeliverableId ?? '')

    setShowDeliverableForm(true)
  }

  function resetDeliverableForm() {
    setEditingDeliverable(undefined)

    setDeliverableTitle('')

    setDeliverableDescription('')

    setDeliverableDueAt('')

    setDeliverableAssigneeId('')

    setParentDeliverableId('')

    setShowDeliverableForm(false)
  }

  function submitDeliverable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!board) return

    const dueAt = toIsoDateTime(deliverableDueAt)

    if (!dueAt) {
      reportError('Enter a valid milestone date and time.')

      return
    }

    if (deadlineIsLate(dueAt, board.project.finalDeadline)) {
      reportError('Milestones must be due at least 72 hours before final submission.')

      return
    }

    const input = {
      title: deliverableTitle,

      description: deliverableDescription,

      dueAt,

      assigneeId: deliverableAssigneeId,

      parentDeliverableId: parentDeliverableId || undefined,
    }

    startTransition(async () => {
      const result = editingDeliverable
        ? await updateProjectDeliverableAction(
            selectedProjectId,

            editingDeliverable.id,

            input,
          )
        : await createProjectDeliverableAction(selectedProjectId, input)

      if (!result.ok) {
        reportError(result.error)

        return
      }

      resetDeliverableForm()

      await refreshBoard(selectedProjectId, result.message)
    })
  }

  function updateStatus(deliverableId: string, status: DeliverableStatus) {
    if (!selectedProjectId) return

    startTransition(async () => {
      const result = await setProjectDeliverableStatusAction(
        selectedProjectId,

        deliverableId,

        status,
      )

      if (!result.ok) {
        reportError(result.error)

        return
      }

      await refreshBoard(selectedProjectId, result.message)
    })
  }

  const isOwner = board?.project.ownerId === currentUserId

  const hasLateDate =
    Boolean(board) &&
    Boolean(deliverableDueAt) &&
    deadlineIsLate(toIsoDateTime(deliverableDueAt), board!.project.finalDeadline)

  return (
    <div className="grid gap-4">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <section className="panel">
        <div className="kicker">
          <span>TEAM DELIVERABLES / 72-HOUR REVIEW FREEZE</span>
          <button
            className="button button--primary"
            onClick={() => {
              setEditingProject(false)

              setProjectTitle('')

              setProjectDescription('')

              setProjectFinalDeadline('')

              setShowProjectForm((current) => !current)
            }}
            type="button"
          >
            New project
          </button>
        </div>
        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-4">
            <label className={`${labelClassName} min-w-56 flex-1`}>
              Project
              <select
                className={fieldClassName}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value)

                  setError('')

                  setNotice('')
                }}
                value={selectedProjectId}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            {isOwner && (
              <button className="button" onClick={beginEditProject} type="button">
                Edit project
              </button>
            )}
          </div>
        )}
        {showProjectForm && (
          <form
            className="grid gap-3 border-t border-[var(--line)] p-4"
            onSubmit={submitProject}
          >
            <h2 className="text-sm font-semibold">
              {editingProject ? 'Edit project' : 'Create a team project'}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className={labelClassName}>
                Project title
                <input
                  className={fieldClassName}
                  maxLength={160}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  required
                  value={projectTitle}
                />
              </label>
              <label className={labelClassName}>
                Final submission
                <input
                  className={fieldClassName}
                  onChange={(event) => setProjectFinalDeadline(event.target.value)}
                  required
                  type="datetime-local"
                  value={projectFinalDeadline}
                />
              </label>
            </div>
            <label className={labelClassName}>
              Description
              <textarea
                className={fieldClassName}
                maxLength={2000}
                onChange={(event) => setProjectDescription(event.target.value)}
                rows={2}
                value={projectDescription}
              />
            </label>
            <div className="flex gap-2">
              <button className="button button--primary" disabled={pending} type="submit">
                {pending ? 'Saving…' : editingProject ? 'Save project' : 'Create project'}
              </button>
              <button
                className="button"
                onClick={() => {
                  setShowProjectForm(false)
                  setEditingProject(false)
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {loading && (
          <p className="p-4 text-sm text-[var(--muted)]">Loading team projects…</p>
        )}
        {!loading && projects.length === 0 && !showProjectForm && (
          <div className="empty-state compact">
            <span>NO TEAM PROJECTS</span>
            <strong>Create a project workspace</strong>
            <p>
              Set the final deadline, add existing teammates, and break the work into
              owned milestones.
            </p>
          </div>
        )}
      </section>

      {board && (
        <>
          <section className="panel">
            <div className="kicker">
              <span>PROJECT / {board.project.title.toUpperCase()}</span>
              <span>FINAL / {deadlineLabel(board.project.finalDeadline)}</span>
            </div>
            {board.project.description && (
              <p className="px-4 pt-4 text-sm text-[var(--muted)]">
                {board.project.description}
              </p>
            )}
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">
                    Collaborators ({board.members.length})
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {board.members.map((member) => (
                    <span className="tag" key={member.id}>
                      {member.name} @{member.username}
                      {member.role === 'owner' ? ' · OWNER' : ''}
                    </span>
                  ))}
                </div>
              </div>
              {isOwner && (
                <div className="border-t border-[var(--line)] pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <h2 className="mb-2 text-sm font-semibold">Add a teammate</h2>
                  <form className="flex gap-2" onSubmit={searchDirectory}>
                    <input
                      aria-label="Search by name or username"
                      className={fieldClassName}
                      maxLength={80}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Name or username"
                      value={searchValue}
                    />
                    <button
                      className="button"
                      disabled={pending || searchValue.trim().length < 2}
                      type="submit"
                    >
                      Search
                    </button>
                  </form>
                  <div className="mt-2 grid gap-2">
                    {directoryMatches.map((member) => (
                      <div
                        className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-2"
                        key={member.id}
                      >
                        <span className="text-xs">
                          {member.name}{' '}
                          <span className="text-[var(--muted)]">@{member.username}</span>
                        </span>
                        <button
                          className="button"
                          disabled={pending}
                          onClick={() => addMember(member)}
                          type="button"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="kicker">
              <span>SUB-DELIVERABLES / {board.deliverables.length}</span>
              {isOwner && (
                <button
                  className="button button--primary"
                  onClick={() => {
                    resetDeliverableForm()
                    setShowDeliverableForm(true)
                  }}
                  type="button"
                >
                  Add deliverable
                </button>
              )}
            </div>
            {isOwner && showDeliverableForm && (
              <form
                className="grid gap-3 border-b border-[var(--line)] p-4"
                onSubmit={submitDeliverable}
              >
                <h2 className="text-sm font-semibold">
                  {editingDeliverable ? 'Edit deliverable' : 'New sub-deliverable'}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className={labelClassName}>
                    Title
                    <input
                      className={fieldClassName}
                      maxLength={160}
                      onChange={(event) => setDeliverableTitle(event.target.value)}
                      required
                      value={deliverableTitle}
                    />
                  </label>
                  <label className={labelClassName}>
                    Assigned teammate
                    <select
                      className={fieldClassName}
                      onChange={(event) => setDeliverableAssigneeId(event.target.value)}
                      required
                      value={deliverableAssigneeId}
                    >
                      <option value="">Select a collaborator</option>
                      {board.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} (@{member.username})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClassName}>
                    Target deadline
                    <input
                      className={fieldClassName}
                      onChange={(event) => setDeliverableDueAt(event.target.value)}
                      required
                      type="datetime-local"
                      value={deliverableDueAt}
                    />
                  </label>
                  <label className={labelClassName}>
                    Parent deliverable
                    <select
                      className={fieldClassName}
                      onChange={(event) => setParentDeliverableId(event.target.value)}
                      value={parentDeliverableId}
                    >
                      <option value="">Project root</option>
                      {board.deliverables

                        .filter((item) => item.id !== editingDeliverable?.id)

                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <label className={labelClassName}>
                  Description
                  <textarea
                    className={fieldClassName}
                    maxLength={2000}
                    onChange={(event) => setDeliverableDescription(event.target.value)}
                    rows={2}
                    value={deliverableDescription}
                  />
                </label>
                {hasLateDate && (
                  <p className="warning-box" role="alert">
                    <span>!</span>
                    <span>
                      Deadline is past the 72-hour peer-review freeze (
                      {deadlineLabel(
                        new Date(
                          Date.parse(board.project.finalDeadline) - 72 * 60 * 60 * 1000,
                        ).toISOString(),
                      )}
                      ).
                    </span>
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    className="button button--primary"
                    disabled={pending || hasLateDate}
                    type="submit"
                  >
                    {pending
                      ? 'Saving…'
                      : editingDeliverable
                        ? 'Save changes'
                        : 'Create deliverable'}
                  </button>
                  <button className="button" onClick={resetDeliverableForm} type="button">
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {board.deliverables.length === 0 ? (
              <div className="empty-state compact">
                <span>NO MILESTONES</span>
                <strong>Break the project into assigned work</strong>
                <p>
                  Every milestone needs an assignee and a target at least 72 hours before
                  final submission.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                {board.members.map((member) => {
                  const assigned = board.deliverables.filter(
                    (item) => item.assigneeId === member.id,
                  )

                  if (!assigned.length) return null

                  return (
                    <section
                      className="rounded border border-[var(--line)] bg-[#15171a]"
                      key={member.id}
                    >
                      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-3">
                        <strong className="text-sm">{member.name}</strong>
                        <span className="tag">{assigned.length} ITEMS</span>
                      </div>
                      <div className="grid gap-2 p-2">
                        {assigned.map((deliverable) => {
                          const canUpdateStatus =
                            isOwner || deliverable.assigneeId === currentUserId

                          return (
                            <article
                              className="rounded border border-[var(--line)] bg-[#101113] p-3"
                              key={deliverable.id}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  {deliverable.parentTitle && (
                                    <small className="text-[var(--muted)]">
                                      UNDER / {deliverable.parentTitle}
                                    </small>
                                  )}
                                  <h3 className="mt-1 text-sm font-semibold">
                                    {deliverable.title}
                                  </h3>
                                </div>
                                {isOwner && (
                                  <button
                                    className="button"
                                    onClick={() => beginEditDeliverable(deliverable)}
                                    type="button"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                              {deliverable.description && (
                                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                                  {deliverable.description}
                                </p>
                              )}
                              <p className="mt-3 text-xs text-[var(--muted)]">
                                DUE / {deadlineLabel(deliverable.dueAt)}
                              </p>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <span
                                  className={`tag ${
                                    deliverable.status === 'done' ? 'tag--green' : ''
                                  }`}
                                >
                                  {deliverable.status.toUpperCase()}
                                </span>
                                {canUpdateStatus && (
                                  <select
                                    aria-label={`Status for ${deliverable.title}`}
                                    className={`${fieldClassName} max-w-36`}
                                    disabled={pending}
                                    onChange={(event) =>
                                      updateStatus(
                                        deliverable.id,
                                        event.target.value as DeliverableStatus,
                                      )
                                    }
                                    value={deliverable.status}
                                  >
                                    <option value="open">Open</option>
                                    <option value="in-progress">In progress</option>
                                    <option value="done">Done</option>
                                  </select>
                                )}
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
