import { describe, expect, it } from "vitest"

import {
  taskDataFromCalendarAssignment,
  type CalendarAssignmentInput,
} from "./calendar-task"

const event: CalendarAssignmentInput = {
  id: "synthetic-event-1",
  start: "2026-12-10T17:00:00.000Z",
  title: "ITSC 3155 Sprint 2 [Course calendar]",
}

describe("taskDataFromCalendarAssignment", () => {
  it("maps a calendar assignment to a linked, scored-input-ready task", () => {
    expect(taskDataFromCalendarAssignment(event)).toEqual({
      assignmentType: "project",
      calendarEvent: "synthetic-event-1",
      careerAlignment: 70,
      classLevel: "3000",
      consequence: 84,
      dueDate: "2026-12-10T17:00:00.000Z",
      estimatedMinutes: 240,
      goalAlignment: 76,
      status: "open",
      title: "ITSC 3155 Sprint 2",
    })
  })

  it.each([
    ["Final assessment", "exam", 180],
    ["MIDTERM", "exam", 180],
    ["Practice exam", "exam", 180],
    ["Lab report", "lab", 150],
    ["Project proposal", "project", 240],
    ["Research paper", "project", 240],
    ["Presentation", "project", 240],
    ["Sprint 2", "project", 240],
    ["Read chapter 3", "reading", 60],
    ["Homework 1", "problem-set", 90],
  ])("classifies %j as %s", (title, assignmentType, estimatedMinutes) => {
    expect(taskDataFromCalendarAssignment({ ...event, title })).toMatchObject({
      assignmentType,
      estimatedMinutes,
    })
  })

  it.each([
    ["Final lab project reading", "exam"],
    ["Lab project reading", "lab"],
    ["Project reading", "project"],
  ])("resolves mixed keywords in %j as %s", (title, assignmentType) => {
    expect(
      taskDataFromCalendarAssignment({ ...event, title }).assignmentType,
    ).toBe(assignmentType)
  })

  it.each([
    ["MATH 1241 Exam", "1000"],
    ["ITSC-2214 Lab", "2000"],
    ["ITSC 3155 Project", "3000"],
    ["ITCS 4155 Paper", "4000"],
    ["No course code", "3000"],
    ["itsc 2214 lab", "3000"],
  ])("infers the current course level for %j", (title, classLevel) => {
    expect(taskDataFromCalendarAssignment({ ...event, title }).classLevel).toBe(
      classLevel,
    )
  })

  it.each([
    [true, "done"],
    [false, "open"],
    [null, "open"],
    [undefined, "open"],
  ])("maps completed=%j to %s", (completed, status) => {
    expect(taskDataFromCalendarAssignment({ ...event, completed }).status).toBe(
      status,
    )
  })

  it.each(["calendar-abc", "0007", 42, 0])(
    "preserves event identity %j as a string",
    (id) => {
      expect(
        taskDataFromCalendarAssignment({ ...event, id }).calendarEvent,
      ).toBe(String(id))
    },
  )

  it("keeps the original date string and does not mutate its input", () => {
    const input = { ...event, start: "2026-12-10T12:00:00-05:00" }
    const original = { ...input }
    expect(taskDataFromCalendarAssignment(input).dueDate).toBe(input.start)
    expect(input).toEqual(original)
  })

  it.each([
    ["  Homework [Calendar label]  ", "Homework"],
    ["Homework [part 1] discussion", "Homework [part 1] discussion"],
    ["[Calendar label]", "[Calendar label]"],
    ["", ""],
  ])("cleans %j without inventing a replacement title", (title, expected) => {
    expect(taskDataFromCalendarAssignment({ ...event, title }).title).toBe(
      expected,
    )
  })
})

describe("calendar-task current limitations (characterization, not desired requirements)", () => {
  it("currently emits an unsupported 5000 class level for a graduate course code", () => {
    // The production cast does not validate against the ClassLevel union.
    expect(
      taskDataFromCalendarAssignment({ ...event, title: "ITCS 5155 Paper" })
        .classLevel,
    ).toBe("5000")
  })

  it("currently matches keyword substrings rather than whole words", () => {
    expect(
      taskDataFromCalendarAssignment({ ...event, title: "Finalize proposal" })
        .assignmentType,
    ).toBe("exam")
  })

  it("currently passes an invalid start date through unchanged", () => {
    expect(
      taskDataFromCalendarAssignment({ ...event, start: "not-a-date" }).dueDate,
    ).toBe("not-a-date")
  })
})
