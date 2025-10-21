// src/utils/session-resolver.ts

import { SocleClient } from '../client/socle-client.js'
import { CLIError, CLIErrorCode } from './errors.js'

interface ResolveOptions {
  sessionId?: string
  requireActive?: boolean
}

export async function resolveSessionId(
  client: SocleClient,
  options: ResolveOptions = {}
): Promise<string> {
  const { sessionId, requireActive = true } = options

  if (sessionId) {
    await ensureSessionExists(client, sessionId, requireActive)
    return sessionId
  }

  const sessions = await client.listSessions()
  const candidates = requireActive
    ? sessions.filter((session) => session.status === 'active')
    : sessions

  if (candidates.length === 0) {
    throw new CLIError(
      CLIErrorCode.SESSION_NOT_FOUND,
      requireActive
        ? 'No active sessions found. Specify a session with --session.'
        : 'No sessions found.'
    )
  }

  if (candidates.length > 1) {
    const ids = candidates.map((session) => session.id).join(', ')
    throw new CLIError(
      CLIErrorCode.INVALID_PARAMS,
      `Multiple sessions match the criteria: ${ids}`,
      ['Use --session <id> to target a specific session']
    )
  }

  return candidates[0].id
}

async function ensureSessionExists(
  client: SocleClient,
  sessionId: string,
  requireActive: boolean
): Promise<void> {
  try {
    const session = await client.getSession(sessionId)
    if (requireActive && session.status !== 'active') {
      throw new CLIError(
        CLIErrorCode.INVALID_PARAMS,
        `Session ${sessionId} is not active`,
        ['Use --session with an active session', 'List active sessions: arka session list']
      )
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error
    }

    throw new CLIError(
      CLIErrorCode.SESSION_NOT_FOUND,
      `Session ${sessionId} not found`,
      ['List sessions: arka session list']
    )
  }
}
