// src/commands/session/list.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { formatSessionList } from '../../utils/formatter.js'
import { SessionListOptions } from '../../types/index.js'

export const sessionListCommand = new Command('list')
  .description('List active sessions')
  .option('--json', 'Output as JSON')
  .action(async (options: SessionListOptions) => {
    try {
      await sessionList(options)
    } catch (error) {
      logger.error('Session list failed:', error as Error)
      process.exit(1)
    }
  })

export async function sessionList(options: SessionListOptions): Promise<void> {
  const client = new SocleClient()

  const sessions = await client.listSessions()

  if (options.json) {
    console.log(JSON.stringify(sessions, null, 2))
  } else {
    console.log(formatSessionList(sessions))
  }
}

