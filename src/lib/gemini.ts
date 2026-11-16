import 'server-only'

import { GoogleGenAI } from '@google/genai'
import { MAX_REPLY_CHARS, type ChatRequest, type ChatResult } from './advisor-chat'

export const GEMINI_TIMEOUT_MS = 20000
const SYSTEM_INSTRUCTION = `You are Signal, a student planning advisor. Use only the conversation the student submits. Help reason about priorities, schedules, workload, and study strategies. Ask for missing constraints rather than inventing deadlines or available time. Give concise, practical explanations in plain text. You cannot access the student's stored tasks or calendar, call tools, or save or change anything. All plans are proposals for the student to review. Never claim an action was performed or a plan was saved. Explain that changes require explicit approval in Signal's local commands. Do not request passwords, API keys, or other credentials.`

class RequestTimeout extends Error {}

// Text-compatible fields from @google/genai's Part interface. Metadata is
// accepted but never returned or added to conversation history. Other content
// variants (tools, code, files, media) and unknown fields remain rejected.
const TEXT_PART_FIELDS = new Set([
  'text',
  'thought',
  'thoughtSignature',
  'partMetadata',
  'speechMetadata',
])

function optionalMetadata(value: unknown): boolean {
  return (
    value === undefined ||
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
  )
}

export async function generateAdvisorReply(request: ChatRequest): Promise<ChatResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
  if (!apiKey || !/^gemini-[a-zA-Z0-9._-]{1,80}$/.test(model)) {
    return {
      ok: false,
      code: 'unavailable',
      error: 'Gemini is not configured. Local commands are still available.',
    }
  }

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const client = new GoogleGenAI({ apiKey, vertexai: false })
    const response = await Promise.race([
      client.models.generateContent({
        model,
        contents: [
          ...request.history.map((turn) => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.text }],
          })),
          { role: 'user', parts: [{ text: request.prompt }] },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          maxOutputTokens: 1500,
          temperature: 0.5,
          candidateCount: 1,
          abortSignal: controller.signal,
          httpOptions: {
            timeout: GEMINI_TIMEOUT_MS,
            retryOptions: { attempts: 1 },
          },
        },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new RequestTimeout())
          controller.abort()
        }, GEMINI_TIMEOUT_MS)
      }),
    ])

    const candidate = response?.candidates?.[0]
    const parts = candidate?.content?.parts
    // Avoid response.text's SDK warnings for mixed/tool content. Read only
    // completed plain-text output; ignore text metadata and never expose it.
    if (
      response.promptFeedback?.blockReason ||
      candidate?.finishReason !== 'STOP' ||
      !parts?.length ||
      parts.some(
        (part) =>
          typeof part.text !== 'string' ||
          (part.thought !== undefined && part.thought !== false) ||
          (part.thoughtSignature !== undefined &&
            typeof part.thoughtSignature !== 'string') ||
          !optionalMetadata(part.partMetadata) ||
          !optionalMetadata(part.speechMetadata) ||
          Object.keys(part).some((key) => !TEXT_PART_FIELDS.has(key)),
      )
    ) {
      return {
        ok: false,
        code: 'response',
        error:
          'Gemini could not provide a complete text reply. Try rephrasing, or use local commands.',
      }
    }
    const text = parts
      .map((part) => part.text)
      .join('')
      .trim()
    if (!text || text.length > MAX_REPLY_CHARS) {
      return {
        ok: false,
        code: 'response',
        error: 'Gemini returned an empty or oversized reply. Try a shorter question.',
      }
    }
    return { ok: true, text, source: 'gemini' }
  } catch (error) {
    // Never log provider errors: they can contain prompts, records, or secrets.
    const status =
      error && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (
      error instanceof RequestTimeout ||
      controller.signal.aborted ||
      status === 408 ||
      status === 504
    ) {
      return {
        ok: false,
        code: 'timeout',
        error: 'Gemini took too long. Try again, or use local commands.',
      }
    }
    if (status === 429)
      return {
        ok: false,
        code: 'quota',
        error:
          "Gemini's request limit was reached. Wait before retrying, or use local commands.",
      }
    return {
      ok: false,
      code: 'service',
      error: 'Gemini is unavailable right now. Try again later, or use local commands.',
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
