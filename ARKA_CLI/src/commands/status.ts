// src/commands/status.ts

import { Command } from 'commander'
import { SocleClient } from '../client/socle-client.js'
import { logger } from '../utils/logger.js'
import { formatStatus } from '../utils/formatter.js'
import { StatusOptions } from '../types/index.js'

export const statusCommand = new Command('status')
  .description('Show SOCLE and modules status')
  .option('--json', 'Output as JSON')
  .action(async (options: StatusOptions) => {
    try {
      await status(options)
    } catch (error) {
      logger.error('Status check failed:', error as Error)
      process.exit(1)
    }
  })

async function status(options: StatusOptions): Promise<void> {
  const client = new SocleClient()

  // Get status
  const socleState = await client.getSocleState()
  const modulesHealth = await client.getModulesHealth()
  const activeSessions = await client.getActiveSessions()
  const contextVersion = await client.getContextVersion()

  const statusData = {
    socle: {
      version: socleState.version,
      status: socleState.status,
      uptime: socleState.uptime
    },
    modules: modulesHealth,
    sessions: activeSessions,
    context: {
      version: contextVersion,
      lastUpdate: socleState.context?.timestamp
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(statusData, null, 2))
  } else {
    console.log(formatStatus(statusData))
  }
}
