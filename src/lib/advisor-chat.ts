// Shared serializable contracts only. No records, credentials, or SDK imports.
export const MAX_PROMPT_CHARS = 4000
export const MAX_REPLY_CHARS = 6000
export const MAX_HISTORY_TURNS = 6
export const MAX_CONTEXT_CHARS = 12000

export type ChatTurn = {
  role: 'user' | 'assistant'
  text: string
}
export type ChatRequest = {
  prompt: string
  history: ChatTurn[]
}
export type ChatResult =
  | {
      ok: true
      text: string
      source: 'gemini'
    }
  | {
      ok: false
      code:
        | 'auth'
        | 'input'
        | 'unavailable'
        | 'quota'
        | 'timeout'
        | 'response'
        | 'service'
      error: string
    }

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function validateChatRequest(value: unknown): ChatRequest | null {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !['prompt', 'history'].includes(key))
  )
    return null
  if (typeof value.prompt !== 'string') return null
  const prompt = value.prompt.trim()
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return null
  if (
    !Array.isArray(value.history) ||
    value.history.length > MAX_HISTORY_TURNS ||
    value.history.length % 2 !== 0
  )
    return null
  const history: ChatTurn[] = []
  let total = prompt.length
  for (const [index, turn] of value.history.entries()) {
    const role: ChatTurn['role'] = index % 2 === 0 ? 'user' : 'assistant'
    if (!object(turn) || Object.keys(turn).some((key) => !['role', 'text'].includes(key)))
      return null
    if (turn.role !== role || typeof turn.text !== 'string') return null
    const text = turn.text.trim()
    if (
      !text ||
      text.length > (turn.role === 'user' ? MAX_PROMPT_CHARS : MAX_REPLY_CHARS)
    )
      return null
    total += text.length
    if (total > MAX_CONTEXT_CHARS) return null
    history.push({ role, text })
  }
  return { prompt, history }
}

// Only explicitly submitted Gemini turns enter this buffer, never local results
// or selected-task data. Drop complete oldest exchanges when context is full.
export function recentChatHistory(history: ChatTurn[], prompt: string): ChatTurn[] {
  const recent = history.slice(-MAX_HISTORY_TURNS)
  while (
    recent.length &&
    recent.reduce((sum, turn) => sum + turn.text.length, prompt.length) >
      MAX_CONTEXT_CHARS
  )
    recent.splice(0, 2)
  return recent
}

export type LocalCommand =
  | 'syllabus'
  | 'exam'
  | 'team'
  | 'replan'
  | 'explain'
  | 'add'
  | 'help'

export function classifyLocalCommand(prompt: string): LocalCommand {
  const lower = prompt.toLowerCase()
  // Preserve the existing deterministic Advisor command precedence.
  if (lower.includes('syllabus')) return 'syllabus'
  if (
    ['study plan', 'spaced repetition', 'midterm', 'exam plan'].some((word) =>
      lower.includes(word),
    )
  )
    return 'exam'
  if (
    ['members:', 'sub-deliverable', 'team proposal'].some((word) => lower.includes(word))
  )
    return 'team'
  if (lower.includes('replan') || lower.includes('reschedule')) return 'replan'
  if (lower.includes('explain') || lower.includes('why')) return 'explain'
  if (lower.startsWith('add ') || lower.includes(' due ') || lower.includes(' hours'))
    return 'add'
  return 'help'
}
