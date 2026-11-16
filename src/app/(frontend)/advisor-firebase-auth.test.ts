import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  verify: vi.fn(),
  mapping: vi.fn(),
  profile: vi.fn(),
  generate: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}))
vi.mock("@/lib/firebase-admin", () => ({
  getFirebaseAdminAuth: () => ({ verifySessionCookie: mocks.verify }),
  getTeamFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () =>
          name === "authUserProfiles" ? mocks.mapping(id) : mocks.profile(id),
      }),
    }),
  }),
}))
vi.mock("../../lib/gemini", () => ({ generateAdvisorReply: mocks.generate }))

// Use the actual Gemini action AND Sai's actual requireAppUser implementation.
// Only Firebase SDK I/O, cookies, and the Google adapter are mocked.
import { advisorChatAction } from "./advisor-actions"

beforeEach(() => {
  mocks.cookie
    .mockReset()
    .mockReturnValue({ value: "synthetic-session-cookie" })
  mocks.verify.mockReset().mockResolvedValue({ uid: "synthetic-firebase-uid" })
  mocks.mapping
    .mockReset()
    .mockResolvedValue({ data: () => ({ profileId: "synthetic-profile-id" }) })
  mocks.profile.mockReset().mockResolvedValue({
    id: "synthetic-profile-id",
    exists: true,
    data: () => ({
      authUid: "synthetic-firebase-uid",
      name: "Example student",
      username: "example-student",
      email: "example@example.test",
      role: "student",
    }),
  })
  mocks.generate
    .mockReset()
    .mockResolvedValue({
      ok: true,
      source: "gemini",
      text: "Review your priorities.",
    })
})

describe("Gemini action with migrated Firebase requireAppUser", () => {
  it("verifies a revocation-checked Firebase session and resolves the profile before Google", async () => {
    expect(
      await advisorChatAction({ prompt: "Help me prioritize", history: [] }),
    ).toMatchObject({ ok: true })
    expect(mocks.cookie).toHaveBeenCalledWith("app-session")
    expect(mocks.verify).toHaveBeenCalledWith("synthetic-session-cookie", true)
    expect(mocks.mapping).toHaveBeenCalledWith("synthetic-firebase-uid")
    expect(mocks.profile).toHaveBeenCalledWith("synthetic-profile-id")
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith({
      prompt: "Help me prioritize",
      history: [],
    })
    expect(mocks.profile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generate.mock.invocationCallOrder[0],
    )
  })

  it("rejects a missing session before Firebase verification or Google", async () => {
    mocks.cookie.mockReturnValue(undefined)
    expect(
      await advisorChatAction({ prompt: "Help", history: [] }),
    ).toMatchObject({ ok: false, code: "auth" })
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("rejects invalid or revoked Firebase sessions before Google", async () => {
    mocks.verify.mockRejectedValue(new Error("synthetic revoked session"))
    expect(
      await advisorChatAction({ prompt: "Help", history: [] }),
    ).toMatchObject({ ok: false, code: "auth" })
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("rejects a missing profile", async () => {
    mocks.profile.mockResolvedValue({ exists: false })
    expect(
      await advisorChatAction({ prompt: "Help", history: [] }),
    ).toMatchObject({ ok: false, code: "auth" })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("rejects a profile belonging to a different Firebase UID", async () => {
    mocks.profile.mockResolvedValue({
      exists: true,
      data: () => ({ authUid: "different-user" }),
    })
    expect(
      await advisorChatAction({ prompt: "Help", history: [] }),
    ).toMatchObject({ ok: false, code: "auth" })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("sanitizes Firebase profile-read failures without calling Google", async () => {
    mocks.mapping.mockRejectedValue(new Error("private Firebase diagnostic"))
    const result = await advisorChatAction({ prompt: "Help", history: [] })
    expect(result).toMatchObject({ ok: false, code: "service" })
    expect(JSON.stringify(result)).not.toContain("private Firebase diagnostic")
    expect(mocks.generate).not.toHaveBeenCalled()
  })
})
