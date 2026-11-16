"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react"

import { useRouter } from "next/navigation"
import { signOut as signOutFirebase } from "firebase/auth"

import {
  createCourseAction,
  deleteCourseAction,
  createTaskAction,
  createWorkflowAction,
  importCalendarAction,
  replanTasksAction,
  setCalendarEventCompletedAction,
  setTaskCompletedAction,
  updateCourseAction,
} from "./actions"

import { logoutAction } from "./auth-actions"
import { advisorChatAction } from "./advisor-actions"
import {
  classifyLocalCommand,
  MAX_PROMPT_CHARS,
  recentChatHistory,
  type ChatTurn,
} from "../../lib/advisor-chat"

import TeamDeliverables from "./team-deliverables"

import type { AssignmentType, ClassLevel } from "@/lib/scoring"

import type { AppUser } from "@/lib/app-auth"
import { getFirebaseClientAuth } from "@/lib/firebase-client"
import type { AppCourse } from "@/lib/app-data"

type Screen = "dashboard" | "score" | "calendar" | "time" | "copilot" | "advisor" | "team" | "completed" | "courses"

export type TaskView = {
  academicValue: number
  assignmentType: AssignmentType
  careerValue: number
  calendarEventId?: string
  classLevel: ClassLevel
  consequence: number
  courseCode?: string
  dueDate?: string
  estimatedMinutes: number
  goalAlignment: number
  id: string
  neglectFactor: number
  plannedStart?: string
  score: number
  status: "open" | "scheduled" | "done"
  title: string
  urgency: number
  workload: number
}

export type CalendarEventView = {
  allDay: boolean
  completed: boolean
  end: string

  id: string

  kind: "class" | "lab" | "office" | "deadline" | "study" | "other"

  location?: string

  start: string

  title: string
}

type Message = {
  id: number
  role: "assistant" | "user"
  text: string
}

const nav: { id: Screen; label: string; index: string }[] = [
  { id: "dashboard", label: "Priority feed", index: "01" },

  { id: "score", label: "Score anatomy", index: "02" },

  { id: "calendar", label: "Semester map", index: "03" },

  { id: "time", label: "Time allocator", index: "04" },

  { id: "copilot", label: "Quick add", index: "05" },

  { id: "advisor", label: "AI advisor", index: "06" },

  { id: "team", label: "Team deliverables", index: "07" },

  { id: "completed", label: "Completed", index: "08" },

  { id: "courses", label: "Courses", index: "09" },
]

function Button({
  children,

  disabled,

  onClick,

  tone = "default",

  type = "button",
}: {
  children: ReactNode

  disabled?: boolean

  onClick?: () => void

  tone?: "default" | "primary" | "danger"

  type?: "button" | "submit"
}) {
  return (
    <button
      className={`button button--${tone}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}

function Tag({
  children,

  tone = "neutral",
}: {
  children: ReactNode

  tone?: "neutral" | "blue" | "green" | "red"
}) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={`panel ${className}`}>{children}</section>
}

function Kicker({
  children,
  right,
}: {
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="kicker">
      <span>{children}</span>
      {right}
    </div>
  )
}

function dueLabel(value?: string) {
  if (!value) return "No hard deadline"

  const hours = Math.round((new Date(value).getTime() - Date.now()) / 3_600_000)

  if (hours < 0) return "Past due"

  if (hours < 24) return `Due in ${Math.max(1, hours)}h`

  return `Due in ${Math.ceil(hours / 24)} days`
}

function plannedLabel(value?: string) {
  if (!value) return undefined

  return `Start ${new Date(value).toLocaleString([], {
    day: "numeric",

    hour: "2-digit",

    minute: "2-digit",

    month: "short",
  })}`
}

function Bars({
  compact = false,
  task,
}: {
  compact?: boolean
  task: TaskView
}) {
  const vectors = [
    ["Urgency", task.urgency, dueLabel(task.dueDate)],

    [
      "Academic value",
      task.academicValue,
      `${task.classLevel} · ${task.assignmentType}`,
    ],

    ["Career value", task.careerValue, "Career alignment"],

    ["Goal alignment", task.goalAlignment, "Declared goal fit"],

    ["Consequence", task.consequence, "Cost of delay"],

    [
      "Workload",
      task.workload,
      `${Math.round(task.estimatedMinutes / 60)}h estimated`,
    ],

    ["Neglect factor", task.neglectFactor, "Time since last progress"],
  ] as const

  const items = compact ? vectors.slice(0, 4) : vectors

  return (
    <div className="bars">
      {items.map(([label, value, note]) => (
        <div className="bar-row" key={label}>
          <div className="bar-meta">
            <span>{label}</span>
            <span>{value}%</span>
          </div>
          <div className="bar-track">
            <span style={{ width: `${value}%` }} />
          </div>
          {!compact && <div className="bar-note">{note}</div>}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty-state">
      <span>NO TASK SIGNALS</span>
      <strong>Build your first priority</strong>
      <p>Add a task in plain language and Signal will score it from context.</p>
      <Button onClick={onAdd} tone="primary">
        Open quick add
      </Button>
    </div>
  )
}

function Dashboard({
  go,

  selected,

  setSelected,

  tasks,

  onCompleted,
}: {
  go: (screen: Screen) => void

  onCompleted: (task: TaskView) => void

  selected: number

  setSelected: (index: number) => void

  tasks: TaskView[]
}) {
  const upcomingTasks = tasks.filter((item) => item.status !== "done")

  const task = upcomingTasks[selected] ?? upcomingTasks[0]

  return (
    <div className="dashboard-grid">
      <Panel className="priority-panel">
        <Kicker right={<span>RANKED / LIVE</span>}>
          TODAY&apos;S PRIORITIES
        </Kicker>
        {!upcomingTasks.length ? (
          <EmptyState onAdd={() => go("copilot")} />
        ) : (
          <div className="priority-list">
            {upcomingTasks.map((item, index) => (
              <button
                className={`task ${selected === index ? "task--active" : ""} ${
                  item.status === "done" ? "task--done" : ""
                }`}
                key={item.id}
                onClick={() => setSelected(index)}
              >
                <span className="task-rank">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="task-main">
                  <strong>{item.title}</strong>
                  <small>
                    {item.status === "done"
                      ? "COMPLETED"
                      : `${item.courseCode ?? item.assignmentType} · ${
                          plannedLabel(item.plannedStart)
                            ? `${plannedLabel(item.plannedStart)} · `
                            : ""
                        }${dueLabel(item.dueDate)}`}
                  </small>
                </span>
                <span
                  className={`score ${
                    item.score >= 70
                      ? "score--blue"
                      : item.score >= 45
                        ? "score--green"
                        : "score--neutral"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation()

                    go("score")
                  }}
                >
                  {item.score}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>
      <Panel className="inspect-panel">
        <Kicker right={<Tag tone="blue">LIVE MODEL</Tag>}>
          WHY THIS SCORE?
        </Kicker>
        {task ? (
          <>
            <div className="inspect-title">
              <div>
                <small>SELECTED TASK</small>
                <strong>{task.title}</strong>
              </div>
              <span>{task.score}</span>
            </div>
            <Bars compact task={task} />
            <p className="explain">
              Signal combines deadline pressure with course level, assignment
              type, goals, and recent neglect. Scores recalculate whenever the
              task changes.
            </p>
            <Button onClick={() => go("score")}>View all 7 vectors</Button>
            <Button onClick={() => onCompleted(task)} tone="primary">
              Mark complete
            </Button>
          </>
        ) : (
          <div className="empty-state compact">
            <p>Select or add a task to inspect its score.</p>
          </div>
        )}
      </Panel>
      <button className="quick-strip" onClick={() => go("copilot")}>
        <span>+</span>
        <span>Quick Add:</span>
        <em>&quot;OS lab due Friday, 2 hours&quot;</em>
        <kbd>⌘ K</kbd>
      </button>
    </div>
  )
}

function CompletedScreen({
  onRestore,

  tasks,
}: {
  onRestore: (task: TaskView) => void

  tasks: TaskView[]
}) {
  const completed = tasks.filter((task) => task.status === "done")

  return (
    <Panel className="completed-panel">
      <Kicker right={<span>{completed.length} ARCHIVED</span>}>
        COMPLETED TASKS
      </Kicker>
      {completed.length ? (
        <div className="completed-list">
          {completed.map((task) => (
            <article className="completed-row" key={task.id}>
              <span>✓</span>
              <div>
                <strong>{task.title}</strong>
                <small>
                  {task.courseCode ?? task.assignmentType} · COMPLETED
                </small>
              </div>
              <Button onClick={() => onRestore(task)}>Restore</Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>No completed tasks yet</strong>
          <p>
            Checked assignments and micro-reviews will move here automatically.
          </p>
        </div>
      )}
    </Panel>
  )
}

function CoursesScreen({
  courses,
  onCreated,
  onUpdated,
  onRemoved,
}: {
  courses: AppCourse[]
  onCreated: (course: AppCourse, message: string) => void
  onUpdated: (course: AppCourse, message: string) => void
  onRemoved: (courseId: string, message: string) => void
}) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [level, setLevel] = useState<ClassLevel>("3000")
  const [color, setColor] = useState<AppCourse["color"]>("blue")
  const [editingId, setEditingId] = useState<string>()
  const [status, setStatus] = useState("")
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = editingId
        ? await updateCourseAction(editingId, { name, level, color })
        : await createCourseAction({ code, name, level, color })
      setStatus(result.ok ? result.message : result.error)
      if (!result.ok) return
      if (editingId) onUpdated(result.data, result.message)
      else onCreated(result.data, result.message)
      setEditingId(undefined)
      setCode("")
      setName("")
    })
  }

  function edit(course: AppCourse) {
    setEditingId(course.id)
    setCode(course.code)
    setName(course.name)
    setLevel(course.level)
    setColor(course.color)
    setStatus("")
  }

  function remove(courseId: string) {
    startTransition(async () => {
      const result = await deleteCourseAction(courseId)
      setStatus(result.ok ? result.message : result.error)
      if (result.ok) onRemoved(courseId, result.message)
    })
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <Kicker right={<span>{courses.length} COURSES</span>}>COURSE CATALOG</Kicker>
        {courses.length ? (
          <div className="divide-y divide-[var(--line)] px-4">
            {courses.map((course) => (
              <div className="flex items-center justify-between gap-3 py-3" key={course.id}>
                <div className="flex items-center gap-3">
                  <Tag tone={course.color === "green" ? "green" : course.color === "gray" ? "neutral" : "blue"}>{course.code}</Tag>
                  <div>
                    <strong className="block text-sm">{course.name}</strong>
                    <small className="text-[var(--muted)]">{course.level} LEVEL</small>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button disabled={pending} onClick={() => edit(course)}>Edit</Button>
                  <Button disabled={pending} onClick={() => remove(course.id)} tone="danger">Remove</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <strong>No courses yet</strong>
            <p>Add courses here, then link them to tasks when using Quick Add.</p>
          </div>
        )}
      </Panel>
      <Panel>
        <Kicker>{editingId ? "EDIT COURSE" : "ADD COURSE"}</Kicker>
        <form className="grid gap-3 p-4" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Course code
              <input
                className="w-full rounded-sm border border-[var(--line)] bg-[#0f1012] px-3 py-2 text-sm text-white"
                maxLength={20}
                onChange={(event) => setCode(event.target.value)}
                placeholder="ITSC 3155"
                readOnly={Boolean(editingId)}
                required
                value={code}
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Course name
              <input
                className="w-full rounded-sm border border-[var(--line)] bg-[#0f1012] px-3 py-2 text-sm text-white"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Level
              <select
                className="w-full rounded-sm border border-[var(--line)] bg-[#0f1012] px-3 py-2 text-sm text-white"
                onChange={(event) => setLevel(event.target.value as ClassLevel)}
                value={level}
              >
                {["1000", "2000", "3000", "4000", "graduate", "independent"].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              Color
              <select
                className="w-full rounded-sm border border-[var(--line)] bg-[#0f1012] px-3 py-2 text-sm text-white"
                onChange={(event) => setColor(event.target.value as AppCourse["color"])}
                value={color}
              >
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="gray">Gray</option>
              </select>
            </label>
          </div>
          {status && <p aria-live="polite" className="text-xs text-[var(--muted)]">{status}</p>}
          <div>
            <div className="flex gap-2">
              <Button disabled={pending} tone="primary" type="submit">
                {pending ? "Saving…" : editingId ? "Save course" : "Add course"}
              </Button>
              {editingId && (
                <Button
                  disabled={pending}
                  onClick={() => {
                    setEditingId(undefined)
                    setCode("")
                    setName("")
                    setStatus("")
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </form>
      </Panel>
    </div>
  )
}

function ScoreScreen({ task }: { task?: TaskView }) {
  if (!task) return <EmptyState onAdd={() => undefined} />

  return (
    <div className="modal-stage">
      <div className="underlay">
        <div />
        <div />
        <div />
      </div>
      <Panel className="score-modal">
        <div className="modal-head">
          <div>
            <Kicker>
              SCORE ATTRIBUTION / {task.id.slice(-6).toUpperCase()}
            </Kicker>
            <h2>{task.title}</h2>
            <p>
              Deterministic priority model · recalculated from live task data
            </p>
          </div>
          <div className="hero-score">
            <small>PRIORITY</small>
            <strong>{task.score}</strong>
            <span>/100</span>
          </div>
        </div>
        <Bars task={task} />
        <div className="logic-note">
          <span>MODEL NOTE</span>
          <p>
            {task.urgency >= 80
              ? "Deadline pressure is the strongest signal right now."
              : task.careerValue > task.academicValue
                ? "Career alignment currently outweighs academic value."
                : "Academic value and consequence are carrying this task."}
          </p>
        </div>
        <div className="formula">
          <span>WEIGHTED SCORE</span>
          <code>Σ(vector × weight) + recency signal = {task.score}</code>
        </div>
      </Panel>
    </div>
  )
}

function CalendarScreen({
  events,

  onImported,
}: {
  events: CalendarEventView[]

  onImported: (message: string) => void
}) {
  const [pending, startTransition] = useTransition()

  const [completingId, setCompletingId] = useState<string>()

  const [status, setStatus] = useState(
    "Ready for an .ics file, Canvas feed, or public calendar URL.",
  )

  const fileRef = useRef<HTMLInputElement>(null)

  const upcomingEvents = events.filter((event) => !event.completed)

  function importCalendar(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await importCalendarAction(formData)

        setStatus(result.ok ? result.message : result.error)

        if (result.ok) onImported(result.message)
      } catch {
        setStatus(
          "The import connection was interrupted. Retry once; existing events will be skipped.",
        )
      }
    })
  }

  function toggleCompleted(event: CalendarEventView) {
    setCompletingId(event.id)

    startTransition(async () => {
      try {
        const result = await setCalendarEventCompletedAction(
          event.id,
          !event.completed,
        )

        setStatus(result.ok ? result.message : result.error)

        if (result.ok) onImported(result.message)
      } catch {
        setStatus("Signal could not update that assignment.")
      } finally {
        setCompletingId(undefined)
      }
    })
  }

  return (
    <div className="calendar-layout">
      <Panel className="import-panel">
        <Kicker>IMPORT SOURCES</Kicker>
        <form action={importCalendar}>
          <button
            className="dropzone"
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            <span>ICS</span>
            <strong>Choose semester calendar</strong>
            <small>Canvas, Apple, Google, Outlook</small>
          </button>
          <input
            accept=".ics,text/calendar"
            className="file-input"
            name="file"
            ref={fileRef}
            type="file"
          />
          <label className="url-input">
            <span>ICS OR CANVAS FEED URL</span>
            <input
              name="url"
              placeholder="webcal://…instructure.com/feeds/…ics"
              type="text"
            />
          </label>
          <Button disabled={pending} tone="primary" type="submit">
            {pending ? "Parsing schedule…" : "Import calendar"}
          </Button>
        </form>
        <div className="import-status">
          <div>
            <i>SYS</i>
            <span>
              <strong>{pending ? "Import in progress" : "Parser ready"}</strong>
              <small>{status}</small>
            </span>
          </div>
        </div>
      </Panel>
      <Panel className="calendar-panel">
        <Kicker right={<span>{upcomingEvents.length} EVENTS</span>}>
          SEMESTER MAP / UPCOMING
        </Kicker>
        <div className="event-list">
          {upcomingEvents.length ? (
            upcomingEvents.slice(0, 14).map((event) => {
              const start = new Date(event.start)

              return (
                <article
                  className={`event-row event-row--${event.kind} ${
                    event.completed ? "event-row--completed" : ""
                  }`}
                  key={event.id}
                >
                  <time dateTime={event.start}>
                    <b>
                      {start.toLocaleDateString(undefined, { day: "2-digit" })}
                    </b>
                    <span>
                      {start
                        .toLocaleDateString(undefined, { month: "short" })
                        .toUpperCase()}
                    </span>
                  </time>
                  <div>
                    <small>
                      {event.allDay
                        ? "ALL DAY"
                        : start.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                    </small>
                    <strong>{event.title}</strong>
                    {event.location && <span>{event.location}</span>}
                  </div>
                  {event.kind === "deadline" ? (
                    <button
                      className="complete-toggle"
                      disabled={completingId === event.id}
                      onClick={() => toggleCompleted(event)}
                      type="button"
                    >
                      {event.completed ? "COMPLETED" : "MARK COMPLETE"}
                    </button>
                  ) : (
                    <Tag tone={event.kind === "lab" ? "green" : "blue"}>
                      {event.kind}
                    </Tag>
                  )}
                </article>
              )
            })
          ) : (
            <div className="empty-state">
              <strong>No calendar context yet</strong>
              <p>
                Import a real .ics calendar to map classes, labs, and deadlines.
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

function TimeScreen({
  events,

  onReplanned,

  tasks,
}: {
  events: CalendarEventView[]

  onReplanned: (message: string) => void

  tasks: TaskView[]
}) {
  const [pending, startTransition] = useTransition()

  const activeTasks = tasks.filter((task) => task.status !== "done")

  const demand = Math.round(
    activeTasks.reduce((total, task) => total + task.estimatedMinutes, 0) / 60,
  )

  const rows = useMemo(() => {
    const result: Array<[string, string, Array<["busy" | "free", number]>]> = []

    const cursor = new Date()

    cursor.setHours(0, 0, 0, 0)

    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      const day = new Date(cursor)

      day.setDate(day.getDate() + dayIndex)

      const windowStart = new Date(day)

      windowStart.setHours(8, 0, 0, 0)

      const windowEnd = new Date(day)

      windowEnd.setHours(20, 0, 0, 0)

      const intervals = events

        .filter((event) => event.kind !== "deadline" && !event.completed)

        .map((event) => [
          Math.max(windowStart.getTime(), new Date(event.start).getTime()),

          Math.min(windowEnd.getTime(), new Date(event.end).getTime()),
        ])

        .filter(([start, end]) => end > start)

        .sort((a, b) => a[0] - b[0])

      const merged: Array<[number, number]> = []

      for (const interval of intervals) {
        const last = merged[merged.length - 1]

        if (last && interval[0] <= last[1])
          last[1] = Math.max(last[1], interval[1])
        else merged.push([interval[0], interval[1]])
      }

      const cells: Array<["busy" | "free", number]> = []

      let position = windowStart.getTime()

      for (const [start, end] of merged) {
        if (start > position)
          cells.push(["free", ((start - position) / 43_200_000) * 100])

        cells.push(["busy", ((end - start) / 43_200_000) * 100])

        position = end
      }

      if (position < windowEnd.getTime()) {
        cells.push([
          "free",
          ((windowEnd.getTime() - position) / 43_200_000) * 100,
        ])
      }

      const busyMinutes = merged.reduce(
        (total, [start, end]) => total + (end - start) / 60_000,
        0,
      )

      const freeHours = Math.max(0, 12 - busyMinutes / 60)

      result.push([
        day.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),

        `${freeHours.toFixed(freeHours % 1 ? 1 : 0)}h free`,

        cells,
      ])
    }

    return result
  }, [events])

  const capacity = Math.round(
    rows.reduce((total, [, label]) => total + Number.parseFloat(label), 0),
  )

  const over = Math.max(0, demand - capacity)

  function replan() {
    startTransition(async () => {
      const result = await replanTasksAction()

      onReplanned(result.ok ? result.message : result.error)
    })
  }

  return (
    <div className="time-grid">
      <Panel className="timeline-panel">
        <Kicker right={<span>08:00 — 20:00</span>}>AVAILABLE CAPACITY</Kicker>
        <div className="time-axis">
          <span>08</span>
          <span>11</span>
          <span>14</span>
          <span>17</span>
          <span>20</span>
        </div>
        <div className="timeline-list">
          {rows.map(([day, total, cells]) => (
            <div className="timeline-row" key={day}>
              <b>{day}</b>
              <div className="timeline-bar">
                {cells.map(([type, width], index) => (
                  <span
                    className={type}
                    key={index}
                    style={{ width: `${width}%` }}
                  />
                ))}
              </div>
              <small>{total}</small>
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="forecast-panel">
        <Kicker>WORKLOAD FORECAST</Kicker>
        <div className="forecast-numbers">
          <div>
            <strong>{demand}</strong>
            <span>HRS DEMAND</span>
          </div>
          <i>vs</i>
          <div>
            <strong>{capacity}</strong>
            <span>HRS FREE</span>
          </div>
        </div>
        <Tag tone={over ? "red" : "green"}>
          {over ? `CRUNCH ALERT: −${over} HRS` : "CAPACITY HEALTHY"}
        </Tag>
        <div className="capacity-track">
          <span
            style={{
              width: `${Math.min(100, (demand / Math.max(capacity, 1)) * 100)}%`,
            }}
          />
        </div>
        <p>
          Signal ranks the highest-consequence work first and leaves a 30-minute
          context-switch buffer.
        </p>
        <Button
          disabled={pending || !tasks.length}
          onClick={replan}
          tone={over ? "danger" : "primary"}
        >
          {pending ? "Replanning…" : "Replan priority work"}
        </Button>
      </Panel>
      <div className="warning-box">
        <span>!</span>
        <div>
          <strong>{over ? "CAPACITY CONFLICT" : "PLAN CHECK"}</strong>
          <p>
            {over
              ? `${over} hours need a new home before the next deadline.`
              : "Your current workload fits the available estimate."}
          </p>
        </div>
        <Button onClick={replan}>Protect focus blocks</Button>
      </div>
    </div>
  )
}

function parseQuickTask(value: string) {
  const lower = value.toLowerCase()

  const duration = lower.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/)

  const estimatedMinutes = duration ? Math.round(Number(duration[1]) * 60) : 60

  let dueDate: Date | undefined

  if (lower.includes("tomorrow")) {
    dueDate = new Date()

    dueDate.setDate(dueDate.getDate() + 1)

    dueDate.setHours(17, 0, 0, 0)
  } else if (lower.includes("friday")) {
    dueDate = new Date()

    const distance = (5 - dueDate.getDay() + 7) % 7 || 7

    dueDate.setDate(dueDate.getDate() + distance)

    dueDate.setHours(17, 0, 0, 0)
  }

  const assignmentType: AssignmentType = lower.includes("exam")
    ? "exam"
    : lower.includes("lab")
      ? "lab"
      : lower.includes("project")
        ? "project"
        : lower.includes("read")
          ? "reading"
          : lower.includes("interview") || lower.includes("leetcode")
            ? "career"
            : "problem-set"

  const levelMatch = lower.match(/\b([1-4])\d{3}\b/)

  const classLevel = (
    levelMatch
      ? `${levelMatch[1]}000`
      : assignmentType === "career"
        ? "independent"
        : "3000"
  ) as ClassLevel

  const title = value

    .replace(/\b(?:due\s+)?(?:tomorrow|friday)\b/gi, "")

    .replace(/\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours)\b/gi, "")

    .replace(/\s+/g, " ")

    .replace(/[,\s-]+$/, "")

    .trim()

  return {
    assignmentType,

    careerAlignment: assignmentType === "career" ? 95 : 35,

    classLevel,

    consequence: assignmentType === "exam" ? 90 : 62,

    dueDate: dueDate?.toISOString(),

    estimatedMinutes,

    goalAlignment: assignmentType === "career" ? 92 : 68,

    title: title || "New study task",
  }
}

function QuickAdd({
  courses,
  onAdded,

  onOpenAdvisor,
}: {
  courses: AppCourse[]
  onAdded: (message: string) => void

  onOpenAdvisor: () => void
}) {
  const [value, setValue] = useState("")

  const [courseId, setCourseId] = useState("")

  const [status, setStatus] = useState(
    "Describe the work, duration, and deadline.",
  )

  const [pending, startTransition] = useTransition()

  const parsed = useMemo(
    () => parseQuickTask(value || "study leetcode 2 hours friday"),
    [value],
  )

  function submit(event: FormEvent) {
    event.preventDefault()

    if (!value.trim()) return

    startTransition(async () => {
      const result = await createTaskAction({
        ...parseQuickTask(value),
        ...(courseId ? { courseId } : {}),
      })

      setStatus(result.ok ? result.message : result.error)

      if (result.ok) {
        setValue("")

        onAdded(result.message)
      }
    })
  }

  return (
    <div className="copilot-stage">
      <div className="copilot-orbit">
        <span>CAPTURE</span>
        <span>SCORE</span>
        <span>PLACE</span>
      </div>
      <Panel className="copilot-box">
        <Kicker right={<Tag tone="green">LOCAL PARSER</Tag>}>
          SIGNAL QUICK ADD
        </Kicker>
        <form onSubmit={submit}>
          <div className="prompt-line">
            <span>›</span>
            <input
              aria-label="Task in natural language"
              onChange={(event) => setValue(event.target.value)}
              placeholder="OS lab due Friday, 2 hours"
              value={value}
            />
            <kbd>↵</kbd>
          </div>
          <div className="parse-label">INSTANT PARSE / READY TO SCORE</div>
          <label className="mx-5 grid gap-1 text-xs text-[var(--muted)]">
            Course
            <select
              className="rounded-sm border border-[var(--line)] bg-[#0f1012] px-3 py-2 text-sm text-white"
              onChange={(event) => setCourseId(event.target.value)}
              value={courseId}
            >
              <option value="">No course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.name}
                </option>
              ))}
            </select>
          </label>
          <div className="parse-grid">
            <div>
              <small>TITLE</small>
              <strong>{parsed.title}</strong>
            </div>
            <div>
              <small>DURATION</small>
              <strong>{parsed.estimatedMinutes} min</strong>
            </div>
            <div>
              <small>CONTEXT</small>
              <strong>
                {parsed.classLevel} · {parsed.assignmentType}
              </strong>
            </div>
          </div>
          <div className="copilot-actions">
            <span>{status}</span>
            <Button
              disabled={pending || !value.trim()}
              tone="primary"
              type="submit"
            >
              {pending ? "Adding…" : "Add to plan"}
            </Button>
          </div>
        </form>
      </Panel>
      <button className="privacy-note" onClick={onOpenAdvisor}>
        Need more? Open the planning advisor
      </button>
    </div>
  )
}

export function AdvisorScreen({
  onOpenTeam,

  onChanged,

  selectedTask,
}: {
  onChanged: (message: string) => void

  onOpenTeam: () => void

  selectedTask?: TaskView
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,

      role: "assistant",

      text: "Ask Gemini for planning advice using details you choose to share. Switch to Local commands to add tasks, explain scores, parse a syllabus, build an exam plan, open Team Deliverables, or replan. Review and approve local changes before saving.",
    },
  ])

  const [value, setValue] = useState("")

  const [mode, setMode] = useState<"gemini" | "local">("gemini")
  const messageId = useRef(1)
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [proposal, setProposal] = useState<{
    prompt: string
    command: string
  } | null>(null)

  const [pending, startTransition] = useTransition()

  function reply(text: string) {
    setMessages((current) => [
      ...current.slice(-39),
      { id: ++messageId.current, role: "assistant", text },
    ])
  }

  function submit(event: FormEvent) {
    event.preventDefault()

    const prompt = value.trim()

    if (!prompt || pending || proposal) return

    setMessages((current) => [
      ...current.slice(-39),
      { id: ++messageId.current, role: "user", text: prompt },
    ])

    setValue("")

    if (mode === "gemini") {
      const history = recentChatHistory(chatHistory, prompt)
      startTransition(async () => {
        try {
          const result = await advisorChatAction({ prompt, history })
          if (result.ok) {
            reply(result.text)
            setChatHistory([
              ...history,
              { role: "user", text: prompt },
              { role: "assistant", text: result.text },
            ])
          } else {
            reply(
              `${result.error} You can switch to Local commands to explain a score or review a planning change. Nothing was saved.`,
            )
          }
        } catch {
          reply(
            "The chat connection failed. Local commands are still available. Nothing was saved.",
          )
        }
      })
      return
    }

    const command = classifyLocalCommand(prompt)
    if (["add", "exam", "syllabus", "replan"].includes(command)) {
      setProposal({ prompt, command })
      reply(
        "Review the local command below. It will run only after you approve it.",
      )
      return
    }
    runLocalCommand(prompt)
  }

  function runLocalCommand(prompt: string) {
    const lower = prompt.toLowerCase()
    const command = classifyLocalCommand(prompt)

    startTransition(async () => {
      try {
        if (command === "syllabus") {
          const result = await createWorkflowAction({
            prompt,
            workflow: "syllabus",
          })

          const message = result.ok ? result.message : result.error

          reply(message)

          if (result.ok) onChanged(message)

          return
        }

        if (command === "exam") {
          const result = await createWorkflowAction({
            prompt,
            workflow: "exam",
          })

          const message = result.ok ? result.message : result.error

          reply(message)

          if (result.ok) onChanged(message)

          return
        }

        if (command === "team") {
          reply(
            "Open Team Deliverables to create a project, choose registered teammates, and assign milestones.",
          )

          onOpenTeam()

          return
        }

        if (command === "replan") {
          const result = await replanTasksAction(
            lower.includes("auto-reschedule") ? "week" : "fortnight",
          )

          const message = result.ok ? result.message : result.error

          reply(message)

          if (result.ok) onChanged(message)

          return
        }

        if (command === "explain") {
          reply(
            selectedTask
              ? `${selectedTask.title} is ${selectedTask.score}/100. Urgency contributes ${selectedTask.urgency}, academic value ${selectedTask.academicValue}, and goal alignment ${selectedTask.goalAlignment}.`
              : "Add or select a task first, then I can explain every score vector.",
          )

          return
        }

        if (command === "add") {
          const result = await createTaskAction(
            parseQuickTask(prompt.replace(/^add\s+/i, "")),
          )

          const message = result.ok ? result.message : result.error

          reply(message)

          if (result.ok) onChanged(message)

          return
        }

        reply(
          selectedTask
            ? `Start with ${selectedTask.title}. Its ${selectedTask.score} score makes it the strongest next move; protect ${selectedTask.estimatedMinutes} minutes.`
            : "Your plan is empty. Try “add calculus problem set due tomorrow, 90 minutes.”",
        )
      } catch {
        reply(
          "The local command could not finish. Refresh your plan to check its current state before retrying.",
        )
      }
    })
  }

  function suggest(prompt: string) {
    setMode("local")
    setValue(prompt)
  }

  return (
    <div className="advisor-stage">
      <div className="advisor-backdrop">
        <span>CONTEXT</span>
        <strong>TASKS + DEADLINES + CAPACITY</strong>
        <div />
      </div>
      <Panel className="advisor-drawer">
        <div className="drawer-handle" />
        <Kicker
          right={
            <Tag tone="green">
              {mode === "gemini" ? "GOOGLE GEMINI" : "LOCAL COMMANDS"}
            </Tag>
          }
        >
          AI ADVISOR
        </Kicker>
        <div className="flex flex-wrap gap-2 px-4 py-2">
          <button
            type="button"
            aria-pressed={mode === "gemini"}
            disabled={pending || Boolean(proposal)}
            onClick={() => setMode("gemini")}
            className="rounded border border-[var(--line)] px-3 py-2 text-xs aria-pressed:bg-[var(--blue)]"
          >
            Ask Gemini
          </button>
          <button
            type="button"
            aria-pressed={mode === "local"}
            disabled={pending || Boolean(proposal)}
            onClick={() => setMode("local")}
            className="rounded border border-[var(--line)] px-3 py-2 text-xs aria-pressed:bg-[var(--blue)]"
          >
            Local commands
          </button>
          <button
            type="button"
            disabled={pending || Boolean(proposal)}
            onClick={() => {
              setChatHistory([])
              setMessages([])
            }}
            className="ml-auto px-2 text-xs text-[var(--muted)]"
          >
            Clear chat
          </button>
        </div>
        <p className="px-4 pb-2 text-xs leading-relaxed text-[var(--muted)]">
          In Gemini mode, your submitted prompts and recent AI conversation are
          processed by Google. Stored tasks and calendar records are not
          attached. Share only details you choose. AI advice is not saved to
          your plan.
        </p>
        <div className="chat-log" aria-live="polite">
          {messages.map((message) => (
            <div
              className={`chat-bubble chat-bubble--${message.role}`}
              key={message.id}
            >
              <small>{message.role === "user" ? "YOU" : "SIGNAL"}</small>
              <p>{message.text}</p>
            </div>
          ))}
          {pending && (
            <div className="typing">
              {mode === "gemini" ? "ASKING GEMINI…" : "RUNNING LOCAL COMMAND…"}
            </div>
          )}
        </div>
        {proposal && (
          <div
            role="region"
            aria-label="Review local command"
            className="mx-4 mb-3 rounded border border-[var(--line)] bg-[#151c29] p-3 text-xs"
          >
            <strong>
              Approve{" "}
              {proposal.command === "replan"
                ? "replanning"
                : "creating plan items"}
              ?
            </strong>
            <p className="my-2 max-h-28 overflow-auto whitespace-pre-wrap">
              {proposal.prompt}
            </p>
            <p className="mb-3 text-[var(--muted)]">
              {proposal.command === "replan"
                ? "This may move planned task start times using the existing scheduler."
                : "This runs the existing local parser and saves its generated tasks/calendar items. Review the result in your plan."}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                tone="primary"
                onClick={() => {
                  const prompt = proposal.prompt
                  setProposal(null)
                  runLocalCommand(prompt)
                }}
              >
                Approve and apply
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  setProposal(null)
                  reply("Command cancelled. Nothing was saved.")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="suggestion-row">
          <button
            disabled={pending || Boolean(proposal)}
            onClick={() => suggest("Explain this score")}
          >
            Explain score
          </button>
          <button
            disabled={pending || Boolean(proposal)}
            onClick={() => suggest("Auto-reschedule my focus blocks this week")}
          >
            Auto-reschedule
          </button>
          <button
            disabled={pending || Boolean(proposal)}
            onClick={() =>
              suggest(
                "Create a 10-day spaced repetition study plan for my midterm in two weeks",
              )
            }
          >
            Exam plan
          </button>
          <button
            disabled={pending || Boolean(proposal)}
            onClick={() =>
              suggest(
                "Parse this syllabus:\nAssignment 1 — September 12\nMidterm — October 8\nWeekly reading — October 15",
              )
            }
          >
            Syllabus
          </button>
          <button
            disabled={pending || Boolean(proposal)}
            onClick={() => {
              setValue("Open Team Deliverables to assign project work.")
              onOpenTeam()
            }}
          >
            Team deliverables
          </button>
        </div>
        <form className="chat-form" onSubmit={submit}>
          <textarea
            aria-label="Message Signal advisor"
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a syllabus, build an exam plan, assign team work, or auto-reschedule…"
            rows={3}
            value={value}
            maxLength={mode === "gemini" ? MAX_PROMPT_CHARS : 20000}
            disabled={pending || Boolean(proposal)}
          />
          <Button
            disabled={pending || Boolean(proposal) || !value.trim()}
            tone="primary"
            type="submit"
          >
            Send
          </Button>
        </form>
        <p className="offline-note">
          Local commands work without Gemini and do not send prompts to Google.
          Gemini replies are proposals, not completed changes. Use Local
          commands and approve any changes you want to save.
        </p>
      </Panel>
    </div>
  )
}

export default function SignalApp({
  currentUser,

  initialCourses,

  initialEvents,

  initialTasks,
}: {
  currentUser: AppUser

  initialCourses: AppCourse[]

  initialEvents: CalendarEventView[]

  initialTasks: TaskView[]
}) {
  const router = useRouter()

  const [authPending, startAuthTransition] = useTransition()

  const [, startMutationTransition] = useTransition()

  const [screen, setScreen] = useState<Screen>("dashboard")

  const [selected, setSelected] = useState(0)

  const [tasks, setTasks] = useState(initialTasks)

  const [events, setEvents] = useState(initialEvents)

  const [courses, setCourses] = useState(initialCourses)

  const [notice, setNotice] = useState("")

  const active = nav.find((item) => item.id === screen)!

  useEffect(() => setTasks(initialTasks), [initialTasks])

  useEffect(() => setEvents(initialEvents), [initialEvents])

  useEffect(() => setCourses(initialCourses), [initialCourses])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()

        setScreen("copilot")
      }
    }

    window.addEventListener("keydown", listener)

    return () => window.removeEventListener("keydown", listener)
  }, [])

  function refresh(message: string) {
    setNotice(message)

    router.refresh()
  }

  function signOut() {
    startAuthTransition(async () => {
      await logoutAction()
      try {
        await signOutFirebase(getFirebaseClientAuth())
      } catch {
        // The server session is already cleared; client config may be unavailable locally.
      }

      router.refresh()
    })
  }

  function setCompleted(task: TaskView, completed = true) {
    startMutationTransition(async () => {
      const result = await setTaskCompletedAction(task.id, completed)

      refresh(result.ok ? result.message : result.error)
    })
  }

  const upcomingTasks = tasks.filter((task) => task.status !== "done")

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>SIGNAL</strong>
            <small>DECISION SYSTEM</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              className={screen === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setScreen(item.id)}
            >
              <span>{item.index}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="side-status">
          <i />
          <div>
            <strong>{currentUser.username?.toUpperCase()}</strong>
            <small>
              {tasks.length} TASKS · {events.length} EVENTS
            </small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div>
            <span className="mobile-logo">SIGNAL</span>
            <Tag tone="blue">LIVE PLAN</Tag>
            <span className="breadcrumb">/ {active.label.toUpperCase()}</span>
          </div>
          <div>
            <Tag tone="green">PRIVATE / {currentUser.username}</Tag>
            <Button onClick={() => setScreen("advisor")}>Ask advisor</Button>
            <Button disabled={authPending} onClick={signOut}>
              {authPending ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </header>
        {notice && (
          <button className="notice" onClick={() => setNotice("")}>
            {notice}
            <span>DISMISS</span>
          </button>
        )}
        <div className="screen-title">
          <div>
            <small>
              SCREEN {active.index} / {String(nav.length).padStart(2, "0")}
            </small>
            <h1>{active.label}</h1>
          </div>
          <span>
            {new Date()
              .toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })
              .toUpperCase()}
          </span>
        </div>
        <div className="screen">
          {screen === "dashboard" && (
            <Dashboard
              go={setScreen}
              onCompleted={(task) => setCompleted(task)}
              selected={selected}
              setSelected={setSelected}
              tasks={tasks}
            />
          )}
          {screen === "score" && (
            <ScoreScreen task={upcomingTasks[selected] ?? upcomingTasks[0]} />
          )}
          {screen === "calendar" && (
            <CalendarScreen events={events} onImported={refresh} />
          )}
          {screen === "time" && (
            <TimeScreen events={events} onReplanned={refresh} tasks={tasks} />
          )}
          {screen === "copilot" && (
            <QuickAdd
              courses={courses}
              onAdded={refresh}
              onOpenAdvisor={() => setScreen("advisor")}
            />
          )}
          {screen === "advisor" && (
            <AdvisorScreen
              onChanged={refresh}
              onOpenTeam={() => setScreen("team")}
              selectedTask={upcomingTasks[selected] ?? upcomingTasks[0]}
            />
          )}
          {screen === "team" && (
            <TeamDeliverables
              currentUserId={currentUser.id}
              onChanged={refresh}
            />
          )}
          {screen === "completed" && (
            <CompletedScreen
              onRestore={(task) => setCompleted(task, false)}
              tasks={tasks}
            />
          )}
          {screen === "courses" && (
            <CoursesScreen
              courses={courses}
              onCreated={(course, message) => {
                setCourses((current) =>
                  [...current, course].sort((left, right) => left.code.localeCompare(right.code)),
                )
                refresh(message)
              }}
              onUpdated={(course, message) => {
                setCourses((current) =>
                  current.map((item) => item.id === course.id ? course : item),
                )
                refresh(message)
              }}
              onRemoved={(courseId, message) => {
                setCourses((current) => current.filter((course) => course.id !== courseId))
                refresh(message)
              }}
            />
          )}
        </div>
        <div className="mobile-nav">
          {nav.map((item) => (
            <button
              className={screen === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setScreen(item.id)}
            >
              {item.index}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
