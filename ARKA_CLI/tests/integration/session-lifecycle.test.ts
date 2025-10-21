import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  sessions: [] as any[],
  logs: [] as any[]
}

const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('../../src/client/socle-client.js', () => ({
  SocleClient: class {
    async validateWakeupConfig() {
      return
    }

    async createSession(wakeup: any) {
      const session = {
        id: `session-${state.sessions.length + 1}`,
        agentId: wakeup.agentId,
        profile: wakeup.profile,
        provider: wakeup.provider,
        status: 'active',
        terminalId: wakeup.terminal || null,
        parked: !wakeup.terminal,
        duration: 0
      }
      state.sessions.push(session)
      return session
    }

    async listSessions() {
      return [...state.sessions]
    }

    async getSession(sessionId: string) {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (!session) {
        throw new Error('session not found')
      }
      return {
        ...session,
        metadata: { project: 'demo' },
        lastEvents: state.logs
      }
    }

    async destroySession(sessionId: string) {
      state.sessions = state.sessions.filter((item) => item.id !== sessionId)
    }

    async assignTerminal(sessionId: string, terminalId: number) {
      const session = state.sessions.find((item) => item.id === sessionId)
      if (session) {
        session.terminalId = terminalId
        session.parked = false
      }
    }

    async getLogs(options: any) {
      return state.logs.filter((log) => !options.session || log.sessionId === options.session)
    }

    async streamLogs(options: any, callback: (log: any) => void) {
      const logs = await this.getLogs(options)
      logs.forEach(callback)
    }
  }
}))

import { createSession } from '../../src/commands/session/start.js'
import { sessionList } from '../../src/commands/session/list.js'
import { inspectSession } from '../../src/commands/session/inspect.js'
import { endSession } from '../../src/commands/session/stop.js'
import { sessionLogs } from '../../src/commands/session/attach.js'

const mockStdout = () => mockConsoleLog.mock.calls.flat().join('\n')

describe('session lifecycle commands', () => {
  beforeEach(() => {
    state.sessions = []
    state.logs = [
      { timestamp: new Date().toISOString(), level: 'info', source: 'agent', message: 'started', sessionId: 'session-1' }
    ]
    mockConsoleLog.mockClear()
  })

  it('creates, lists, inspects, logs and ends a session', async () => {
    await createSession({
      agent: 'agp',
      profile: 'governance',
      provider: 'claude',
      template: 'default',
      terminal: 2,
      simulate: false
    } as any)

    expect(state.sessions.length).toBe(1)
    const sessionId = state.sessions[0].id

    await sessionList({ json: true })
    expect(mockStdout()).toContain(sessionId)

    await inspectSession(sessionId, { json: true })
    expect(mockStdout()).toContain('"id":')

    await sessionLogs(sessionId, { tail: false })
    expect(mockStdout()).toContain('started')

    await endSession(sessionId)
    expect(state.sessions.length).toBe(0)
  })
})

