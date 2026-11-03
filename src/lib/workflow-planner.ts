import type { AssignmentType, ClassLevel } from './scoring'

export type PlannedTask = {
  assignmentType: AssignmentType
  classLevel: ClassLevel
  consequence: number
  dueDate: string
  estimatedMinutes: number
  goalAlignment: number
  title: string
}

export type PlannedEvent = {
  allDay: boolean
  end: string
  kind: 'deadline' | 'study'
  start: string
  title: string
}

export type WorkflowPlan = {
  events: PlannedEvent[]
  label: string
  tasks: PlannedTask[]
}

const monthPattern =
  /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?/i
const numericDatePattern = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/
const isoDatePattern = /\b\d{4}-\d{2}-\d{2}\b/

function dateFromText(text: string, now: Date) {
  if (/\bin\s+(?:two|2)\s+weeks?\b/i.test(text)) {
    const result = new Date(now)
    result.setDate(result.getDate() + 14)
    return result
  }
  const match = text.match(isoDatePattern) ?? text.match(monthPattern) ?? text.match(numericDatePattern)
  if (!match) return null
  const hasYear = /\d{4}/.test(match[0])
  const candidate = new Date(hasYear ? match[0] : `${match[0]}, ${now.getFullYear()}`)
  if (Number.isNaN(candidate.getTime())) return null
  if (!hasYear && candidate.getTime() < now.getTime() - 2_592_000_000) {
    candidate.setFullYear(candidate.getFullYear() + 1)
  }
  return candidate
}

function atTime(date: Date, hour: number) {
  const result = new Date(date)
  result.setHours(hour, 0, 0, 0)
  return result
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000)
}

function taskType(title: string): AssignmentType {
  const value = title.toLowerCase()
  if (value.includes('exam') || value.includes('midterm') || value.includes('test')) return 'exam'
  if (value.includes('read')) return 'reading'
  if (value.includes('lab')) return 'lab'
  if (value.includes('project') || value.includes('proposal') || value.includes('deck')) return 'project'
  return 'problem-set'
}

function cleanTitle(line: string) {
  return line
    .replace(isoDatePattern, '')
    .replace(monthPattern, '')
    .replace(numericDatePattern, '')
    .replace(/\b(?:due|deadline|on|at)\b/gi, '')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function buildSyllabusPlan(prompt: string, now = new Date()): WorkflowPlan {
  const tasks: PlannedTask[] = []
  const events: PlannedEvent[] = []
  for (const line of prompt.split(/\n|;/).map((value) => value.trim()).filter(Boolean)) {
    const parsedDate = dateFromText(line, now)
    if (!parsedDate) continue
    const due = atTime(parsedDate, 17)
    const title = cleanTitle(line) || 'Course deadline'
    const assignmentType = taskType(title)
    tasks.push({
      assignmentType,
      classLevel: '3000',
      consequence: assignmentType === 'exam' ? 90 : 68,
      dueDate: due.toISOString(),
      estimatedMinutes: assignmentType === 'reading' ? 60 : 120,
      goalAlignment: 72,
      title,
    })
    events.push({
      allDay: false,
      end: addHours(due, 1).toISOString(),
      kind: 'deadline',
      start: due.toISOString(),
      title,
    })
  }
  return { events, label: 'syllabus deadlines', tasks }
}

export function buildExamPlan(prompt: string, now = new Date()): WorkflowPlan {
  const examDate = dateFromText(prompt, now) ?? addHours(now, 24 * 14)
  const exam = atTime(examDate, 9)
  const kickoff = new Date(exam)
  kickoff.setDate(kickoff.getDate() - 14)
  kickoff.setHours(8, 0, 0, 0)
  const offsets = [0, 2, 4, 6, 7, 8, 9, 10, 11, 13]
  const topic = cleanTitle(prompt.replace(/\bin\s+(?:two|2)\s+weeks?\b/i, '')) || 'Midterm'
  const tasks: PlannedTask[] = offsets.map((offset, index) => {
    const session = new Date(kickoff)
    session.setDate(session.getDate() + offset)
    return {
      assignmentType: 'exam',
      classLevel: '3000',
      consequence: 92,
      dueDate: addHours(session, 2).toISOString(),
      estimatedMinutes: 120,
      goalAlignment: 88,
      title: `${topic} · Session ${index + 1}/10 · micro-review`,
    }
  })
  const events: PlannedEvent[] = tasks.map((task) => ({
    allDay: false,
    end: task.dueDate,
    kind: 'study',
    start: addHours(new Date(task.dueDate), -2).toISOString(),
    title: task.title,
  }))
  return { events, label: 'spaced-repetition sessions', tasks }
}

function membersFromPrompt(prompt: string) {
  const match = prompt.match(/members?\s*:\s*([^\n]+)/i)
  if (!match) return ['Unassigned']
  const members = match[1]
    .split(/,|&|\band\b/i)
    .map((name) => name.replace(/[.\s]+$/g, '').trim())
    .filter(Boolean)
  return members.length ? members : ['Unassigned']
}

export function buildTeamPlan(prompt: string, now = new Date()): WorkflowPlan {
  const finalDate = dateFromText(prompt, now) ?? addHours(now, 24 * 7)
  const freeze = atTime(addHours(finalDate, -72), 17)
  const members = membersFromPrompt(prompt)
  const deliverables = ['Literature Review', 'Methodology', 'Slide Deck']
  const tasks = deliverables.map((deliverable, index): PlannedTask => {
    const due = new Date(freeze)
    due.setDate(due.getDate() - (deliverables.length - index - 1))
    return {
      assignmentType: 'project',
      classLevel: '3000',
      consequence: 82,
      dueDate: due.toISOString(),
      estimatedMinutes: 180,
      goalAlignment: 84,
      title: `[${members[index % members.length]}] ${deliverable}`,
    }
  })
  return {
    events: [
      {
        allDay: false,
        end: addHours(freeze, 1).toISOString(),
        kind: 'deadline',
        start: freeze.toISOString(),
        title: 'Internal peer-review freeze',
      },
    ],
    label: 'team sub-deliverables',
    tasks,
  }
}
