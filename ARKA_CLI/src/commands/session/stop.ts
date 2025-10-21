// src/commands/session/stop.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { resolveSessionId } from '../../utils/session-resolver.js'

export const sessionEndCommand = new Command('end')
  .description('Stop a session')
  .argument('<session-id>', 'Session ID to stop')
  .action(async (sessionId: string) => {
    try {
      await endSession(sessionId)
    } catch (error) {
      logger.error('Session stop failed:', error as Error)
      process.exit(1)
    }
  })

export async function endSession(sessionId: string): Promise<void> {
  const client = new SocleClient()

  const targetSessionId = await resolveSessionId(client, {
    sessionId,
    requireActive: false
  })

  logger.info(`Stopping session ${targetSessionId}...`)

  await client.destroySession(targetSessionId)

  logger.success('Session stopped successfully')
}

