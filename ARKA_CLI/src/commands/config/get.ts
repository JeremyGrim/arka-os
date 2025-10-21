// src/commands/config/get.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'

export const configGetCommand = new Command('get')
  .description('Get configuration value')
  .argument('[key]', 'Config key (all if omitted)')
  .action(async (key?: string) => {
    try {
      await configGet(key)
    } catch (error) {
      logger.error('Config get failed:', error as Error)
      process.exit(1)
    }
  })

async function configGet(key?: string): Promise<void> {
  const client = new SocleClient()

  const value = await client.getConfig(key)

  if (typeof value === 'object') {
    console.log(JSON.stringify(value, null, 2))
  } else {
    console.log(value)
  }
}
