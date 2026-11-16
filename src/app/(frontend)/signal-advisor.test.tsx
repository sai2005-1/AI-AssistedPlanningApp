// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  task: vi.fn(),
  workflow: vi.fn(),
  replan: vi.fn(),
}))
vi.mock('./advisor-actions', () => ({ advisorChatAction: mocks.chat }))
vi.mock('./actions', () => ({
  createTaskAction: mocks.task,
  createWorkflowAction: mocks.workflow,
  replanTasksAction: mocks.replan,
  importCalendarAction: vi.fn(),
  setCalendarEventCompletedAction: vi.fn(),
  setTaskCompletedAction: vi.fn(),
}))
vi.mock('./auth-actions', () => ({ logoutAction: vi.fn() }))
vi.mock('./team-deliverables', () => ({ default: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { AdvisorScreen, type TaskView } from './signal-app'

let root: Root
let host: HTMLDivElement
let changed: Mock<(message: string) => void>
let openTeam: Mock<() => void>

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.chat.mockResolvedValue({
    ok: true,
    source: 'gemini',
    text: 'Consider a short review first.',
  })
  for (const mock of [mocks.task, mocks.workflow, mocks.replan])
    mock.mockResolvedValue({ ok: true, message: 'Saved local command.' })
  changed = vi.fn()
  openTeam = vi.fn()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const selectedTask: TaskView = {
    id: 'private-id',
    title: 'PRIVATE_SELECTED_RECORD',
    score: 80,
    urgency: 84,
    academicValue: 72,
    careerValue: 50,
    goalAlignment: 80,
    neglectFactor: 30,
    workload: 25,
    consequence: 80,
    estimatedMinutes: 60,
    classLevel: '3000',
    assignmentType: 'project',
    status: 'open',
  }
  await act(async () =>
    root.render(
      <AdvisorScreen
        onChanged={changed}
        onOpenTeam={openTeam}
        selectedTask={selectedTask}
      />,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  )
  expect(button, `button ${text}`).toBeDefined()
  await act(async () => button!.click())
}

async function send(text: string) {
  const input = host.querySelector('textarea')!
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!
    set.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}

describe('Advisor interaction with mocked actions', () => {
  it('discloses Google processing and sends a schedule question without saving or attaching records', async () => {
    expect(host.textContent).toContain('processed by Google')
    await send('I have two hours on Tuesday. What should I prioritize?')
    expect(mocks.chat).toHaveBeenCalledExactlyOnceWith({
      prompt: 'I have two hours on Tuesday. What should I prioritize?',
      history: [],
    })
    expect(JSON.stringify(mocks.chat.mock.calls)).not.toContain('PRIVATE_SELECTED_RECORD')
    expect(mocks.task).not.toHaveBeenCalled()
    expect(mocks.workflow).not.toHaveBeenCalled()
    expect(mocks.replan).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Consider a short review first.')
  })

  it('keeps local score explanations out of Gemini context, but includes previous explicit chat turns', async () => {
    await click('Explain score')
    await send('Explain this score')
    expect(host.textContent).toContain('PRIVATE_SELECTED_RECORD is 80/100')
    await click('Ask Gemini')
    await send('I prefer morning study.')
    await send('What about breaks?')
    expect(mocks.chat.mock.calls[1][0]).toEqual({
      prompt: 'What about breaks?',
      history: [
        { role: 'user', text: 'I prefer morning study.' },
        { role: 'assistant', text: 'Consider a short review first.' },
      ],
    })
    expect(JSON.stringify(mocks.chat.mock.calls)).not.toContain('PRIVATE_SELECTED_RECORD')
  })

  it.each([
    ['Add homework', 'task'],
    ['Parse this syllabus: Homework December 10', 'syllabus'],
    ['Create an exam plan', 'exam'],
    ['Auto-reschedule my blocks', 'replan'],
  ])('requires approval before executing %j', async (prompt, command) => {
    await click('Local commands')
    await send(prompt)
    expect(mocks.task).not.toHaveBeenCalled()
    expect(mocks.workflow).not.toHaveBeenCalled()
    expect(mocks.replan).not.toHaveBeenCalled()
    expect(mocks.chat).not.toHaveBeenCalled()
    await click('Approve and apply')
    if (command === 'task') expect(mocks.task).toHaveBeenCalledOnce()
    else if (command === 'replan') expect(mocks.replan).toHaveBeenCalledWith('week')
    else expect(mocks.workflow).toHaveBeenCalledWith({ prompt, workflow: command })
    expect(changed).toHaveBeenCalledWith('Saved local command.')
  })

  it('cancels a proposed change without calling a mutation', async () => {
    await click('Local commands')
    await send('Add homework')
    await click('Cancel')
    expect(mocks.task).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Command cancelled')
  })

  it('keeps team navigation available without Google or a database write', async () => {
    await click('Team deliverables')
    expect(openTeam).toHaveBeenCalledOnce()
    expect(mocks.chat).not.toHaveBeenCalled()
  })

  it('shows a missing-key fallback and still accepts an approved local command', async () => {
    mocks.chat.mockResolvedValue({
      ok: false,
      code: 'unavailable',
      error: 'Gemini is not configured.',
    })
    await send('How should I study?')
    expect(host.textContent).toContain('Gemini is not configured')
    await click('Local commands')
    await send('Add homework')
    await click('Approve and apply')
    expect(mocks.task).toHaveBeenCalledOnce()
  })

  it('handles transport errors without a mutation', async () => {
    mocks.chat.mockRejectedValue(new Error('mock network failure'))
    await send('How should I study?')
    expect(host.textContent).toContain('chat connection failed')
    expect(mocks.task).not.toHaveBeenCalled()
  })

  it("clears the next request's Gemini context", async () => {
    await send('First question')
    await click('Clear chat')
    await send('New question')
    expect(mocks.chat.mock.calls[1][0].history).toEqual([])
  })
})
