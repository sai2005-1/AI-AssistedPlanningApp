import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Part } from "@google/genai"

const sdk = vi.hoisted(() => ({ generate: vi.fn(), constructor: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(options: unknown) {
      sdk.constructor(options)
    }
    models = { generateContent: sdk.generate }
  },
}))

import { generateAdvisorReply, GEMINI_TIMEOUT_MS } from "./gemini"

const request = {
  prompt: "I have two hours on Tuesday. How should I study?",
  history: [],
}
function response(text = "Try two focused blocks with a short break.") {
  return {
    candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
  }
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-only-placeholder")
  vi.stubEnv("GEMINI_MODEL", "")
  sdk.generate.mockReset().mockResolvedValue(response())
  sdk.constructor.mockClear()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("Gemini server adapter (SDK fully mocked; no live requests)", () => {
  it("returns text and uses the requested default model without database tools", async () => {
    expect(await generateAdvisorReply(request)).toEqual({
      ok: true,
      source: "gemini",
      text: "Try two focused blocks with a short break.",
    })
    expect(sdk.constructor).toHaveBeenCalledWith({
      apiKey: "test-only-placeholder",
      vertexai: false,
    })
    const sent = sdk.generate.mock.calls[0][0]
    expect(sent.model).toBe("gemini-2.5-flash")
    expect(sent.contents).toEqual([
      { role: "user", parts: [{ text: request.prompt }] },
    ])
    expect(sent.config.tools).toBeUndefined()
    expect(sent.config.maxOutputTokens).toBe(1500)
    expect(sent.config.httpOptions.retryOptions.attempts).toBe(1)
    expect(sent.config.systemInstruction).toContain("cannot access")
  })

  it("uses server model configuration and only the submitted conversation", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-pro")
    await generateAdvisorReply({
      prompt: "What next?",
      history: [
        { role: "user", text: "I prefer short sessions." },
        { role: "assistant", text: "Try 25 minutes." },
      ],
    })
    expect(sdk.generate.mock.calls[0][0]).toMatchObject({
      model: "gemini-2.5-pro",
      contents: [
        { role: "user", parts: [{ text: "I prefer short sessions." }] },
        { role: "model", parts: [{ text: "Try 25 minutes." }] },
        { role: "user", parts: [{ text: "What next?" }] },
      ],
    })
  })

  it("accepts text with thoughtSignature and returns only user-facing text", async () => {
    const part = {
      text: "Review one topic at a time.",
      thoughtSignature: "c3ludGhldGljLXNpZ25hdHVyZQ==",
    } satisfies Part
    sdk.generate.mockResolvedValue({
      candidates: [{ finishReason: "STOP", content: { parts: [part] } }],
    })
    expect(await generateAdvisorReply(request)).toEqual({
      ok: true,
      source: "gemini",
      text: "Review one topic at a time.",
    })
  })

  it("discards optional text metadata when joining visible response parts", async () => {
    const parts = [
      {
        text: "  Review first. ",
        thought: false,
        thoughtSignature: "c3ludGhldGljLXNpZ25hdHVyZQ==",
        partMetadata: { source: "synthetic-metadata" },
        speechMetadata: { speaker: "synthetic-speaker", style: "calm" },
      },
      { text: "Then take a break.  " },
    ] satisfies Part[]
    sdk.generate.mockResolvedValue({
      candidates: [{ finishReason: "STOP", content: { parts } }],
    })
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await generateAdvisorReply(request)).toEqual({
      ok: true,
      source: "gemini",
      text: "Review first. Then take a break.",
    })
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it.each(["", "   "])(
    "does not call Google when credentials are missing (%j)",
    async (key) => {
      vi.stubEnv("GEMINI_API_KEY", key)
      expect(await generateAdvisorReply(request)).toMatchObject({
        ok: false,
        code: "unavailable",
      })
      expect(sdk.constructor).not.toHaveBeenCalled()
      expect(sdk.generate).not.toHaveBeenCalled()
    },
  )

  it("rejects malformed server model configuration", async () => {
    vi.stubEnv("GEMINI_MODEL", "https://untrusted.invalid")
    expect(await generateAdvisorReply(request)).toMatchObject({
      ok: false,
      code: "unavailable",
    })
    expect(sdk.generate).not.toHaveBeenCalled()
  })

  it.each([
    [429, "quota"],
    [408, "timeout"],
    [504, "timeout"],
    [401, "service"],
    [403, "service"],
    [404, "service"],
    [500, "service"],
    [503, "service"],
  ])(
    "handles provider status %i without leaking its message",
    async (status, code) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {})
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      sdk.generate.mockRejectedValue({
        status,
        message: "private prompt and test-only-placeholder",
      })
      const result = await generateAdvisorReply(request)
      expect(result).toMatchObject({ ok: false, code })
      expect(JSON.stringify(result)).not.toContain("private prompt")
      expect(JSON.stringify(result)).not.toContain("test-only-placeholder")
      expect(log).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it("sanitizes unexpected network errors", async () => {
    sdk.generate.mockRejectedValue(new Error("private provider diagnostic"))
    expect(await generateAdvisorReply(request)).toMatchObject({
      ok: false,
      code: "service",
    })
  })

  it("times out and aborts even when the SDK promise never settles", async () => {
    vi.useFakeTimers()
    sdk.generate.mockReturnValue(new Promise(() => {}))
    const pending = generateAdvisorReply(request)
    await vi.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS)
    expect(await pending).toMatchObject({ ok: false, code: "timeout" })
    expect(sdk.generate.mock.calls[0][0].config.abortSignal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    {},
    { candidates: [] },
    { promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "truncated" }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ functionCall: { name: "saveTask" } }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: "hidden", thought: true }] },
        },
      ],
    },
    response("  "),
    response("x".repeat(6001)),
  ])(
    "rejects blocked, incomplete, empty, tool, or oversized output %#",
    async (invalid) => {
      sdk.generate.mockResolvedValue(invalid)
      expect(await generateAdvisorReply(request)).toMatchObject({
        ok: false,
        code: "response",
      })
    },
  )

  it.each([
    { text: "Do not execute this.", functionCall: { name: "saveTask" } },
    { text: "Do not execute this.", toolCall: { name: "saveTask" } },
    { text: "Do not execute this.", executableCode: { code: "write()" } },
    {
      text: "Not plain text.",
      inlineData: { mimeType: "image/png", data: "synthetic" },
    },
    { text: "Hidden reasoning.", thought: true },
    { thought: false },
    { text: 123 },
    { text: " " },
    { text: "x".repeat(6001) },
    { text: "Unknown content.", unknownContent: "synthetic" },
    { text: "Malformed metadata.", thoughtSignature: 123 },
    { text: "Malformed metadata.", partMetadata: [] },
    { text: "Malformed metadata.", speechMetadata: "not-an-object" },
  ])("metadata cannot bypass text-only validation %#", async (part) => {
    sdk.generate.mockResolvedValue({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { thoughtSignature: "c3ludGhldGljLXNpZ25hdHVyZQ==", ...part },
            ],
          },
        },
      ],
    })
    expect(await generateAdvisorReply(request)).toMatchObject({
      ok: false,
      code: "response",
    })
  })

  it("clears the timeout after successful completion", async () => {
    vi.useFakeTimers()
    await generateAdvisorReply(request)
    expect(vi.getTimerCount()).toBe(0)
  })
})
