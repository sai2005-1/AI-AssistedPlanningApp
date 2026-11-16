import { describe, expect, it } from "vitest"
import {
  classifyLocalCommand,
  recentChatHistory,
  validateChatRequest,
  type ChatTurn,
} from "./advisor-chat"

describe("existing local command routing", () => {
  it.each([
    ["Parse this syllabus: Exam December 10", "syllabus"],
    ["Create a study plan for my midterm", "exam"],
    ["Spaced repetition", "exam"],
    ["Exam plan", "exam"],
    ["Members: Example A, Example B", "team"],
    ["Create a sub-deliverable", "team"],
    ["Team proposal", "team"],
    ["Auto-reschedule my blocks", "replan"],
    ["Replan this week", "replan"],
    ["Explain this score", "explain"],
    ["Why this priority?", "explain"],
    ["Add calculus homework", "add"],
    ["Homework due tomorrow", "add"],
    ["I have two hours", "add"],
    ["Help me think", "help"],
  ])("preserves %j => %s in explicit local mode", (prompt, command) => {
    expect(classifyLocalCommand(prompt)).toBe(command)
  })
})

describe("explicit conversation context", () => {
  it("keeps at most three complete exchanges without mutating the original", () => {
    const history: ChatTurn[] = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      text: `Turn ${i}`,
    }))
    expect(recentChatHistory(history, "Next")).toEqual(history.slice(2))
    expect(history).toHaveLength(8)
  })

  it("drops whole exchanges when total context would exceed the budget", () => {
    const history: ChatTurn[] = [
      { role: "user", text: "x".repeat(4000) },
      { role: "assistant", text: "x".repeat(6000) },
    ]
    expect(recentChatHistory(history, "x".repeat(4000))).toEqual([])
  })

  it("does not admit oversized individual history messages", () => {
    expect(
      validateChatRequest({
        prompt: "Next",
        history: [
          { role: "user", text: "x".repeat(4001) },
          { role: "assistant", text: "Hi" },
        ],
      }),
    ).toBeNull()
  })
})
