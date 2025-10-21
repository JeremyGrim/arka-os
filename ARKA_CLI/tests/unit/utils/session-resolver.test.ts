import { describe, it, expect, beforeEach } from 'vitest'
import { resolveSessionId } from '../../../src/utils/session-resolver.js'
import { CLIError, CLIErrorCode } from '../../../src/utils/errors.js'

interface MockSession {
  id: string
  status: string
}

class MockSocleClient {
  sessions: MockSession[] = []
  constructor(public existingSession?: MockSession) {}

  async listSessions(): Promise<MockSession[]> {
    return this.sessions
  }

  async getSession(sessionId: string): Promise<MockSession> {
    const match = this.sessions.find((session) => session.id === sessionId)
    if (!match) {
      throw new CLIError(CLIErrorCode.SESSION_NOT_FOUND, 'not found')
    }
    return match
  }
}

describe('resolveSessionId', () => {
  let client: MockSocleClient

  beforeEach(() => {
    client = new MockSocleClient()
    client.sessions = [
      { id: 'A', status: 'active' },
      { id: 'B', status: 'parked' }
    ]
  })

  it('returns explicit session when valid', async () => {
    const result = await resolveSessionId(client as any, { sessionId: 'A' })
    expect(result).toBe('A')
  })

  it('throws when explicit session not found', async () => {
    await expect(resolveSessionId(client as any, { sessionId: 'missing' })).rejects.toMatchObject({
      code: CLIErrorCode.SESSION_NOT_FOUND
    })
  })

  it('returns single active session when not provided', async () => {
    client.sessions = [{ id: 'ONLY', status: 'active' }]
    const result = await resolveSessionId(client as any)
    expect(result).toBe('ONLY')
  })

  it('throws when no active sessions available', async () => {
    client.sessions = [{ id: 'parked', status: 'stopped' }]
    await expect(resolveSessionId(client as any)).rejects.toMatchObject({
      code: CLIErrorCode.SESSION_NOT_FOUND
    })
  })

  it('throws when multiple active sessions are present', async () => {
    client.sessions = [
      { id: 'A', status: 'active' },
      { id: 'B', status: 'active' }
    ]
    await expect(resolveSessionId(client as any)).rejects.toMatchObject({
      code: CLIErrorCode.INVALID_PARAMS
    })
  })
})
