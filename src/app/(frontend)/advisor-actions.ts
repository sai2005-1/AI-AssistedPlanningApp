"use server"

// Bounded, per-process abuse protection. No prompts, records, or credentials are
// retained. Multiple deployment instances do not share this limiter.

import { requireAppUser } from "../../lib/app-auth"
import { validateChatRequest, type ChatResult } from "../../lib/advisor-chat"
import { generateAdvisorReply } from "../../lib/gemini"
const requests = new Map<string, {
  resetAt: number
  count: number
}>()

export async function advisorChatAction(input: unknown): Promise<ChatResult> {
  try {
    const user = await requireAppUser()
    if (!user)
      return { ok: false, code: "auth", error: "Sign in to chat with Signal." }
    const request = validateChatRequest(input)
    if (!request)
      return {
        ok: false,
        code: "input",
        error:
          "Enter a question of 1–4,000 characters with at most six recent conversation turns (12,000 characters total).",
      }
    const now = Date.now()
    for (const [id, entry] of requests) {
      if (entry.resetAt <= now) requests.delete(id)
    }
    const entry = requests.get(user.id)
    if (
      (entry && entry.count >= 10) ||
      (!entry && requests.size >= 1000)
    ) {
      return {
        ok: false,
        code: "quota",
        error: "Too many chat requests. Wait a minute, or use local commands.",
      }
    }
    requests.set(user.id, {
      resetAt: entry?.resetAt ?? now + 60000,
      count: (entry?.count ?? 0) + 1,
    })
    return await generateAdvisorReply(request)
  } catch {
    return {
      ok: false,
      code: "service",
      error:
        "Signal could not complete the request. Try again, or use local commands.",
    }
  }
}
