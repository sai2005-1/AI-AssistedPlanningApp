export type ParsedCalendarEvent = {
  allDay: boolean
  completed: boolean
  description?: string
  end: string
  kind: 'class' | 'lab' | 'office' | 'deadline' | 'study' | 'other'
  location?: string
  start: string
  title: string
  uid: string
}

type RawProperty = {
  params: Record<string, string>
  value: string
}

type RawEvent = Record<string, RawProperty>

const dayIndexes: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

function parseDate(property?: RawProperty): { allDay: boolean; date: Date } | null {
  if (!property) return null
  const normalized = property.value.trim()
  if (/^\d{8}$/.test(normalized)) {
    return {
      allDay: true,
      date: new Date(
        Date.UTC(
          Number(normalized.slice(0, 4)),
          Number(normalized.slice(4, 6)) - 1,
          Number(normalized.slice(6, 8)),
        ),
      ),
    }
  }

  const match = normalized.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!match) return null
  const parts = match.slice(1, 7).map(Number)
  const date = match[7]
    ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]))
    : new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])
  return { allDay: false, date }
}

function clean(value = '') {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function inferKind(title: string): ParsedCalendarEvent['kind'] {
  const value = title.toLowerCase()
  if (value.includes('office hour')) return 'office'
  if (value.includes('lab')) return 'lab'
  if (value.includes('due') || value.includes('deadline') || value.includes('exam'))
    return 'deadline'
  if (value.includes('study') || value.includes('review')) return 'study'
  if (value.includes('class') || /\b[A-Z]{2,5}\s?\d{3,4}\b/i.test(title)) return 'class'
  return 'other'
}

function expandEvent(raw: RawEvent): ParsedCalendarEvent[] {
  const parsedStart = parseDate(raw.DTSTART)
  const summary = clean(raw.SUMMARY?.value)
  if (!parsedStart || !summary || raw.STATUS?.value.toUpperCase() === 'CANCELLED') return []
  const parsedEnd = parseDate(raw.DTEND)
  const parsedDuration = raw.DURATION?.value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  )
  const durationFromProperty = parsedDuration
    ? Number(parsedDuration[1] ?? 0) * 86_400_000 +
      Number(parsedDuration[2] ?? 0) * 3_600_000 +
      Number(parsedDuration[3] ?? 0) * 60_000 +
      Number(parsedDuration[4] ?? 0) * 1000
    : 0
  const dateDuration = parsedEnd ? parsedEnd.date.getTime() - parsedStart.date.getTime() : 0
  const duration =
    (dateDuration > 0 && dateDuration) ||
    durationFromProperty ||
    (parsedStart.allDay ? 86_400_000 : 3_600_000)
  const uid = clean(raw.UID?.value) || `signal-${parsedStart.date.getTime()}-${summary}`
  const base = {
    allDay: parsedStart.allDay,
    completed:
      raw.STATUS?.value.toUpperCase() === 'COMPLETED' ||
      raw['X-CANVAS-COMPLETED']?.value.toUpperCase() === 'TRUE',
    description: clean(raw.DESCRIPTION?.value).slice(0, 2000),
    kind:
      uid.toLowerCase().includes('assignment') || clean(raw.DESCRIPTION?.value).toLowerCase().includes('assignment')
        ? ('deadline' as const)
        : inferKind(summary),
    location: clean(raw.LOCATION?.value).slice(0, 200),
    title: summary.slice(0, 200),
    uid,
  }

  const makeEvent = (start: Date): ParsedCalendarEvent => ({
    ...base,
    end: new Date(start.getTime() + duration).toISOString(),
    start: start.toISOString(),
  })

  if (!raw.RRULE) return [makeEvent(parsedStart.date)]
  const rule = Object.fromEntries(
    raw.RRULE.value.split(';').map((part) => {
      const [key, value] = part.split('=')
      return [key, value]
    }),
  )
  const count = Math.min(Number(rule.COUNT || 100), 100)
  const until = rule.UNTIL ? parseDate({ params: {}, value: rule.UNTIL })?.date : null
  const horizon = Math.min(
    until?.getTime() ?? parsedStart.date.getTime() + 180 * 86_400_000,
    parsedStart.date.getTime() + 365 * 86_400_000,
  )
  const events: ParsedCalendarEvent[] = []

  if (rule.FREQ === 'WEEKLY' && rule.BYDAY) {
    const targetDays = rule.BYDAY.split(',').map((day) => dayIndexes[day]).filter(Number.isInteger)
    const cursor = new Date(parsedStart.date)
    while (cursor.getTime() <= horizon && events.length < count) {
      if (cursor >= parsedStart.date && targetDays.includes(cursor.getDay())) {
        events.push(makeEvent(new Date(cursor)))
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return events
  }

  const incrementDays = rule.FREQ === 'DAILY' ? 1 : rule.FREQ === 'WEEKLY' ? 7 : 0
  if (!incrementDays) return [makeEvent(parsedStart.date)]
  const cursor = new Date(parsedStart.date)
  while (cursor.getTime() <= horizon && events.length < count) {
    events.push(makeEvent(new Date(cursor)))
    cursor.setDate(cursor.getDate() + incrementDays)
  }
  return events
}

export function parseICS(source: string): ParsedCalendarEvent[] {
  const unfolded = source.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)
  const events: ParsedCalendarEvent[] = []
  let current: RawEvent | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line.toUpperCase() === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (line.toUpperCase() === 'END:VEVENT') {
      if (current) events.push(...expandEvent(current))
      current = null
      continue
    }
    if (!current) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const [rawKey, ...rawParams] = line.slice(0, separator).split(';')
    const key = rawKey.toUpperCase()
    const params = Object.fromEntries(
      rawParams.map((parameter) => {
        const [name, ...parts] = parameter.split('=')
        return [name.toUpperCase(), parts.join('=').replace(/^"|"$/g, '')]
      }),
    )
    current[key] = { params, value: line.slice(separator + 1) }
  }

  return events.slice(0, 1000)
}
