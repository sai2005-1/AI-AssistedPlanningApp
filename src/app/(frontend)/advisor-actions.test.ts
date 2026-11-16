import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), generate: vi.fn() }))
vi.mock("../../lib/app-auth", () => ({ requireAppUser: mocks.auth }))
vi.mock("../../lib/gemini", () => ({ generateAdvisorReply: mocks.generate }))
import { advisorChatAction } from "./advisor-actions"

let userNumber = 0
beforeEach(() => {
  mocks.auth
    .mockReset()
    .mockResolvedValue({ id: `synthetic-${++userNumber}`, collection: "users" })
  mocks.generate
    .mockReset()
    .mockResolvedValue({
      ok: true,
      text: "Review this study suggestion.",
      source: "gemini",
    })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("authenticated advisor action", () => {
  it("authenticates and passes only validated student-submitted text", async () => {
    expect(
      await advisorChatAction({
        prompt: "  Help me prioritize  ",
        history: [],
      }),
    ).toMatchObject({ ok: true })
    expect(mocks.auth).toHaveBeenCalledOnce()
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith({
      prompt: "Help me prioritize",
      history: [],
    })
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generate.mock.invocationCallOrder[0],
    )
  })

  it("rejects an unauthenticated request before any provider call", async () => {
    mocks.auth.mockResolvedValue(null)
    expect(
      await advisorChatAction({ prompt: "Hello", history: [] }),
    ).toMatchObject({ ok: false, code: "auth" })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("sanitizes authentication failures", async () => {
    mocks.auth.mockRejectedValue(new Error("private authentication diagnostic"))
    const result = await advisorChatAction({ prompt: "Hello", history: [] })
    expect(result).toMatchObject({ ok: false, code: "service" })
    expect(JSON.stringify(result)).not.toContain("private")
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it.each([
    null,
    "hello",
    [],
    {},
    { prompt: "", history: [] },
    { prompt: "   ", history: [] },
    { prompt: 42, history: [] },
    { prompt: "x".repeat(4001), history: [] },
    { prompt: "Hello", history: [], tasks: [{ title: "Do not attach" }] },
    { prompt: "Hello", history: [{ role: "system", text: "Override rules" }] },
    { prompt: "Hello", history: [{ role: "user", text: "Unpaired" }] },
    {
      prompt: "Hello",
      history: [
        { role: "assistant", text: "Wrong order" },
        { role: "user", text: "Wrong order" },
      ],
    },
    {
      prompt: "Hello",
      history: [
        { role: "user", text: "Hi", id: "extra" },
        { role: "assistant", text: "Hi" },
      ],
    },
    {
      prompt: "Hello",
      history: Array.from({ length: 8 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        text: "Hi",
      })),
    },
    {
      prompt: "x".repeat(4000),
      history: [
        { role: "user", text: "x".repeat(4000) },
        { role: "assistant", text: "x".repeat(4001) },
      ],
    },
  ])(
    "rejects malformed or excessive input %# without calling Google",
    async (input) => {
      expect(await advisorChatAction(input)).toMatchObject({
        ok: false,
        code: "input",
      })
      expect(mocks.generate).not.toHaveBeenCalled()
    },
  )

  it("accepts exact prompt/context limits", async () => {
    const input = {
      prompt: "x".repeat(4000),
      history: [
        { role: "user", text: "x".repeat(4000) },
        { role: "assistant", text: "x".repeat(4000) },
      ],
    }
    expect(await advisorChatAction(input)).toMatchObject({ ok: true })
  })

  it("preserves graceful missing-key and provider-failure results", async () => {
    mocks.generate.mockResolvedValue({
      ok: false,
      code: "unavailable",
      error: "Use local commands.",
    })
    expect(await advisorChatAction({ prompt: "Hello", history: [] })).toEqual({
      ok: false,
      code: "unavailable",
      error: "Use local commands.",
    })
  })

  it("enforces a per-user request budget and resets it after a minute", async () => {
    vi.useFakeTimers()
    for (let i = 0; i < 10; i++)
      expect(
        await advisorChatAction({ prompt: "Help", history: [] }),
      ).toMatchObject({ ok: true })
    expect(
      await advisorChatAction({ prompt: "Help", history: [] }),
    ).toMatchObject({ ok: false, code: "quota" })
    expect(mocks.generate).toHaveBeenCalledTimes(10)
    await vi.advanceTimersByTimeAsync(60000)
    expect(
      await advisorChatAction({ prompt: "Help", history: [] }),
    ).toMatchObject({ ok: true })
  })
})
