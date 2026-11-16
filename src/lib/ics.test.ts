import { describe, expect, it } from "vitest"

import { parseICS } from "./ics"

// Synthetic calendars only. UTC DTSTART values keep ordinary fixtures independent
// of the host clock/timezone; run with TZ=UTC for reproducible recurrence checks.
function event(...properties: string[]) {
  return ["BEGIN:VEVENT", ...properties, "END:VEVENT"].join("\r\n")
}

function calendar(...events: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join(
    "\r\n",
  )
}

function recurring(rule: string, ...properties: string[]) {
  return calendar(
    event(
      "UID:study-series",
      "SUMMARY:Study session",
      "DTSTART:20261207T150000Z",
      `RRULE:${rule}`,
      ...properties,
    ),
  )
}

describe("parseICS valid events", () => {
  it("reads a UTC event with an explicit end and metadata", () => {
    expect(
      parseICS(
        calendar(
          event(
            "UID:meeting-1",
            "SUMMARY:Project meeting",
            "DTSTART:20261207T150000Z",
            "DTEND:20261207T163000Z",
            "DESCRIPTION:Discuss the proposal",
            "LOCATION:Library room 12",
          ),
        ),
      ),
    ).toEqual([
      {
        uid: "meeting-1",
        title: "Project meeting",
        start: "2026-12-07T15:00:00.000Z",
        end: "2026-12-07T16:30:00.000Z",
        allDay: false,
        completed: false,
        description: "Discuss the proposal",
        location: "Library room 12",
        kind: "other",
      },
    ])
  })

  it("defaults a date-only event to one full day", () => {
    const [parsed] = parseICS(
      calendar(
        event(
          "UID:holiday",
          "SUMMARY:Semester break",
          "DTSTART;VALUE=DATE:20261207",
        ),
      ),
    )
    expect(parsed).toMatchObject({
      allDay: true,
      start: "2026-12-07T00:00:00.000Z",
      end: "2026-12-08T00:00:00.000Z",
    })
  })

  it.each([
    [undefined, "2026-12-07T16:00:00.000Z"],
    ["DURATION:PT45M", "2026-12-07T15:45:00.000Z"],
    ["DURATION:P1DT2H3M4S", "2026-12-08T17:03:04.000Z"],
  ])("uses the duration or one-hour fallback: %s", (duration, end) => {
    const properties = duration ? [duration] : []
    const [parsed] = parseICS(
      calendar(
        event("SUMMARY:Meeting", "DTSTART:20261207T150000Z", ...properties),
      ),
    )
    expect(parsed.end).toBe(end)
  })

  it("prefers a valid explicit end over DURATION", () => {
    const [parsed] = parseICS(
      calendar(
        event(
          "SUMMARY:Meeting",
          "DTSTART:20261207T150000Z",
          "DTEND:20261207T170000Z",
          "DURATION:PT30M",
        ),
      ),
    )
    expect(parsed.end).toBe("2026-12-07T17:00:00.000Z")
  })

  it("unfolds CRLF continuation lines and decodes escaped text", () => {
    const [parsed] = parseICS(
      "\uFEFF" +
        calendar(
          event(
            "UID:escaped",
            "SUMMARY:Proposal\\, phase\\; one",
            "DTSTART:20261207T150000Z",
            "DESCRIPTION:First line\\nSecond ",
            " line\\; details",
          ),
        ),
    )
    expect(parsed.title).toBe("Proposal, phase; one")
    expect(parsed.description).toBe("First line\nSecond line; details")
  })

  it("accepts LF line endings", () => {
    const source = calendar(
      event("SUMMARY:Meeting", "DTSTART:20261207T150000Z"),
    ).replace(/\r\n/g, "\n")
    expect(parseICS(source)).toHaveLength(1)
  })

  it.each(["STATUS:COMPLETED", "X-CANVAS-COMPLETED:TRUE"])(
    "recognizes completion from %s",
    (property) => {
      const [parsed] = parseICS(
        calendar(
          event(
            "UID:assignment-42",
            "SUMMARY:Proposal",
            "DTSTART:20261207T150000Z",
            property,
          ),
        ),
      )
      expect(parsed).toMatchObject({ completed: true, kind: "deadline" })
    },
  )

  it("generates a stable fallback UID when none is supplied", () => {
    const source = calendar(
      event("SUMMARY:Meeting", "DTSTART:20261207T150000Z"),
    )
    const [first] = parseICS(source)
    const [second] = parseICS(source)
    expect(first.uid).toBe("signal-1796655600000-Meeting")
    expect(second.uid).toBe(first.uid)
  })
})

describe("parseICS invalid or incomplete input", () => {
  it.each(["", "not a calendar", "BEGIN:VCALENDAR\nEND:VCALENDAR"])(
    "returns no events for %j",
    (source) => expect(parseICS(source)).toEqual([]),
  )

  it.each([
    ["SUMMARY:Missing start"],
    ["DTSTART:20261207T150000Z"],
    ["SUMMARY:   ", "DTSTART:20261207T150000Z"],
    ["SUMMARY:Bad date", "DTSTART:not-a-date"],
    ["SUMMARY:Cancelled", "DTSTART:20261207T150000Z", "STATUS:CANCELLED"],
  ])("skips an unusable VEVENT: %j", (...properties) => {
    expect(parseICS(calendar(event(...properties)))).toEqual([])
  })

  it("retains a valid sibling when another event is unusable", () => {
    const parsed = parseICS(
      calendar(
        event("SUMMARY:Missing start"),
        event("UID:valid", "SUMMARY:Meeting", "DTSTART:20261207T150000Z"),
      ),
    )
    expect(parsed.map((item) => item.uid)).toEqual(["valid"])
  })

  it("does not emit an unterminated event", () => {
    expect(
      parseICS("BEGIN:VEVENT\nSUMMARY:Meeting\nDTSTART:20261207T150000Z"),
    ).toEqual([])
  })
})

describe("parseICS recurrence boundaries", () => {
  it.each([0, 1, 3])("honors DAILY COUNT=%i", (count) => {
    const parsed = parseICS(recurring(`FREQ=DAILY;COUNT=${count}`))
    expect(parsed).toHaveLength(count)
    if (count === 3) {
      expect(parsed.map((item) => item.start)).toEqual([
        "2026-12-07T15:00:00.000Z",
        "2026-12-08T15:00:00.000Z",
        "2026-12-09T15:00:00.000Z",
      ])
    }
  })

  it("includes an occurrence exactly at UNTIL but none after it", () => {
    const parsed = parseICS(recurring("FREQ=DAILY;UNTIL=20261209T150000Z"))
    expect(parsed.map((item) => item.start)).toEqual([
      "2026-12-07T15:00:00.000Z",
      "2026-12-08T15:00:00.000Z",
      "2026-12-09T15:00:00.000Z",
    ])
  })

  it("excludes an occurrence one second after UNTIL", () => {
    expect(
      parseICS(recurring("FREQ=DAILY;UNTIL=20261209T145959Z")),
    ).toHaveLength(2)
  })

  it("returns no occurrences when UNTIL precedes DTSTART", () => {
    expect(parseICS(recurring("FREQ=DAILY;UNTIL=20261206T150000Z"))).toEqual([])
  })

  it("expands weekly recurrence with and without BYDAY", () => {
    expect(
      parseICS(recurring("FREQ=WEEKLY;COUNT=3")).map((item) => item.start),
    ).toEqual([
      "2026-12-07T15:00:00.000Z",
      "2026-12-14T15:00:00.000Z",
      "2026-12-21T15:00:00.000Z",
    ])
    expect(
      parseICS(recurring("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3")).map(
        (item) => item.start,
      ),
    ).toEqual([
      "2026-12-07T15:00:00.000Z",
      "2026-12-09T15:00:00.000Z",
      "2026-12-14T15:00:00.000Z",
    ])
  })

  it("caps a single recurring series at 100 occurrences", () => {
    const parsed = parseICS(recurring("FREQ=DAILY;COUNT=101"))
    expect(parsed).toHaveLength(100)
    expect(Date.parse(parsed[99].start) - Date.parse(parsed[0].start)).toBe(
      99 * 86_400_000,
    )
  })

  it("limits a distant UNTIL to the one-year expansion horizon", () => {
    const parsed = parseICS(
      recurring("FREQ=WEEKLY;COUNT=100;UNTIL=20281207T150000Z"),
    )
    expect(parsed).toHaveLength(53)
    expect(parsed.at(-1)?.start).toBe("2027-12-06T15:00:00.000Z")
  })

  it("caps the returned calendar at 1,000 events", () => {
    const entries = Array.from({ length: 1001 }, (_, index) =>
      event(
        `UID:meeting-${index}`,
        `SUMMARY:Meeting ${index}`,
        "DTSTART:20261207T150000Z",
      ),
    )
    const parsed = parseICS(calendar(...entries))
    expect(parsed).toHaveLength(1000)
    expect(parsed[0].uid).toBe("meeting-0")
    expect(parsed.at(-1)?.uid).toBe("meeting-999")
  })
})

describe("parseICS known limitations — desired behavior", () => {
  // Confirmed failures against the unchanged parser, not skipped tests or claims
  // of supported behavior. Vitest's it.fails executes each assertion and fails
  // on an unexpected pass, prompting removal of the marker after a reviewed fix.
  it.fails("preserves an escaped literal backslash before the letter n", () => {
    const [parsed] = parseICS(
      calendar(
        event(
          "SUMMARY:Meeting",
          "DTSTART:20261207T150000Z",
          "DESCRIPTION:Path C:\\\\notes",
        ),
      ),
    )
    expect(parsed.description).toBe("Path C:\\notes")
  })

  it.fails("applies the event's TZID rather than the host timezone", () => {
    const [parsed] = parseICS(
      calendar(
        event(
          "SUMMARY:Tokyo meeting",
          "DTSTART;TZID=Asia/Tokyo:20261207T090000",
        ),
      ),
    )
    expect(parsed.start).toBe("2026-12-07T00:00:00.000Z")
  })

  it.fails("honors RRULE INTERVAL when expanding daily events", () => {
    expect(
      parseICS(recurring("FREQ=DAILY;INTERVAL=2;COUNT=3")).map(
        (item) => item.start,
      ),
    ).toEqual([
      "2026-12-07T15:00:00.000Z",
      "2026-12-09T15:00:00.000Z",
      "2026-12-11T15:00:00.000Z",
    ])
  })

  it.fails("excludes recurrence dates listed in EXDATE", () => {
    expect(
      parseICS(recurring("FREQ=DAILY;COUNT=3", "EXDATE:20261208T150000Z")).map(
        (item) => item.start,
      ),
    ).toEqual(["2026-12-07T15:00:00.000Z", "2026-12-09T15:00:00.000Z"])
  })

  it.fails(
    "rejects an impossible calendar date rather than normalizing it",
    () => {
      expect(
        parseICS(
          calendar(
            event(
              "SUMMARY:Impossible February date",
              "DTSTART:20260230T150000Z",
            ),
          ),
        ),
      ).toEqual([])
    },
  )
})
